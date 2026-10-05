import assert from 'node:assert/strict';
const event = () => ({
  listeners: [],
  addListener(fn) {
    this.listeners.push(fn);
  },
});
const sent = [];
const native = {
  onMessage: event(),
  onDisconnect: event(),
  postMessage(m) {
    sent.push(m);
  },
};
globalThis.chrome = {
  scripting: { executeScript: async () => [] },
  runtime: {
    id: 'test',
    getURL: (path) => 'chrome-extension://test/' + path,
    onConnect: event(),
    onMessage: event(),
    connectNative: () => native,
  },
  storage: {
    session: {
      get: async () => ({
        conversations: [
          [
            1,
            {
              key: 1,
              tabId: 1,
              id: 'restored',
              turnPending: true,
              questions: [{ id: 9 }],
              pendingQuestions: [9],
            },
          ],
        ],
      }),
      set: async () => {},
    },
  },
  sidePanel: { setPanelBehavior: async () => {} },
  tabs: {
    get: async (id) => ({ id, windowId: 1, url: 'https://example.test/' }),
    onRemoved: event(),
  },
  webNavigation: { onCommitted: event() },
};
chrome.runtime.onInstalled = event();
chrome.contextMenus = { onClicked: event() };
await import('../background.js');
await new Promise((resolve) => setTimeout(resolve, 0));
const messages = [],
  port = {
    name: 'chat',
    sender: { url: 'chrome-extension://test/ui/chat.html', id: 'test' },
    onMessage: event(),
    onDisconnect: event(),
    postMessage: (m) => messages.push(m),
  };
chrome.runtime.onConnect.listeners[0](port);
await port.onMessage.listeners[0]({ type: 'attach', tabId: 1 });
assert.deepEqual(messages[0].state.questions, []);
await port.onMessage.listeners[0]({
  type: 'ui',
  name: 'codexRpc',
  args: [{ id: 1, method: 'turn/start', params: {} }],
});
assert(sent.some((m) => m.message?.method === 'turn/start'));
console.log('PASS worker restart drops stale turn locks and approvals');

for (const [error, expected] of [
  ['Specified native messaging host not found.', 'bridge/helperMissing'],
  ['Native host has exited.', 'bridge/error'],
  ['Failed to start native messaging host.', 'bridge/error'],
]) {
  chrome.runtime.lastError = { message: error };
  native.onDisconnect.listeners[0]();
  assert.equal(messages.at(-1).value.method, expected);
  if (expected === 'bridge/error')
    assert.equal(messages.at(-1).value.params.messageKey, 'helperLaunchFailed');
}
console.log('PASS missing host vs exited/failed host classification');
