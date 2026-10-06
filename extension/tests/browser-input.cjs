const assert = require('node:assert/strict'),
  http = require('node:http'),
  fs = require('node:fs'),
  { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
(async () => {
  const server = http
    .createServer((req, res) => {
      if (req.url === '/document') {
        res.setHeader('Content-Type', 'application/pdf');
        res.end(fs.readFileSync(__dirname + '/fixtures/text.pdf'));
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (req.url === '/frame') {
        res.end(
          '<button id="inside" onclick="this.textContent=\'Frame clicked\'">Frame button</button><input placeholder="Frame input"><div contenteditable="true" aria-label="Frame editor"></div>',
        );
        return;
      }
      res.end(
        `<title>Input fixture</title><style>body{margin:20px}#canvas{width:180px;height:80px;background:#eee}iframe{display:block;width:420px;height:160px;border:0}#scroller{height:70px;width:240px;overflow:auto}#scroller div{height:600px}</style><button id="click" onclick="this.textContent='Clicked '+event.isTrusted">Click target</button><input id="name" placeholder="Name"><div id="editor" contenteditable="true" aria-label="Editor"></div><select id="select"><option value="a">Alpha</option><option value="b">Beta</option></select><input id="check" type="checkbox"><input id="range" type="range" value="10"><canvas id="canvas" width="180" height="80"></canvas><output id="result"></output><div id="scroller"><div>Scrollable area</div></div><div id="shadow"></div><iframe src="http://localhost:${server.address().port}/frame"></iframe><script>document.querySelector('#canvas').onpointerdown=e=>document.querySelector('#result').textContent='Canvas '+e.isTrusted;document.querySelector('#name').onkeydown=e=>{if(e.key==='Enter')document.querySelector('#result').textContent='Enter '+e.isTrusted};const sb=document.createElement('button');sb.textContent='Shadow button';sb.onclick=()=>sb.textContent='Shadow clicked';document.querySelector('#shadow').attachShadow({mode:'open'}).append(sb);</script>`,
      );
    })
    .listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const endpoint = process.env.CHROME_CDP || 'http://127.0.0.1:9341';
  const b = await chromium.connectOverCDP(endpoint, { noDefaults: true }),
    c = b.contexts()[0],
    page = await c.newPage();
  await page.goto(url);
  const control = await c.newPage();
  await control.goto('chrome-extension://lfbgkeagkfmndclpgmipadggnkoimkee/setup.html');
  const id = await control.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    url,
  );
  const run = (args) =>
    control.evaluate(
      async ({ id, args }) => {
        const { browserTool } = await import('./browser-tools.js');
        return browserTool({ tabId: id, scope: 'window' }, { tabId: id, ...args });
      },
      { id, args },
    );
  const pointers = () =>
    control.evaluate(async (id) => {
      return chrome.scripting.executeScript({
        target: { tabId: id, allFrames: true },
        func: () => {
          const state = globalThis.__bacAgentPointer;
          return state
            ? {
                x: parseFloat(state.cursor.style.left) + 2,
                y: parseFloat(state.cursor.style.top) + 2,
                hitTransparent: getComputedStyle(state.host).pointerEvents === 'none',
                hidden: state.host.getAttribute('aria-hidden'),
              }
            : null;
        },
      });
    }, id);
  let read = await run({ action: 'read' });
  const find = (text) => read.controls.find((x) => x.text === text).selector;
  await run({ action: 'click', selector: find('Click target') });
  assert.equal(await page.locator('#click').textContent(), 'Clicked true');
  const cursor = (await pointers()).find((p) => p.frameId === 0).result;
  const buttonBox = await page.locator('#click').boundingBox();
  assert(Math.abs(cursor.x - (buttonBox.x + buttonBox.width / 2)) < 2);
  assert(cursor.hitTransparent);
  assert.equal(cursor.hidden, 'true');
  console.log('PASS trusted selector click and non-intercepting pointer');
  await run({ action: 'type', selector: find('Name'), text: '\u6d4f\u89c8\u5668 works' });
  assert.equal(await page.locator('#name').inputValue(), '\u6d4f\u89c8\u5668 works');
  await run({ action: 'press', selector: find('Name'), key: 'Enter' });
  assert.equal(await page.locator('#result').textContent(), 'Enter true');
  await run({ action: 'type', selector: find('Editor'), text: 'editable text' });
  assert.equal(await page.locator('#editor').textContent(), 'editable text');
  console.log('PASS native text / contenteditable / Enter');
  await run({ action: 'select', selector: '#select', value: 'b' });
  await run({ action: 'check', selector: '#check', checked: true });
  assert.equal(await page.locator('#select').inputValue(), 'b');
  assert(await page.locator('#check').isChecked());
  await run({ action: 'click', selector: find('Shadow button') });
  assert.equal(await page.locator('#shadow button').textContent(), 'Shadow clicked');
  console.log('PASS dropdown / checkbox / open shadow DOM');
  const canvas = await page.locator('#canvas').boundingBox();
  await run({ action: 'click', x: canvas.x + 30, y: canvas.y + 20 });
  assert.equal(await page.locator('#result').textContent(), 'Canvas true');
  const range = await page.locator('#range').boundingBox();
  await run({
    action: 'drag',
    x: range.x + range.width * 0.1,
    y: range.y + range.height / 2,
    endX: range.x + range.width * 0.85,
    endY: range.y + range.height / 2,
  });
  assert(Number(await page.locator('#range').inputValue()) > 70);
  console.log('PASS coordinate click / pointer drag');
  await run({ action: 'scroll', selector: '#scroller', pixels: 180 });
  assert((await page.locator('#scroller').evaluate((el) => el.scrollTop)) >= 180);
  const frame = read.frames.find((f) => f.url.endsWith('/frame'));
  assert(frame && !frame.unavailable, JSON.stringify(read.frames));
  const inside = frame.controls.find((x) => x.text === 'Frame button');
  assert(inside.selector.startsWith('frame='));
  await run({ action: 'click', selector: inside.selector });
  assert.equal(await page.frameLocator('iframe').locator('#inside').textContent(), 'Frame clicked');
  const input = frame.controls.find((x) => x.text === 'Frame input');
  await run({ action: 'type', selector: input.selector, text: 'cross origin works' });
  assert.equal(
    await page.frameLocator('iframe').locator('input').inputValue(),
    'cross origin works',
  );
  assert((await pointers()).some((p) => p.frameId === frame.frameId && p.result));
  console.log('PASS cross-origin iframe read / click / native typing / pointer');
  await run({ action: 'read' });
  await assert.rejects(run({ action: 'click', selector: find('Name') }), /missing|ambiguous/);
  console.log('PASS stale selectors rejected');
  await run({ action: 'hover', x: 100, y: 40 });
  assert.equal((await pointers()).filter((p) => p.result).length, 1, 'One pointer across frames');
  await page.screenshot({ path: '/tmp/bac-agent-pointer.png' });
  const screenshot = await run({ action: 'screenshot' });
  assert(
    (await pointers()).every((p) => p.result === null),
    'Pointer excluded from screenshots',
  );
  await run({ action: 'hover', x: 110, y: 50 });
  await page.waitForTimeout(1750);
  assert(
    (await pointers()).every((p) => p.result === null),
    'Idle pointer removed',
  );
  assert(screenshot.viewport.width > 0);
  const png = Buffer.from(screenshot.data, 'base64');
  assert(png.readUInt32BE(16) >= screenshot.viewport.width);
  console.log('PASS screenshot CSS coordinate metadata');
  await assert.rejects(run({ action: 'click', x: -1, y: 10 }), /Coordinates/);
  const invalid = await control.evaluate(async (id) => {
    const { browserTool } = await import('./browser-tools.js');
    try {
      await browserTool({ tabId: id, scope: 'window' }, { action: 'read', tabId: 999999 });
      return false;
    } catch {
      return true;
    }
  }, id);
  assert(invalid);
  await run({ action: 'navigate', url: url + 'next' });
  await page.waitForURL(url + 'next', { waitUntil: 'commit', timeout: 10000 });
  await run({ action: 'back' });
  await page.waitForURL(url, { waitUntil: 'commit', timeout: 10000 });
  await run({ action: 'forward' });
  await page.waitForURL(url + 'next', { waitUntil: 'commit', timeout: 10000 });
  await run({ action: 'reload' });
  console.log('PASS back / forward / reload / bounds guards');
  await control.exposeFunction('readPdfBytes', (params) =>
    JSON.parse(
      execFileSync(
        process.env.PYTHON || 'python3',
        [
          '-c',
          'import sys,json;sys.path.insert(0,"extension/native");import attachments;p=json.load(sys.stdin);print(json.dumps(attachments.read_pdf(p["data"],p["page"],p["offset"])))',
        ],
        { input: JSON.stringify(params), encoding: 'utf8' },
      ),
    ),
  );
  await page.goto(url + 'document');
  assert.equal((await run({ action: 'context' })).contentType, 'application/pdf');
  const pdf = await control.evaluate(async (id) => {
    const { browserTool } = await import('./browser-tools.js');
    return browserTool(
      { tabId: id, scope: 'window' },
      { action: 'read', page: 1 },
      window.readPdfBytes,
    );
  }, id);
  assert.equal(pdf.pages, 1);
  assert(pdf.text.includes('Read directly from PDF.'));
  assert.equal(pdf.contentType, 'application/pdf');
  assert.equal(page.url(), url + 'document');
  await run({ action: 'screenshot' });
  await run({ action: 'scroll', pixels: 200 });
  console.log(
    'PASS native PDF without .pdf suffix: context, direct text read, screenshot and scrolling',
  );
  await page.close({ runBeforeUnload: true });
  await control.close({ runBeforeUnload: true });
  server.close();
  console.log('ALL INPUT CHECKS PASS');
  process.exit();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
