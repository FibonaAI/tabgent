import assert from 'node:assert/strict';
import { browserTool } from '../browser-tools.js';
const owner = { id: 1, windowId: 10, url: 'https://example.test/', incognito: false };
let scripts = 0;
globalThis.chrome = {
  runtime: { getURL: (p) => 'chrome-extension://test/' + p },
  tabs: { get: async () => owner, query: async () => [owner] },
  scripting: {
    executeScript: async () => {
      scripts++;
    },
  },
  debugger: {
    attach: async () => {
      throw Error('Already attached');
    },
  },
};
await assert.rejects(
  browserTool({ tabId: 1, scope: 'window' }, { action: 'screenshot' }),
  /Already attached/,
);
assert.equal(scripts, 0, 'Native input must not inject obsolete overlay code');
await assert.rejects(
  browserTool({ tabId: 1, scope: 'window' }, { action: 'read', tabId: 2 }),
  /outside/,
);
await assert.rejects(
  browserTool({ tabId: 1, scope: 'window' }, { action: 'navigate', url: 'javascript:alert(1)' }),
  /HTTP/,
);
console.log('PASS screenshot failure / no overlay injection / restricted tab / URL guards');

owner.url = 'chrome://new-tab-page/';
assert.equal(
  (await browserTool({ tabId: 1, scope: 'window' }, { action: 'read' })).protected,
  true,
);
await assert.rejects(
  browserTool({ tabId: 1, scope: 'window' }, { action: 'click', x: 10, y: 10 }),
  /internal pages/,
);
chrome.tabs.update = async (id, change) => ({ ...owner, ...change });
assert.equal(
  (
    await browserTool(
      { tabId: 1, scope: 'window' },
      { action: 'navigate', url: 'https://example.test/' },
    )
  ).url,
  'https://example.test/',
);
console.log('PASS native new tab allows navigation while protecting its internal UI');
