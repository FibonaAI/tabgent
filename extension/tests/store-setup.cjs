// Exercise the real setup page in an isolated extension; no account or network calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tabgent-store-setup-'));
  let browser;
  try {
    const extension = path.join(temp, 'extension');
    fs.mkdirSync(extension);
    for (const name of ['setup.html', 'setup.js', 'i18n.js', 'release.json'])
      fs.copyFileSync(path.join(root, name), path.join(extension, name));
    fs.cpSync(path.join(root, '_locales'), path.join(extension, '_locales'), { recursive: true });
    const { key } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
    fs.writeFileSync(
      path.join(extension, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: 'Setup test',
        version: '1',
        key,
        default_locale: 'en',
        background: { service_worker: 'worker.js' },
      }),
    );
    fs.writeFileSync(
      path.join(extension, 'worker.js'),
      'chrome.runtime.onInstalled.addListener(() => {});',
    );
    browser = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1000, height: 850 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = browser.serviceWorkers()[0] || (await browser.waitForEvent('serviceworker'));
    const url = new URL('setup.html', worker.url()).href;
    const page = await browser.newPage();
    for (const [connectorUrl, visible] of [
      [null, false],
      ['https://example.com/download', true],
      ['javascript:alert(1)', false],
    ]) {
      fs.writeFileSync(path.join(extension, 'release.json'), JSON.stringify({ connectorUrl }));
      await page.goto(url + '?case=' + visible + String(connectorUrl));
      await page.waitForFunction(() => document.body.style.visibility !== 'hidden');
      // Wait for the module's fetch and its DOM update to finish.
      await page.evaluate(async () => {
        await import('./setup.js');
      });
      assert.equal(await page.locator('#connectorDownload').isVisible(), visible);
      assert.equal(await page.locator('#connectorUnavailable').isVisible(), !visible);
      assert.equal(await page.locator('#installSource').isVisible(), !visible);
      assert.equal(await page.locator('#installDownload').isVisible(), visible);
      if (visible) {
        assert.equal(await page.locator('#connectorDownload').getAttribute('href'), connectorUrl);
        await page.screenshot({ path: path.join(os.tmpdir(), 'tabgent-store-setup.png') });
      }
      assert(
        (await page.locator('body').innerText()).includes('not processed only on your computer'),
      );
      assert(!(await page.locator('body').innerText()).includes('$i18n{'));
    }
    console.log('PASS setup download, unavailable state, unsafe URL rejection and data disclosure');
  } finally {
    await browser?.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
