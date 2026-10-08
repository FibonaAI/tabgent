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
          '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/vendor/katex/katex.min.css"><link rel="stylesheet" href="/vendor/highlight/github.css"><link rel="stylesheet" href="/vendor/highlight/github-dark.css" media="(prefers-color-scheme: dark)"><link rel="stylesheet" href="/ui/chat.css"><main style="padding:24px"><div class="message agent" id="fixture"></div></main>',
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
    const python = 'def greet(name):\n    # Say hello\n    return "Hello " + name\n';
    await render('```python\n' + python + '```');
    assert.equal(await page.locator('pre code').textContent(), python);
    assert.equal(await page.locator('pre code').getAttribute('class'), 'language-python');
    assert(await page.locator('.hljs-keyword').count());
    assert(await page.locator('.hljs-string').count());
    assert(await page.locator('.hljs-comment').count());
    const color = () =>
      page
        .locator('.hljs-keyword')
        .first()
        .evaluate((el) => getComputedStyle(el).color);
    await page.emulateMedia({ colorScheme: 'light' });
    const light = await color();
    await page.screenshot({ path: '/tmp/tabgent-code-light.png' });
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.notEqual(await color(), light);
    await page.screenshot({ path: '/tmp/tabgent-code-dark.png' });
    await render('```js\nconst value = "<img src=x onerror=alert(1)>";\n```');
    assert(await page.locator('.hljs-keyword').count());
    assert.equal(await page.locator('pre img, pre script').count(), 0);
    assert((await page.locator('pre code').textContent()).includes('<img src=x onerror=alert(1)>'));
    await render('```python\ndef unfinished(');
    assert.equal(await page.locator('pre code').textContent(), 'def unfinished(\n');
    await render('```unknown-language\nplain <text>\n```\n\n`const inline = 1`');
    assert.equal(await page.locator('pre code').textContent(), 'plain <text>\n');
    assert.equal(await page.locator('[class^="hljs-"]').count(), 0);
    const structured = async (language, source) => {
      await render('```' + language + '\n' + source + '\n```');
      await page.evaluate(async () => {
        const { addStructuredView } = await import('/ui/structured-code.js');
        const pre = document.querySelector('pre');
        const heading = document.createElement('div');
        pre.before(heading);
        addStructuredView(pre.parentElement, heading, pre, pre.querySelector('code'), (key) => key);
      });
      await page.locator('.structured-toggle').click();
    };
    await structured(
      'json',
      '{"user":{"name":"<img src=x onerror=alert(1)>"},"list":[1,true,null]}',
    );
    assert(await page.locator('pre').isHidden());
    await page.getByText('user: {1}', { exact: true }).click();
    await page.getByText('name: "<img src=x onerror=alert(1)>"', { exact: true }).waitFor();
    assert.equal(await page.locator('.structured-tree img').count(), 0);
    await page.locator('.structured-toggle').click();
    assert(await page.locator('pre').isVisible());
    assert(await page.locator('.structured-all').isHidden());
    await page.locator('.structured-toggle').click();
    assert(
      await page.getByText('name: "<img src=x onerror=alert(1)>"', { exact: true }).isVisible(),
    );
    await structured('yaml', 'user:\n  name: Alex\n  active: true\ntags: [one, two]');
    await page.getByText('user: {2}', { exact: true }).click();
    await page.getByText('name: "Alex"', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'expandAll', exact: true }).click();
    assert.equal(await page.locator('.structured-tree details:not([open])').count(), 0);
    assert(await page.getByText('1: "two"', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'collapseAll', exact: true }).click();
    assert.equal(await page.locator('.structured-tree details[open]').count(), 0);
    await page.getByRole('button', { name: 'expandAll', exact: true }).click();
    assert(await page.getByText('name: "Alex"', { exact: true }).isVisible());
    await page.screenshot({ path: '/tmp/tabgent-structured.png' });
    await structured('yml', 'loop: &loop\n  self: *loop');
    await page.getByText('loop: {1}', { exact: true }).click();
    await page.getByText('self: structuredReference', { exact: true }).waitFor();
    await structured('json', '{"unfinished":');
    assert(await page.locator('pre').isVisible());
    assert(await page.locator('.structured-toggle').isDisabled());
    console.log(
      'PASS math, code highlighting, aliases, exact code text, streaming, fallback and untrusted content',
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
