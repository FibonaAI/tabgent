import assert from 'node:assert/strict';
const event = () => ({
  listeners: [],
  addListener(fn) {
    this.listeners.push(fn);
  },
});
const native = { onMessage: event(), onDisconnect: event(), postMessage() {} };
globalThis.chrome = {
  runtime: {
    id: 'test',
    getURL: (p) => 'chrome-extension://test/' + p,
    onConnect: event(),
    onMessage: event(),
    connectNative: () => native,
  },
  scripting: { executeScript: async () => [] },
  storage: { session: { get: async () => ({}), set: async () => {} } },
  sidePanel: { setPanelBehavior: async () => {} },
  tabs: {
    get: async (id) => ({ id, windowId: 1, url: 'https://example.test/' }),
    onRemoved: event(),
  },
  webNavigation: { onCommitted: event(), getFrame: async () => ({ documentId: 'current' }) },
};
chrome.runtime.onInstalled = event();
chrome.contextMenus = { onClicked: event() };
await import('../background.js');
await new Promise((r) => setTimeout(r, 0));
async function attach(id) {
  const messages = [],
    port = {
      name: 'chat',
      sender: { url: 'chrome-extension://test/ui/chat.html', id: 'test' },
      onMessage: event(),
      onDisconnect: event(),
      postMessage: (m) => messages.push(m),
    };
  chrome.runtime.onConnect.listeners[0](port);
  await port.onMessage.listeners[0]({ type: 'attach', tabId: id });
  return { port, messages };
}
const one = await attach(1),
  two = await attach(2);
const source = {
  id: 'test',
  tab: { id: 1 },
  frameId: 4,
  documentId: 'current',
  url: 'https://frame.test/article',
};
const message = {
  type: 'pageSelection',
  tabId: 2,
  text: 'quotation',
  title: 'Frame',
  selectionId: 'selected-range',
};
const call = (m, s) =>
  new Promise((resolve) => chrome.runtime.onMessage.listeners[0](m, s, resolve));
await call(message, source);
const selected = one.messages.at(-1).value;
assert.equal(selected.text, 'quotation');
assert.equal(selected.url, source.url);
assert.equal(two.messages.length, 1, 'Cannot attach to a tab supplied by page content');
await one.port.onMessage.listeners[0]({
  type: 'ui',
  name: 'codexClearSelection',
  args: ['outdated'],
});
assert.equal(one.messages.at(-1).value, selected);
await one.port.onMessage.listeners[0]({
  type: 'ui',
  name: 'codexClearSelection',
  args: [selected.id],
});
assert.equal(one.messages.at(-1).value, null);
assert((await call(message, { ...source, documentId: 'old' })).error);
assert((await call(message, { ...source, tab: { id: 1, incognito: true } })).error);
await call(message, source);
const clear = { type: 'pageSelectionCleared', selectionId: 'selected-range' };
await call({ ...clear, selectionId: 'old-range' }, source);
assert.equal(one.messages.at(-1).value.text, 'quotation');
await call(clear, { ...source, frameId: 9 });
assert.equal(one.messages.at(-1).value.text, 'quotation');
assert((await call(clear, { ...source, documentId: 'old' })).error);
await call(clear, source);
assert.equal(one.messages.at(-1).value, null);
assert.equal(two.messages.length, 1, 'Clear must stay in the originating tab');
await call(message, source);
await chrome.webNavigation.onCommitted.listeners[0]({ tabId: 1, frameId: 4 });
assert.equal(one.messages.at(-1).value, null);
console.log(
  'PASS owner routing / source URL / clear identity / stale and private rejection / frame navigation clears',
);
