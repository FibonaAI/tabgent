// Real chat UI with a controlled bridge; never signs out or changes real credentials.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const bridge = `
const listeners=new Map();
const mode=new URL(location.href).searchParams.get('mode');
if(!sessionStorage.started){sessionStorage.started='1';sessionStorage.installed=String(mode!=='install');sessionStorage.helper=String(mode!=='helper');sessionStorage.auth=String(['selection','transcript'].includes(mode));sessionStorage.draft='keep my draft';}
let authenticated=sessionStorage.auth==='true';
const emit=(method,params={})=>listeners.get('codex-message')?.({method,params});
export const bridge={threadId:null,send(name,args=[]){
 if(name==='codexConnect'&&mode==='native-failure'){setTimeout(()=>emit('bridge/error',{messageKey:'helperLaunchFailed'}),0);return;}
 if(name==='codexConnect')setTimeout(()=>emit(sessionStorage.helper!=='true'?'bridge/helperMissing':sessionStorage.installed!=='true'?'bridge/error':'bridge/ready',sessionStorage.installed!=='true'?{messageKey:'bridgeInstall'}:{}),0);
 if(name==='codexCheckAuth'&&sessionStorage.auth==='true'&&!authenticated)emit('bridge/authChanged');
 if(name==='codexOpenSetupUrl'||name==='helperHelp')window.setupTest.actions.push({name,args});
 if(name==='codexRpc'){
 const m=args[0];if(m.id===undefined)return;window.setupTest.requests.push(m);
 if(m.method==='turn/start'){window.setupTest.params=m.params;window.setupTest.input=m.params.input;if(window.setupTest.failSend){setTimeout(()=>emit('unused'),0);setTimeout(()=>listeners.get('codex-message')?.({id:m.id,error:{message:'Test send failure'}}),0);return;}}
 if(m.method==='account/login/start'&&mode==='timeout'&&!sessionStorage.retry)return;
 let result={};
 if(m.method==='skills/list')result={data:[{cwd:'/project',errors:[],skills:[{name:'review',path:'/skills/review/SKILL.md',description:'Review a change',enabled:true}]}]};
 if(m.method==='thread/goal/get')result={goal:null};
 if(m.method==='thread/goal/set')result={goal:{objective:m.params.objective||'Test goal',status:m.params.status||'active',tokensUsed:0,timeUsedSeconds:0}};
 if(m.method==='turn/start')result={turn:{id:'test-turn'}};
 if(m.method==='account/read')result={account:authenticated?{type:'chatgpt'}:null,requiresOpenaiAuth:true};
 if(m.method==='account/login/start')result={loginId:'test-login',authUrl:'https://auth.openai.com/test-only'};
 if(m.method==='model/list')result={data:[{model:'test-model',displayName:'Test model',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'medium'}]}]};
 if(m.method==='bridge/attachment/save')result={path:'/uploads/'+m.params.name};
 if(m.method==='thread/start'||m.method==='thread/resume')result={thread:{id:'test-thread',turns:[]}};
 setTimeout(()=>listeners.get('codex-message')?.({id:m.id,result}),0);
 }
}};
window.setupTest={emit,requests:[],actions:[],context(value){listeners.get('codex-context')?.(value);},select(value){listeners.get('codex-selection')?.(value);},install(){sessionStorage.installed='true';sessionStorage.helper='true';},externalLogin(){sessionStorage.auth='true';},complete(){authenticated=true;sessionStorage.auth='true';emit('account/login/completed',{success:true,loginId:'test-login'});},fail(){emit('account/login/completed',{success:false,loginId:'test-login'});}};
export async function newConversation(){}
export async function openAgentTab(){window.setupTest.actions.push({name:'openAgent'})}
export async function startBridge(){if(mode==='attach-failure')throw Error('Missing tab');}
export function addWebUiListener(name,fn){listeners.set(name,fn)}
export function bindThread(id){bridge.threadId=id}
export function saveViewDraft(text){sessionStorage.draft=text}
export function readViewDraft(){return sessionStorage.draft||''}
export function scopePreference(){return 'window'}
export function saveScopePreference(){}
`;
(async () => {
  const server = http
    .createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/bridge.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(bridge);
      }
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      try {
        res.setHeader(
          'Content-Type',
          file.endsWith('.js')
            ? 'text/javascript'
            : file.endsWith('.css')
              ? 'text/css'
              : 'text/html',
        );
        res.end(fs.readFileSync(file));
      } catch {
        res.writeHead(404);
        res.end();
      }
    })
    .listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH,
  });
  const messages = JSON.parse(fs.readFileSync(root + '/_locales/en/messages.json'));
  try {
    for (const mode of [
      'transcript',
      'attach-failure',
      'selection',
      'native-failure',
      'helper',
      'install',
      'signin',
      'external',
      'waiting-external',
      'focus-external',
      'timeout',
    ]) {
      const context = await browser.newContext();
      await context.addInitScript((messages) => {
        window.chrome = {
          i18n: {
            getMessage: (key, substitutions = []) =>
              key === '@@bidi_dir'
                ? 'ltr'
                : (messages[key]?.message || key).replace(
                    /\$(\d+)/g,
                    (_, n) => substitutions[Number(n) - 1] ?? '',
                  ),
            getUILanguage: () => 'en',
          },
        };
      }, messages);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/ui/chat.html?mode=' + mode);
      if (mode === 'transcript') {
        await page.waitForFunction(
          () => document.querySelector('#connection').dataset.state === 'ready',
        );
        await page.locator('#prompt').fill('/');
        await page
          .locator('#commandMenu')
          .getByRole('option')
          .filter({ hasText: '/skills' })
          .click();
        await page.keyboard.press('ArrowDown');
        await page
          .locator('#commandMenu')
          .getByRole('option')
          .filter({ hasText: 'review' })
          .click();
        assert.equal(await page.locator('#prompt').inputValue(), '$review ');
        await page.locator('#prompt').fill('$review Check this page');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => setupTest.input?.some((x) => x.type === 'skill'));
        assert.deepEqual(
          await page.evaluate(() => setupTest.input.find((x) => x.type === 'skill')),
          { type: 'skill', name: 'review', path: '/skills/review/SKILL.md' },
        );
        await page.evaluate(() => {
          const emit = (method, params) =>
            setupTest.emit(method, { threadId: 'test-thread', turnId: 'test-turn', ...params });
          emit('turn/started', { turn: { id: 'test-turn' } });
          emit('item/started', { item: { id: 'r', type: 'reasoning', summary: [] } });
          emit('item/reasoning/summaryTextDelta', {
            itemId: 'r',
            summaryIndex: 0,
            delta: '**Checking the page**\nLooking for evidence.',
          });
          emit('item/completed', { item: { id: 'r', type: 'reasoning', summary: [] } });
          emit('turn/plan/updated', {
            plan: [
              { step: 'Read page', status: 'completed' },
              { step: 'Compare evidence', status: 'inProgress' },
            ],
          });
          emit('item/started', {
            item: {
              id: 'tool',
              type: 'mcpToolCall',
              server: 'browser',
              tool: 'read',
              arguments: { tabId: 1 },
            },
          });
          emit('item/mcpToolCall/progress', { itemId: 'tool', message: 'Reading visible text' });
          emit('item/completed', {
            item: {
              id: 'tool',
              type: 'mcpToolCall',
              server: 'browser',
              tool: 'read',
              arguments: { tabId: 1 },
              status: 'completed',
              result: { content: [{ type: 'text', text: 'Evidence from page' }] },
            },
          });
        });
        assert(await page.locator('.worklog').isVisible());
        assert((await page.locator('.worklog').innerText()).includes('Checking the page'));
        await page.locator('#prompt').fill('Focus on the introduction');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => setupTest.requests.some((r) => r.method === 'turn/steer'));
        await page.evaluate(() => {
          setupTest.emit('item/completed', {
            threadId: 'test-thread',
            item: {
              id: 'a',
              type: 'agentMessage',
              phase: 'final_answer',
              text: '## Findings\n\n- First finding\n- Second finding\n\n| Page | Result |\n| --- | --- |\n| Intro | Verified |\n\n<script>alert(1)</script><img src="https://example.test/tracker">',
            },
          });
          setupTest.emit('thread/tokenUsage/updated', {
            threadId: 'test-thread',
            tokenUsage: {
              last: { totalTokens: 100 },
              total: { totalTokens: 200 },
              modelContextWindow: 1000,
            },
          });
          setupTest.emit('turn/completed', {
            threadId: 'test-thread',
            turn: { id: 'test-turn', status: 'completed' },
          });
        });
        await page.waitForFunction(() => !document.body.classList.contains('busy'));
        assert.equal(await page.locator('.worklog').getAttribute('open'), null);
        await page.locator('.message.agent table').waitFor();
        assert.equal(await page.locator('.message.agent table').count(), 1);
        assert.equal(await page.locator('.message.agent script, .message.agent img').count(), 0);
        assert((await page.locator('#contextUsage').innerText()).startsWith('90%'));
        await page.locator('.worklog > summary').click();
        await page.locator('#prompt').fill('/goal Test goal');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !document.querySelector('#goal').hidden);
        assert((await page.locator('#goal').innerText()).includes('Test goal'));
        await page.setViewportSize({ width: 440, height: 850 });
        await page.screenshot({ path: '/tmp/bac-transcript-narrow.png' });
        await page.locator('#prompt').fill('/');
        await page.screenshot({ path: '/tmp/bac-commands-narrow.png' });
        assert.equal(errors.length, 0, errors.join('\n'));
        await context.close();
        console.log(
          'PASS transcript, Markdown safety, skill input, steering, goal, command keyboard and compact work log',
        );
        continue;
      }
      if (mode === 'attach-failure') {
        await page.waitForFunction(
          () => document.querySelector('#connection').dataset.state === 'failed',
        );
        assert.equal(await page.locator('#reconnect').isVisible(), true);
        assert.equal(
          await page.locator('#connection').textContent(),
          messages.connectionFailed.message,
        );
        assert(
          !(await page
            .locator('body')
            .innerText()
            .then((t) => t.includes('$i18n{'))),
        );
        await context.close();
        console.log('PASS attachment failure shows a localized reconnect action');
        continue;
      }
      if (mode === 'selection') {
        await page.waitForFunction(
          () => document.querySelector('#connection').dataset.state === 'ready',
        );
        await page.locator('#openAgent').click();
        assert(await page.evaluate(() => setupTest.actions.some((a) => a.name === 'openAgent')));
        await page.evaluate(() =>
          setupTest.context({ page: { title: 'New Tab', url: 'https://example.test/' } }),
        );
        const iconBox = await page.locator('#context svg').boundingBox();
        const labelBox = await page.locator('#contextText').boundingBox();
        assert(labelBox.x - iconBox.x - iconBox.width <= 8, 'Keep page icon and title together');
        assert(
          (await page.locator('#context').boundingBox()).width < 110,
          'Short titles must not stretch',
        );
        await page.locator('#context').click();
        assert.equal(await page.locator('#contextFullTitle').textContent(), 'New Tab');
        assert(await page.locator('#contextDetails').isVisible());
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#contextDetails').isVisible(), false);
        await page.setViewportSize({ width: 390, height: 720 });
        const controls = await Promise.all(
          ['#attach', '#model', '#effort', '#scope', '#context'].map((selector) =>
            page.locator(selector).boundingBox(),
          ),
        );
        const centers = controls.map((box) => box.y + box.height / 2);
        assert(
          Math.max(...centers) - Math.min(...centers) < 1,
          'Toolbar stays aligned on one line',
        );
        assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
        await page.setViewportSize({ width: 1280, height: 720 });
        const quote = {
          id: 'quote-1',
          title: 'Source page',
          url: 'https://example.test/article',
          text: 'Selected words <b>remain text</b>',
        };
        await page.evaluate((value) => setupTest.select(value), quote);
        assert.equal(await page.locator('#selectionText').textContent(), quote.text);
        assert.equal(await page.locator('#selectionText b').count(), 0);
        await page.locator('#selectionRemove').click();
        assert.equal(await page.locator('#selection').isVisible(), false);
        await page.evaluate((value) => {
          setupTest.select(value);
          setupTest.failSend = true;
        }, quote);
        await page.locator('#prompt').fill('Explain this');
        await page.locator('#send').click();
        await page.waitForFunction(
          () => document.querySelector('#prompt').value === 'Explain this',
        );
        assert.equal(await page.locator('#selection').isVisible(), true);
        await page.locator('#attachmentFiles').setInputFiles({
          name: 'test.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEn8AAAAASUVORK5CYII=',
            'base64',
          ),
        });
        await page.waitForFunction(() => document.querySelectorAll('.attachment').length === 1);
        assert.equal(await page.locator('.attachment img').count(), 1);
        const thumbnail = page.locator('.attachment img');
        await thumbnail.click();
        assert(await page.locator('#imagePreview').isVisible());
        assert.equal(
          await page.locator('#imagePreviewOriginal').getAttribute('src'),
          await thumbnail.getAttribute('src'),
        );
        await page.locator('#imagePreviewOriginal').focus();
        await page.keyboard.press('Enter');
        assert.equal(
          await page.locator('#imagePreviewOriginal').getAttribute('aria-pressed'),
          'true',
        );
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#imagePreview').isVisible(), false);

        await page.locator('#send').click();
        await page.waitForFunction(
          () =>
            document.querySelector('#prompt').value === 'Explain this' &&
            !document.querySelector('#send').hidden,
        );
        assert.equal(await page.locator('.attachment').count(), 1);
        await page.evaluate(() => {
          for (const type of ['paste', 'drop']) {
            const data = new DataTransfer();
            data.items.add(new File(['attachment text'], type + '.txt', { type: 'text/plain' }));
            document.querySelector('.composer').dispatchEvent(
              type === 'paste'
                ? new ClipboardEvent('paste', {
                    clipboardData: data,
                    bubbles: true,
                    cancelable: true,
                  })
                : new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
            );
          }
        });
        await page.waitForFunction(() => document.querySelectorAll('.attachment').length === 3);
        await page.evaluate(() => (setupTest.failSend = false));
        await page.locator('#send').click();
        await page.waitForFunction(() => document.querySelector('#selection').hidden);
        const input = await page.evaluate(() => setupTest.input);
        assert.equal(input[1].text, 'Explain this');
        const bubble = page.locator('.message.user').last();
        assert.equal(await bubble.locator('blockquote > div').textContent(), quote.text);
        assert.equal(await bubble.locator('blockquote b').count(), 0);
        assert.equal(await bubble.locator('blockquote a').getAttribute('href'), quote.url);
        assert.equal(await bubble.evaluate((el) => el.firstElementChild.tagName), 'BLOCKQUOTE');
        assert.equal(await bubble.evaluate((el) => el.children[1].textContent), 'Explain this');
        assert(input.find((x) => x.type === 'text' && x.text.includes(quote.text)));
        assert(input.some((x) => x.type === 'localImage' && x.path === '/uploads/test.png'));
        assert.equal(
          (await page.evaluate(() => setupTest.params)).additionalContext.pageSelection.kind,
          'untrusted',
        );
        assert.equal(await page.locator('#attachments').isVisible(), false);
        assert.deepEqual(errors, []);
        console.log(
          'PASS selection preview / remove / send failure retains / send attaches quote and source',
        );
        await context.close();
        continue;
      }
      if (mode === 'native-failure') {
        await page.waitForFunction(
          () => document.querySelector('#connection').dataset.state === 'disconnected',
        );
        assert.equal(await page.locator('#setup').isVisible(), false);
        assert.equal(await page.locator('#reconnect').isVisible(), true);
        assert(
          await page
            .locator('body')
            .innerText()
            .then((text) => text.includes(messages.helperLaunchFailed.message)),
        );
        assert.deepEqual(errors, []);
        console.log('PASS native startup failure does not show install guidance');
        await context.close();
        continue;
      }
      const install = ['helper', 'install'].includes(mode);
      await page.waitForFunction(
        (expected) => document.querySelector('#setup').dataset.mode === expected,
        install ? 'install' : 'signin',
      );
      assert.equal(await page.locator('#send').isEnabled(), false);
      if (install) {
        assert.equal(
          await page.locator('#setupTitle').textContent(),
          messages[mode === 'helper' ? 'helperTitle' : 'setupInstallTitle'].message,
        );
        await page.locator('#setupPrimary').click();
        const action = await page.evaluate(() => setupTest.actions.at(-1));
        assert.equal(action.name, mode === 'helper' ? 'helperHelp' : 'codexOpenSetupUrl');
        const start = Date.now();
        await page.evaluate(() => setupTest.install());
        await page.waitForFunction(
          () => document.querySelector('#setup').dataset.mode === 'signin',
          {},
          { timeout: 6500 },
        );
        assert(Date.now() - start < 3000, 'Installation recovery should take less than 3 seconds');
        console.log(
          'PASS ' +
            mode +
            ' guidance → auto-detect installation in ' +
            (Date.now() - start) +
            ' ms',
        );
      }
      if (mode === 'timeout') {
        await page.clock.install();
        await page.locator('#setupPrimary').click();
        await page.clock.fastForward(90001);
        await page.waitForFunction(
          () =>
            document.querySelector('#setup').dataset.mode === 'signin' &&
            !document.querySelector('#setupError').hidden,
        );
        assert.equal(await page.locator('#setupPrimary').isEnabled(), true);
        await page.evaluate(() => {
          sessionStorage.retry = 'true';
        });
        console.log('PASS stalled login RPC times out, restores sign-in button and allows retry');
      }
      if (mode !== 'external') {
        await page.locator('#setupPrimary').click();
        await page.waitForFunction(
          () => document.querySelector('#setup').dataset.mode === 'waiting',
        );
        if (mode === 'signin') {
          await page.evaluate(() => setupTest.fail());
          await page.waitForFunction(
            () => document.querySelector('#setup').dataset.mode === 'signin',
          );
          assert.equal(await page.locator('#setupError').isVisible(), true);
          await page.locator('#setupPrimary').click();
          await page.waitForFunction(
            () => document.querySelector('#setup').dataset.mode === 'waiting',
          );
        }
      }
      const start = Date.now();
      await page.evaluate(
        (external) => (external ? setupTest.externalLogin() : setupTest.complete()),
        mode.includes('external'),
      );
      if (mode === 'focus-external')
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(
        () => document.querySelector('#connection').dataset.state === 'ready',
        {},
        { timeout: 6500 },
      );
      assert.equal(await page.locator('#setup').isVisible(), false);
      assert.equal(await page.locator('#prompt').inputValue(), 'keep my draft');
      assert.equal(await page.locator('#send').isEnabled(), true);
      assert.deepEqual(errors, []);
      assert(
        Date.now() - start < (mode === 'focus-external' ? 1000 : 3000),
        'Login recovery should be prompt',
      );
      console.log(
        'PASS ' +
          mode +
          ' → ready automatically in ' +
          (Date.now() - start) +
          ' ms; draft preserved',
      );
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
