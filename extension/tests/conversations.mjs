import assert from 'node:assert/strict';
const event = () => ({
  listeners: [],
  addListener(fn) {
    this.listeners.push(fn);
  },
  async emit(...args) {
    for (const fn of this.listeners) await fn(...args);
  },
});
const tabs = new Map([[1, { id: 1, windowId: 1, url: 'https://example.test/' }]]);
let nextTab = 1,
  saved = {},
  behavior;
const sent = [];
const closedPanels = [];
const panelOptions = [];
const native = { onMessage: event(), onDisconnect: event(), postMessage: (m) => sent.push(m) };
globalThis.chrome = {
  runtime: {
    id: 'test',
    getURL: (p) => 'chrome-extension://test/' + p,
    onConnect: event(),
    onMessage: event(),
    onInstalled: event(),
    connectNative: () => native,
  },
  storage: { session: { get: async () => ({}), set: async (v) => Object.assign(saved, v) } },
  sidePanel: {
    close: async (options) => {
      closedPanels.push(options);
    },
    setPanelBehavior: async (v) => {
      behavior = v;
    },
    setOptions: async (options) => {
      panelOptions.push(options);
    },
  },
  tabs: {
    get: async (id) => {
      if (!tabs.has(id)) throw Error('Missing tab');
      return tabs.get(id);
    },
    create: async (o) => {
      const t = { id: ++nextTab, windowId: 1, ...o };
      tabs.set(t.id, t);
      return t;
    },
    update: async (id, v) => Object.assign(tabs.get(id), v),
    onActivated: event(),
    onRemoved: event(),
  },
  scripting: { executeScript: async () => [] },
  webNavigation: { onCommitted: event() },
  contextMenus: { onClicked: event() },
};
await import('../background.js');
await new Promise((r) => setTimeout(r, 0));
assert.equal(behavior.openPanelOnActionClick, true);
const call = (m) =>
  new Promise((resolve) =>
    chrome.runtime.onMessage.listeners[0](
      m,
      { id: 'test', url: chrome.runtime.getURL('ui/chat.html') },
      resolve,
    ),
  );
async function attach(tabId, viewId, url = 'chrome-extension://test/ui/chat.html') {
  const messages = [];
  const p = {
    name: 'chat',
    sender: { url, id: 'test', ...(viewId ? { tab: tabs.get(viewId), frameId: 0 } : {}) },
    onMessage: event(),
    onDisconnect: event(),
    postMessage: (m) => messages.push(m),
  };
  await chrome.runtime.onConnect.emit(p);
  await p.onMessage.emit({ type: 'attach', tabId });
  return { p, messages, send: (m) => p.onMessage.emit(m) };
}
const [sidebar, concurrent] = await Promise.all([attach(1), attach(1)]);
assert.equal(saved.conversations.length, 1, 'Concurrent views create one session');
await sidebar.send({ type: 'draft', text: 'Concurrent draft' });
assert.equal(concurrent.messages.at(-1).value, 'Concurrent draft');
const invalid = await attach(99999);
assert.equal(invalid.messages.at(-1).type, 'attachError');
const webSender = await attach(1, undefined, 'https://example.test/');
assert.equal(webSender.messages.at(-1).type, 'attachError');
assert.equal(saved.conversations.length, 1);
await sidebar.send({ type: 'bind', threadId: 'thread-one' });
const full = concurrent;
await sidebar.send({ type: 'ui', name: 'codexContext' });
assert.equal(sidebar.messages.at(-1).value.page.id, 1);
await sidebar.send({ type: 'draft', text: 'Shared draft' });
assert.equal(full.messages.at(-1).value, 'Shared draft');
await full.send({ type: 'draft', text: 'Edited in full view' });
assert.equal(sidebar.messages.at(-1).value, 'Edited in full view');
await full.send({
  type: 'ui',
  name: 'codexAttachments',
  args: [[{ name: 'image.png', path: '/tmp/image', image: true }]],
});
assert.equal(sidebar.messages.at(-1).name, 'codex-attachments');
const session = saved.conversations[0][1];
await full.send({
  type: 'ui',
  name: 'codexRpc',
  args: [{ id: 11, method: 'turn/start', params: {} }],
});
await native.onMessage.emit({
  session: session.id,
  message: {
    id: 901,
    method: 'item/tool/call',
    params: { tool: 'browser', arguments: { action: 'context' } },
  },
});
await new Promise((resolve) => setTimeout(resolve, 0));
const fullContext = sent.find((m) => m.message?.id === 901).message.result;
assert.equal(JSON.parse(fullContext.contentItems[0].text).page.id, 1);
await native.onMessage.emit({ session: session.id, message: { method: 'turn/completed' } });

await native.onMessage.emit({
  session: session.id,
  message: { method: 'item/agentMessage/delta', params: { itemId: 'answer', delta: 'Hello' } },
});
assert.equal(sidebar.messages.at(-1).value.params.delta, 'Hello');
assert.equal(full.messages.at(-1).value.params.delta, 'Hello');
await sidebar.send({ type: 'ui', name: 'codexScope', args: ['browser'] });
const copiedSettings = { model: 'test-model', effort: 'high', mode: 'plan' };
const fresh = await call({
  type: 'newConversation',
  conversationKey: 1,
  windowId: 1,
  settings: copiedSettings,
});
assert.equal(tabs.get(fresh.tabId).url, chrome.runtime.getURL('ui/chat.html'));
const freshView = await attach(fresh.tabId, fresh.tabId);
const freshState = freshView.messages[0].state;
assert.equal(freshState.threadId, undefined);
assert.equal(freshState.draft, '');
assert.deepEqual(freshState.attachments, []);
assert.equal(freshState.scope, 'browser');
assert.deepEqual(freshState.settings, copiedSettings);
assert.notEqual(freshState.conversationKey, 1);
await freshView.send({ type: 'ui', name: 'codexContext' });
assert.equal(freshView.messages.at(-1).value.page.id, 1);
await freshView.send({ type: 'bind', threadId: 'fresh-thread' });
assert.equal((await attach(1)).messages[0].state.threadId, 'thread-one');
const freshSession = saved.conversations.find(([key]) => key === freshState.conversationKey)[1];
tabs.delete(fresh.tabId);
await chrome.tabs.onRemoved.emit(fresh.tabId);
assert(
  sent.some((m) => m.op === 'close' && m.session === freshSession.id),
  'Closing a fresh Agent tab releases its independent session',
);
assert(!sent.some((m) => m.op === 'close' && m.session === session.id));
await native.onMessage.emit({
  session: session.id,
  message: { id: 77, method: 'item/commandExecution/requestApproval', params: {} },
});
const late = await attach(1);
assert.equal(late.messages[0].state.questions[0].id, 77);
await full.send({
  type: 'ui',
  name: 'codexRpc',
  args: [{ id: 77, result: { decision: 'decline' } }],
});
await sidebar.send({
  type: 'ui',
  name: 'codexRpc',
  args: [{ id: 77, result: { decision: 'decline' } }],
});
assert.equal(sent.filter((m) => m.op === 'rpc' && m.message.id === 77).length, 1);
assert.equal(late.messages.at(-1).name, 'codex-question-answered');
const opened = await call({ type: 'openAgent', conversationKey: 1, windowId: 1 });
assert.equal(tabs.get(opened.tabId).url, chrome.runtime.getURL('ui/chat.html'));
const mirrored = await attach(1, opened.tabId);
assert.equal(mirrored.messages[0].state.threadId, 'thread-one');
await mirrored.send({ type: 'ui', name: 'codexContext' });
assert.equal(mirrored.messages.at(-1).value.page.id, 1);
await mirrored.send({ type: 'draft', text: 'Synced from tab' });
assert.equal(sidebar.messages.at(-1).value, 'Synced from tab');
const separateSidebar = await attach(opened.tabId);
assert.equal(separateSidebar.messages[0].state.threadId, undefined);
await separateSidebar.send({ type: 'ui', name: 'codexContext' });
assert.equal(separateSidebar.messages.at(-1).value.page.id, opened.tabId);
tabs.delete(1);
await chrome.tabs.onRemoved.emit(1);
assert(!sent.some((m) => m.op === 'close' && m.session === session.id));
assert.equal((await attach(opened.tabId, opened.tabId)).messages[0].state.threadId, 'thread-one');
tabs.delete(opened.tabId);
await chrome.tabs.onRemoved.emit(opened.tabId);
assert(sent.some((m) => m.op === 'close' && m.session === session.id));
assert.equal(panelOptions.length, 0);
assert.equal(closedPanels.length, 0);
console.log(
  'PASS shared Agent tab / original page context / independent sidebar / draft sync / close lifecycle',
);

const { startBridge, newConversation } = await import('../bridge.js');
let portListener;
const uiCalls = [];
chrome.runtime.connect = () => ({
  onMessage: {
    addListener(fn) {
      portListener = fn;
    },
  },
  onDisconnect: event(),
  postMessage() {
    portListener({ type: 'attached', state: { windowId: 2, conversationKey: 10 } });
  },
});
globalThis.location = { href: chrome.runtime.getURL('ui/chat.html') };
chrome.runtime.sendMessage = async (m) => {
  uiCalls.push(m);
  return {};
};
chrome.tabs.getCurrent = async () => undefined;
chrome.tabs.query = async () => [{ id: 10 }];
chrome.tabs.onActivated = event();
chrome.windows = { getCurrent: async () => ({ id: 2 }) };
let openedWindow;
chrome.sidePanel.open = async (options) => {
  openedWindow = options.windowId;
};
await startBridge();
await newConversation(copiedSettings);
assert.equal(openedWindow, undefined);
assert.deepEqual(uiCalls.at(-1), {
  type: 'newConversation',
  windowId: 2,
  conversationKey: 10,
  settings: copiedSettings,
});
console.log('PASS independent Agent tab dispatch with inherited settings');

chrome.runtime.connect = () => ({
  onMessage: {
    addListener(fn) {
      portListener = fn;
    },
  },
  onDisconnect: event(),
  postMessage() {
    portListener({ type: 'attachError', message: 'Missing tab' });
  },
});
await assert.rejects(startBridge(), /Missing tab/);
console.log('PASS attach failures reject instead of hanging');
