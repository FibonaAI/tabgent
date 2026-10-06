const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http
    .createServer((req, res) => {
      if (req.url === '/') {
        res.end(
          '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/vendor/katex/katex.min.css"><link rel="stylesheet" href="/ui/chat.css"><main style="padding:24px"><div class="message agent" id="fixture"></div></main>',
        );
        return;
      }
      const file = path.resolve(root, '.' + req.url);
      if (!file.startsWith(root + '/') || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader(
        'Content-Type',
        {
          '.js': 'text/javascript',
          '.mjs': 'text/javascript',
          '.css': 'text/css',
          '.woff2': 'font/woff2',
        }[path.extname(file)] || 'application/octet-stream',
      );
      res.end(fs.readFileSync(file));
    })
    .listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 400, height: 500 },
      deviceScaleFactor: 2,
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const render = async (text) =>
      page.evaluate(async (text) => {
        const { markdownFragment } = await import('/ui/markdown.js');
        document.querySelector('#fixture').replaceChildren(markdownFragment(text));
      }, text);
    const equation = String.raw`V^\pi(s)=\mathbb E_\pi[r+\gamma V^\pi(s')]`;
    await render(`写成公式：\n\n\\[\n${equation}\n\\]\n\n行内公式：\\(x^2 + y^2\\)。`);
    assert.equal(await page.locator('.katex-display').count(), 1);
    assert.equal(await page.locator('.katex').count(), 2);
    assert.equal((await page.locator('annotation').first().textContent()).trim(), equation.trim());
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: '/tmp/tabgent-math-preview.png',
      clip: { x: 0, y: 0, width: 400, height: 180 },
    });
    await render('Inline $x^2$ and $y$; prices $5 and $10.\n\n$$\\frac{1}{2}$$');
    assert.equal(await page.locator('.katex').count(), 3);
    assert((await page.locator('#fixture').textContent()).includes('$5 and $10'));
    await render('`$x$`\n\n```tex\n\\[x^2\\]\n```\n\n\\$5');
    assert.equal(await page.locator('.katex').count(), 0);
    assert.equal(await page.locator('pre code').textContent(), '\\[x^2\\]\n');
    await render(String.raw`\[\begin{pmatrix}1&2\\3&4\end{pmatrix}\]`);
    assert.equal(await page.locator('.katex-error').count(), 0);
    await render('Before \\[x^2');
    assert.equal(await page.locator('.katex').count(), 0);
    await render('Before \\[x^2\\] after');
    assert.equal(await page.locator('.katex').count(), 1);
    await render(
      String.raw`$\href{javascript:alert(1)}{bad}$ <img src=x onerror=alert(1)> $\includegraphics{https://example.test/leak}$`,
    );
    assert.equal(
      await page.locator('#fixture img, #fixture script, #fixture a[href^="javascript:"]').count(),
      0,
    );
    await render(String.raw`$\frac{1}{$`);
    assert.equal(await page.locator('.katex-error').count(), 1);
    console.log(
      'PASS display/inline math, fonts, currency, code fences, streaming, matrices, untrusted TeX and invalid syntax',
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
