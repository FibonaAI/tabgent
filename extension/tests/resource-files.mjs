import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pageResource, saveResource, downloadStatus } from '../resource-files.js';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.setContent(
    '<base href="https://example.test/"><script src="app.js"></script><img src="photo.png"><pre id="code">const answer = 42;</pre><canvas id="canvas"></canvas>',
  );
  const resources = await page.evaluate(pageResource, { action: 'resources' });
  assert(resources.resources.some((r) => r.url === 'https://example.test/app.js'));
  assert.equal(
    (await page.evaluate(pageResource, { action: 'saveResource', selector: 'img' })).url,
    'https://example.test/photo.png',
  );
  const text = await page.evaluate(pageResource, {
    action: 'saveResource',
    selector: '#code',
    format: 'text',
  });
  assert(decodeURIComponent(text.url).endsWith('const answer = 42;'));
  assert(
    (
      await page.evaluate(pageResource, { action: 'saveResource', selector: '#canvas' })
    ).url.startsWith('data:image/png'),
  );
  await assert.rejects(
    page.evaluate(pageResource, { action: 'saveResource', url: 'https://other.test/secret' }),
  );
  let options;
  const storage = {};
  globalThis.chrome = {
    scripting: { executeScript: async () => [{ result: text }] },
    storage: { session: { set: async (v) => Object.assign(storage, v), get: async () => storage } },
    downloads: {
      download: async (value) => {
        options = value;
        return 42;
      },
      search: async () => [
        { state: 'complete', filename: '/Downloads/Tabgent/code.js', bytesReceived: 18 },
      ],
    },
  };
  const session = { threadId: 'owner' };
  const saved = await saveResource(1, { filename: 'code.js' }, async () => {}, session);
  assert.equal(saved.path, '/Downloads/Tabgent/code.js');
  assert.equal(options.conflictAction, 'uniquify');
  assert.equal(options.filename, 'Tabgent/code.js');
  await assert.rejects(saveResource(1, { filename: '../escape' }, async () => {}, session));
  await assert.rejects(downloadStatus(42, { threadId: 'other' }));
  chrome.downloads.search = async () => [{ state: 'interrupted', error: 'SERVER_FORBIDDEN' }];
  await assert.rejects(downloadStatus(42, session), /SERVER_FORBIDDEN/);
  console.log(
    'PASS resource discovery, JS/image/canvas/text export, download result and failure, path/scope guards',
  );
} finally {
  await browser.close();
}
