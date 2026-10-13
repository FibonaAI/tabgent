const { chromium } = require('playwright');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  http = require('http'),
  assert = require('assert');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabgent-download-'));
  let context;
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end('const savedValue = 42;');
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<script src="/app.js"></script><pre id="code">hello 中文</pre>');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const ext = path.join(dir, 'ext');
    fs.mkdirSync(ext);
    fs.copyFileSync('extension/resource-files.js', path.join(ext, 'resource-files.js'));
    fs.writeFileSync(
      path.join(ext, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: 'Resource test',
        version: '1',
        permissions: ['downloads', 'scripting', 'storage'],
        host_permissions: ['http://127.0.0.1/*'],
        background: { service_worker: 'worker.js', type: 'module' },
      }),
    );
    fs.writeFileSync(
      path.join(ext, 'worker.js'),
      "import {saveResource} from './resource-files.js'; globalThis.saveResource=saveResource;",
    );
    context = await chromium.launchPersistentContext(path.join(dir, 'profile'), {
      channel: 'chromium',
      headless: true,
      acceptDownloads: true,
      downloadsPath: path.join(dir, 'downloads'),
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    const saved = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
      return saveResource(
        tab.id,
        { action: 'saveResource', url: tab.url + 'app.js', filename: 'source.js' },
        async () => {},
        { threadId: 'test' },
      );
    });
    assert.equal(saved.state, 'complete');
    assert.equal(fs.readFileSync(saved.path, 'utf8'), 'const savedValue = 42;');
    console.log('PASS real Chrome downloads API saves exact JS bytes');
    const text = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
      return saveResource(
        tab.id,
        { action: 'saveResource', selector: '#code', format: 'text', filename: '中文.txt' },
        async () => {},
        { threadId: 'test' },
      );
    });
    assert.equal(fs.readFileSync(text.path, 'utf8'), 'hello 中文');
    console.log('PASS real Chrome element text download preserves Unicode');
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.id = 'blob';
      a.href = URL.createObjectURL(new Blob(['blob contents'], { type: 'text/plain' }));
      document.body.append(a);
    });
    const blob = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
      return saveResource(
        tab.id,
        { action: 'saveResource', selector: '#blob', filename: 'blob.txt' },
        async () => {},
        { threadId: 'test' },
      );
    });
    assert.equal(fs.readFileSync(blob.path, 'utf8'), 'blob contents');
    console.log('PASS browser-owned blob resource download');
  } finally {
    await context?.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
