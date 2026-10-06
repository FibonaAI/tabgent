const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bac-pdf-'));
  const ext = path.join(temp, 'extension');
  fs.mkdirSync(ext);
  for (const name of ['pdf', 'vendor', '_locales'])
    fs.cpSync('extension/' + name, ext + '/' + name, { recursive: true });
  for (const name of [
    'pdf-routing.js',
    'browser-tools.js',
    'browser-input.js',
    'agent-pointer.js',
    'i18n.js',
  ])
    fs.copyFileSync('extension/' + name, ext + '/' + name);
  const manifest = JSON.parse(fs.readFileSync('extension/manifest.json'));
  delete manifest.action;
  delete manifest.icons;
  delete manifest.side_panel;
  delete manifest.content_scripts;
  manifest.permissions = [
    'tabs',
    'scripting',
    'webNavigation',
    'storage',
    'debugger',
    'declarativeNetRequestWithHostAccess',
  ];
  fs.writeFileSync(ext + '/manifest.json', JSON.stringify(manifest));
  fs.writeFileSync(ext + '/setup.html', '<!doctype html><title>PDF fixture control</title>');
  fs.writeFileSync(
    ext + '/background.js',
    `import { startPdfRouting, isCurrentPdfSender } from './pdf-routing.js';
import { browserTool } from './browser-tools.js';
startPdfRouting(); let selection;
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  if(m.type==='pageSelection') isCurrentPdfSender(s).then(valid=>{selection={...m,valid};});
  if(m.type==='pageSelectionCleared') selection=null;
  if(m.type==='selection'){reply(selection);return;}
  if(m.type==='test'){browserTool({tabId:m.tabId,scope:'window'},m.args).then(reply,e=>reply({error:e.message}));return true;}
});`,
  );
  const pdf = fs.readFileSync(__dirname + '/fixtures/text.pdf');
  const server = http
    .createServer((req, res) => {
      if (req.url === '/html') {
        res.end('<title>HTML fixture</title>Ordinary page');
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.end(req.url === '/broken' ? 'not a PDF' : pdf);
    })
    .listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launchPersistentContext(temp + '/profile', {
      channel: 'chromium',
      headless: true,
      args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext],
      acceptDownloads: true,
    });
    const ctl = await browser.newPage();
    await ctl.goto('chrome-extension://lfbgkeagkfmndclpgmipadggnkoimkee/setup.html');
    for (let i = 0; i < 100; i++) {
      if ((await ctl.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).length) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('VIEWER', e.message));
    await page.goto(base + '/paper?download=no&token=fixture');
    await page.waitForURL('**/pdf/viewer.html?**');
    const viewer = page.frameLocator('#viewer');
    await viewer.locator('.textLayer span').first().waitFor({ timeout: 20000 });
    const id = await ctl.evaluate(
      async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id,
      page.url(),
    );
    const run = (args) =>
      ctl.evaluate(({ tabId, args }) => chrome.runtime.sendMessage({ type: 'test', tabId, args }), {
        tabId: id,
        args,
      });
    const context = await run({ action: 'context' });
    assert.equal(context.page.url, base + '/paper?download=no&token=fixture');
    const read = await run({ action: 'read', page: 1 });
    assert(read.text?.includes('Read directly from PDF.'), JSON.stringify(read));
    assert.equal(read.pages, 1);
    const shot = await run({ action: 'screenshot' });
    assert(shot.data, JSON.stringify(shot));
    assert((await run({ action: 'scroll', pixels: 10 })).success);
    assert((await run({ action: 'scroll', pixels: -10 })).success);
    assert(
      await page.evaluate(() => !!globalThis.__bacAgentPointer?.host.isConnected),
      'PDF.js shows the Agent pointer',
    );
    // Real text-layer selection, not a fabricated message.
    await viewer
      .locator('.textLayer span')
      .first()
      .evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await page.waitForTimeout(250);
    const quote = await ctl.evaluate(() => chrome.runtime.sendMessage({ type: 'selection' }));
    assert(quote?.text.includes('PDF native selection test'), JSON.stringify(quote));
    assert.equal(quote.locator.page, 1);
    assert(quote.valid, 'PDF quote passes production sender validation');
    assert(quote.locator.rects[0].pdf.length === 4);
    await page.bringToFront();
    await viewer.locator('.textLayer span').first().click();
    await page.waitForTimeout(250);
    assert.equal(await ctl.evaluate(() => chrome.runtime.sendMessage({ type: 'selection' })), null);
    assert(
      (await run({ action: 'selectText', page: 1, text: 'Read directly from PDF.', occurrence: 2 }))
        .error,
    );
    assert((await run({ action: 'selectText', page: 1, text: 'Read directly from PDF.' })).success);
    assert((await run({ action: 'highlight', page: 1, text: 'Read directly from PDF.' })).success);
    await viewer.locator('.highlightEditor').first().waitFor({ timeout: 5000 });
    const downloaded = page.waitForEvent('download');
    assert((await run({ action: 'savePdf' })).success);
    const download = await downloaded;
    const file = await download.path();
    assert(
      fs.readFileSync(file).includes(Buffer.from('/Subtype /Highlight')),
      'Highlight persisted in downloaded PDF',
    );
    await page.screenshot({ path: '/tmp/bac-pdf-viewer.png' });
    console.log(
      'PASS PDF automatic redirect, original context, reading, live quote with coordinates, Agent selection/highlight and annotated export',
    );
    // Fallback bypass must only affect this tab and URL, with no redirect loop.
    page.on('dialog', (d) => d.accept());
    await page.locator('#native').click();
    await page.waitForURL(base + '/paper?download=no&token=fixture');
    await page.waitForTimeout(300);
    assert.equal(page.url(), base + '/paper?download=no&token=fixture');
    const other = await browser.newPage();
    await other.goto(base + '/paper?download=no&token=fixture');
    await other.waitForURL('**/pdf/viewer.html?**');
    await other.goto(base + '/broken');
    await other.waitForURL(base + '/broken', { timeout: 20000 });
    await other.waitForTimeout(500);
    assert.equal(other.url(), base + '/broken');
    await other.goto(base + '/html');
    assert.equal(other.url(), base + '/html');
    console.log(
      'PASS manual fallback, failed PDF automatic fallback, no loops, other-tab isolation, normal HTML unaffected',
    );
  } finally {
    await browser?.close();
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
