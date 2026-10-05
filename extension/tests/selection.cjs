const assert = require('node:assert/strict'),
  path = require('path'),
  { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<p id="quote">Selected article text</p><input id="password" type="password" value="never capture"><textarea id="composer"></textarea><iframe srcdoc="<p id=quote>Frame quote</p>"></iframe>',
    );
    async function setup(frame) {
      await frame.evaluate(() => {
        globalThis.captured = [];
        globalThis.chrome = { runtime: { sendMessage: async (m) => captured.push(m) } };
      });
      await frame.addScriptTag({ path: path.resolve(__dirname, '../selection-content.js') });
    }
    async function select(frame) {
      await frame.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('#quote'));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('pointerup'));
      });
    }
    await setup(page);
    await select(page);
    assert.equal((await page.evaluate(() => captured))[0].text, 'Selected article text');
    await page.locator('#composer').focus();
    assert.equal(await page.evaluate(() => captured.length), 1);
    await page.evaluate(() => {
      document.activeElement.blur();
      getSelection().removeAllRanges();
      document.dispatchEvent(new Event('pointerup'));
    });
    assert.equal(await page.evaluate(() => captured.at(-1).type), 'pageSelectionCleared');
    assert.equal(
      await page.evaluate(() => captured.at(-1).selectionId === captured[0].selectionId),
      true,
    );
    await select(page);
    assert.equal(await page.evaluate(() => captured.length), 3);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
      getSelection().removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => captured.length), 3, 'Sidebar focus must retain quote');
    await page.evaluate(() => {
      delete document.hasFocus;
    });
    await select(page);
    await page.locator('#password').focus();
    await select(page);
    assert.equal(await page.evaluate(() => captured.length), 3);
    await page.evaluate(() => {
      document.activeElement.blur();
      document.querySelector('#quote').textContent = 'x'.repeat(22000);
    });
    await select(page);
    const last = await page.evaluate(() => captured.at(-1));
    assert.equal(last.text.length, 20000);
    assert.equal(last.truncated, true);
    await page.evaluate(() => {
      document.querySelector('#quote').textContent = 'repeat repeat';
    });
    for (const offset of [0, 7])
      await page.evaluate((offset) => {
        const text = document.querySelector('#quote').firstChild,
          r = document.createRange();
        r.setStart(text, offset);
        r.setEnd(text, offset + 6);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        document.dispatchEvent(new Event('pointerup'));
      }, offset);
    const pairs = await page.evaluate(() => captured.slice(-2));
    assert.equal(pairs[0].text, pairs[1].text);
    assert.equal(pairs[0].locator.start.offset, 0);
    assert.equal(pairs[1].locator.start.offset, 7);
    assert(pairs[1].locator.rect.width > 0);
    assert(pairs[1].locator.element.path.includes('p:nth-child(1)'));
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await setup(frame);
    await select(frame);
    assert.equal((await frame.evaluate(() => captured))[0].text, 'Frame quote');
    console.log(
      'PASS text selection / focus retention / reselection / password exclusion / length cap / iframe',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
