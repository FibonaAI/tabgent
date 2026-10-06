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
const linkCalls = [];
const native = {
  onMessage: event(),
  onDisconnect: event(),
  postMessage(message) {
    sent.push(message);
    if (message.message?.method === 'bridge/thread/link') {
      linkCalls.push(message.message.params);
      queueMicrotask(() =>
        native.onMessage.emit({
          session: message.session,
          message: { id: message.message.id, result: {} },
        }),
      );
    }
  },
};
globalThis.chrome = {
  runtime: {
    id: 'test',
    getURL: (p) => 'chrome-extension://test/' + p,
    onConnect: event(),
    onMessage: event(),
    onInstalled: event(),
    connectNative: () => native,
  },
  storage: {
    local: { get: async () => ({}), set: async () => {} },
    session: { get: async () => ({}), set: async (v) => Object.assign(saved, v) },
  },
  sidePanel: {
    open: async () => {},
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
    onCreated: event(),
    onActivated: event(),
    onRemoved: event(),
  },
  scripting: { executeScript: async () => [] },
  webNavigation: { onCommitted: event(), onCreatedNavigationTarget: event() },
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
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(linkCalls.length, 0, 'Agent + copies settings without creating lineage');
assert.equal(
  saved.conversations.find(([key]) => key === freshState.conversationKey)[1].parent,
  undefined,
);
const historyList = await call({ type: 'urlHistory', conversationKey: 1 });
assert.equal(historyList.entries.length, 2, 'Both chats belong to the same URL');
assert(
  !(await call({ type: 'switchHistory', conversationKey: 1, threadId: 'fresh-thread' })).error,
);
assert.equal((await attach(1)).messages[0].state.threadId, 'fresh-thread');
assert(
  (
    await call({
      type: 'switchHistory',
      conversationKey: freshState.conversationKey,
      threadId: 'unrelated',
    })
  ).error,
);
assert(
  !(
    await call({
      type: 'switchHistory',
      conversationKey: freshState.conversationKey,
      threadId: 'thread-one',
    })
  ).error,
);
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

// Browser + remains a root even if Chrome supplies opener metadata.
const rootTab = await chrome.tabs.create({ url: 'chrome://newtab/', openerTabId: 1 });
await chrome.tabs.onCreated.emit(rootTab);
const rootView = await attach(rootTab.id);
await rootView.send({ type: 'bind', threadId: 'new-root-thread' });
assert.equal(saved.conversations.find(([key]) => key === rootTab.id)[1].parent, undefined);
assert.equal(linkCalls.length, 0);

// Browser links and explicit conversation links retain their actual parent.
linkCalls.length = 0;
const origin = await chrome.tabs.create({ url: 'https://parent.test/' });
const originView = await attach(origin.id);
await originView.send({ type: 'bind', threadId: 'parent-thread' });
const childTab = await chrome.tabs.create({ url: 'https://child.test/', openerTabId: origin.id });
await chrome.tabs.onCreated.emit(childTab);
for (let i = 0; i < 2; i++)
  await chrome.webNavigation.onCreatedNavigationTarget.emit({
    sourceTabId: origin.id,
    tabId: childTab.id,
  });
let childSession = saved.conversations.find(([key]) => key === childTab.id)[1];
assert.equal(childSession.parent.threadId, 'parent-thread');
tabs.delete(origin.id);
await chrome.tabs.onRemoved.emit(origin.id);
assert(
  saved.conversations.some(([key]) => key === origin.id),
  'Keep pending parent until link is durable',
);
await native.onMessage.emit({
  session: childSession.id,
  message: { method: 'bridge/ready', params: { threadId: 'child-thread' } },
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(linkCalls.length, 1, 'Duplicate Chrome creation events do not duplicate notes');
assert.equal(linkCalls[0].parentThreadId, 'parent-thread');
assert.equal(linkCalls[0].childThreadId, 'child-thread');
assert(
  !saved.conversations.some(([key]) => key === origin.id),
  'Closed parent released after durable link',
);
const clone = await call({
  type: 'newConversation',
  conversationKey: childTab.id,
  settings: copiedSettings,
});
const cloneView = await attach(childTab.id, clone.tabId);
await cloneView.send({ type: 'bind', threadId: 'full-agent-thread' });
const cloneKey = saved.agentViews.find(([tabId]) => tabId === clone.tabId)[1];
const linked = await call({
  type: 'openConversationLink',
  conversationKey: cloneKey,
  url: 'https://linked.test/',
  active: false,
});
childSession = saved.conversations.find(([key]) => key === linked.tabId)[1];
assert.equal(
  childSession.parent.threadId,
  'full-agent-thread',
  'Use conversation owner, not companion tab thread',
);
assert.equal(tabs.get(linked.tabId).active, false, 'Modified clicks preserve background opening');
await native.onMessage.emit({
  session: childSession.id,
  message: { method: 'bridge/ready', params: { threadId: 'linked-thread' } },
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  linkCalls.find((link) => link.childThreadId === 'linked-thread').parentThreadId,
  'full-agent-thread',
);
// Only known relatives can open; the existing Agent tab is reused.
const relatedView = await attach(childTab.id);
await relatedView.send({
  type: 'ui',
  name: 'codexRpc',
  args: [{ id: 900, method: 'bridge/thread/relations' }],
});
const relationRequest = sent.at(-1);
await native.onMessage.emit({
  session: relationRequest.session,
  message: {
    id: relationRequest.message.id,
    result: {
      parents: [{ threadId: 'parent-thread' }],
      children: [{ threadId: 'full-agent-thread' }, { threadId: 'child-thread' }],
    },
  },
});
assert.equal(relatedView.messages.at(-1).value.result.parents[0].threadId, 'parent-thread');

chrome.windows = { update: async () => ({}) };
const relatedOpened = await call({
  type: 'openRelatedThread',
  conversationKey: childTab.id,
  threadId: 'full-agent-thread',
});
assert.equal(relatedOpened.tabId, clone.tabId);
assert(
  (await call({ type: 'openRelatedThread', conversationKey: childTab.id, threadId: 'unrelated' }))
    .error,
);
const beforeFocus = tabs.size;
const pageOpened = await call({
  type: 'openRelatedThread',
  conversationKey: childTab.id,
  threadId: 'child-thread',
});
assert.equal(
  pageOpened.tabId,
  childTab.id,
  'Focus the original webpage instead of an Agent mirror',
);
assert.equal(tabs.size, beforeFocus, 'Do not create a duplicate tab');
const restored = await call({
  type: 'openRelatedThread',
  conversationKey: childTab.id,
  threadId: 'parent-thread',
});
assert(!restored.error, restored.error);
const restoredSession = saved.conversations.find(
  ([, s]) => s.threadId === 'parent-thread' && s.viewOnly,
)?.[1];
assert(restoredSession, 'Restore the original thread instead of creating a new one');
assert.equal(
  restoredSession.noCompanion,
  true,
  'Do not attach unrelated pages to a restored conversation',
);
const repeated = await call({
  type: 'openRelatedThread',
  conversationKey: childTab.id,
  threadId: 'parent-thread',
});
assert.equal(repeated.tabId, restored.tabId, 'Reuse the restored tab');
const noOpener = await chrome.tabs.create({ url: 'https://noopener.test/' });
await chrome.webNavigation.onCreatedNavigationTarget.emit({
  sourceTabId: childTab.id,
  tabId: noOpener.id,
});
assert.equal(
  saved.conversations.find(([key]) => key === noOpener.id)[1].parent.threadId,
  'child-thread',
);
assert(
  (
    await call({
      type: 'openConversationLink',
      conversationKey: cloneKey,
      url: 'javascript:alert(1)',
    })
  ).error,
);
console.log(
  'PASS reciprocal lineage routing / duplicate events / closed parent / full Agent source / noopener / URL validation',
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
