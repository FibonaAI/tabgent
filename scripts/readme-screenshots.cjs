// Run real tasks through the production extension and its installed native connector.
// Requires signed-in Codex. Uses a disposable Chrome profile, never a test bridge.
// TABGENT_EXAMPLE=pdf TABGENT_LANGUAGE=zh-CN node scripts/readme-screenshots.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const extension = 'chrome-extension://lfbgkeagkfmndclpgmipadggnkoimkee/';
const sync = 'https://www.zotero.org/support/sync';
const storage = 'https://www.zotero.org/storage';
const paper = 'https://arxiv.org/pdf/1706.03762v7';
const advanced = 'https://arxiv.org/search/advanced';
const quote =
  'using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder';
const examples = {
  travel: {
    urls: ['https://www.vam.ac.uk/south-kensington/visit', 'https://www.vam.ac.uk/young'],
    selectionText: 'V&A South Kensington',
    selectionSelector: 'h2',
    en: [
      'Plan a museum day without a wasted trip',
      'I am choosing between V&A South Kensington and Young V&A for a family day out with a 7-year-old. Read these open official pages. Compare free admission, booking requirements and what children can do. Recommend one based on these pages and link to visitor information. Do not book anything. Answer in English in under 150 words.',
    ],
    'zh-CN': [
      '带孩子逛博物馆，先确认不会白跑',
      '想带7岁的孩子在伦敦玩一天，正在考虑 V&A South Kensington 和 Young V&A。请阅读已打开的官方页面，比较是否免费、是否需要预约以及适合孩子的活动，只比较这三项，给出建议并附参观信息链接。不要预订。用中文简洁回答。',
    ],
  },
  cooking: {
    urls: ['https://www.bbcgoodfood.com/recipes/easy-pancakes'],
    selectionText: 'Easy pancakes',
    en: [
      'Make just enough pancakes for breakfast',
      'I only want to make 6 pancakes. Read this recipe and halve its quantities. Give me a short ingredient checklist and cooking steps, with the cooking time. Use only the recipe on this page. Answer in English in under 130 words.',
    ],
    'zh-CN': [
      '早餐只做六张煎饼，材料该准备多少？',
      '我只想做6张煎饼。请根据这份食谱把材料用量减半，整理一份简短的材料清单、制作步骤和所需时间。只根据当前食谱，用中文简洁回答。',
    ],
  },
  read: {
    urls: [sync],
    en: [
      'Why are my PDFs missing on my other computer?',
      'I have Zotero on two computers, but my PDFs are missing on the second one. Read this official page: what is the difference between data sync and file sync, and does the 300 MB limit apply to my references? Give me three practical checks, in English, under 130 words.',
    ],
    'zh-CN': [
      '另一台电脑为什么没有我的 PDF？',
      '我在两台电脑上用 Zotero，但第二台电脑没有 PDF。请阅读这份官方文档：数据同步与文件同步有什么区别，300 MB 限额会限制我的文献条目吗？用中文简洁解释，给我三个排查步骤。',
    ],
  },
  pdf: {
    urls: [paper],
    en: [
      'Understand the Transformer architecture',
      'Read page 3 of this paper, including Figure 1. Explain the encoder and decoder in plain English, and why the decoder has masked attention. Highlight the selected passage on page 3. Keep the explanation under 130 words.',
    ],
    'zh-CN': [
      '读懂 Transformer 架构',
      '请阅读这篇论文第 3 页和图 1，用中文通俗解释编码器、解码器各做什么，为什么解码器要使用掩码注意力。高亮第 3 页选中的原文，回答简洁一些。',
    ],
  },
  compare: {
    urls: [storage, sync],
    en: [
      'Choose a PDF sync option for a research group',
      'Read both open Zotero pages. I need to share 1 GB of PDFs with a research group. Compare Zotero Storage and WebDAV in a small table: group-file support, who supplies storage, and relevant costs. Recommend an option based only on these pages. Do not purchase anything. Answer in English, under 150 words.',
    ],
    'zh-CN': [
      '给研究小组选 PDF 同步方案',
      '阅读已打开的两份 Zotero 官方页面。我需要和研究小组共享 1 GB 的 PDF。用小表格比较 Zotero Storage 与 WebDAV：是否支持群组文件、空间由谁提供、相关费用。仅根据这两个页面给出建议，不要购买。用中文简洁回答。',
    ],
  },
  act: {
    urls: [advanced],
    en: [
      'Find the original RAG paper',
      'Use this arXiv search form to find the original 2020 paper whose title contains Retrieval-Augmented Generation. Set the title field and the year, then run the search. Report the matching title and link in English. Do not use another search service.',
    ],
    'zh-CN': [
      '找到 RAG 的原始论文',
      '请操作这个 arXiv 搜索表单，查找 2020 年标题包含 Retrieval-Augmented Generation 的原始论文。设置标题字段和年份，然后执行搜索。用中文简短给出匹配的标题和链接，不要使用其他搜索服务。',
    ],
  },
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await fn()) return;
    await delay(250);
  }
  throw Error('Timed out waiting for extension state');
}
async function run(type, lang) {
  const config = examples[type],
    [heading, prompt] = config[lang];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tabgent-readme-live-'));
  const hosts = path.join(profile, 'NativeMessagingHosts');
  fs.mkdirSync(hosts);
  fs.copyFileSync(
    path.join(
      os.homedir(),
      'Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/com.tabgent.codex.json',
    ),
    path.join(hosts, 'com.tabgent.codex.json'),
  );
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 800, height: 950 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${root}/extension`, `--load-extension=${root}/extension`],
  });
  const out = path.join(root, 'docs/assets', lang);
  fs.mkdirSync(out, { recursive: true });
  let heartbeat;
  try {
    const control = await ctx.newPage();
    await control.goto(extension + 'setup.html');
    const pages = [];
    for (const url of config.urls) {
      const p = await ctx.newPage();
      await p.goto(type === 'pdf' ? extension + 'pdf/viewer.html?url=' + url : url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      pages.push(p);
    }
    const source = pages[0];
    if (type === 'travel') {
      for (const page of pages) {
        const dismiss = page.getByText('Continue without accepting', { exact: true });
        await dismiss.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        if (await dismiss.isVisible()) {
          await dismiss.click();
          await dismiss.waitFor({ state: 'hidden' });
        }
      }
    }

    if (type === 'cooking') {
      await source
        .frameLocator('iframe[title*="privacy" i], iframe[title*="consent" i]')
        .getByRole('button', { name: 'AGREE', exact: true })
        .click({ timeout: 15000 });
    }
    const tab = await control.evaluate(
      async (url) => (await chrome.tabs.query({})).find((t) => t.url === url),
      source.url(),
    );
    assert(tab, 'The companion tab exists');
    if (type === 'pdf') {
      await source
        .frameLocator('#viewer')
        .locator('.textLayer span')
        .first()
        .waitFor({ timeout: 60000 });
      const frame = source.frames().find((f) => f.url().includes('/vendor/pdfjs/'));
      await frame.evaluate(() =>
        PDFViewerApplication.pdfViewer.scrollPageIntoView({ pageNumber: 3 }),
      );
      await frame.locator('.page[data-page-number="3"] .textLayer span').first().waitFor();
      await frame.evaluate((text) => {
        const layer = document.querySelector('.page[data-page-number="3"] .textLayer');
        const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
        const points = [],
          chars = [];
        while (walker.nextNode())
          for (let i = 0; i < walker.currentNode.length; i++) {
            const ch = walker.currentNode.data[i];
            if (/\s/.test(ch)) continue;
            points.push({ node: walker.currentNode, offset: i });
            chars.push(ch);
          }
        const needle = text.replace(/\s/g, '');
        const start = chars.join('').indexOf(needle);
        if (start < 0) throw Error('Paper passage not found');
        const first = points[start],
          last = points[start + needle.length - 1];
        const range = document.createRange();
        range.setStart(first.node, first.offset);
        range.setEnd(last.node, last.offset + 1);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      }, quote);
    } else {
      await control.evaluate(
        async (id) =>
          chrome.scripting.executeScript({
            target: { tabId: id },
            files: ['selection-content.js'],
          }),
        tab.id,
      );
      // Selecting real page text initializes the same conversation used by the sidebar.
      await source
        .locator(config.selectionSelector || (type === 'read' ? 'p' : 'h1'))
        .filter(
          config.selectionText
            ? { hasText: config.selectionText }
            : type === 'read'
              ? { hasText: 'Zotero' }
              : type === 'compare'
                ? { hasText: 'Zotero Storage' }
                : { hasText: 'Advanced Search' },
        )
        .first()
        .evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
          document.dispatchEvent(new Event('selectionchange'));
        });
    }
    await poll(() =>
      control.evaluate(
        async (id) =>
          (await chrome.storage.session.get('conversations')).conversations?.some(
            ([key]) => key === id,
          ),
        tab.id,
      ),
    );
    const opened = await control.evaluate(
      async (tab) =>
        chrome.runtime.sendMessage({
          type: 'openAgent',
          conversationKey: tab.id,
          companionTabId: tab.id,
          windowId: tab.windowId,
        }),
      tab,
    );
    assert(!opened.error, JSON.stringify(opened));
    let agent;
    await poll(() => {
      agent = ctx.pages().find((p) => p.url() === extension + 'ui/chat.html');
      return !!agent;
    });
    await agent.waitForFunction(
      () => document.querySelector('#connection').dataset.state === 'ready',
      null,
      { timeout: 120000 },
    );
    if (type !== 'pdf' && type !== 'read') {
      const clear = agent.locator('#selectionRemove');
      if (await clear.isVisible()) await clear.click();
    }
    const model = await agent.locator('#model').inputValue();
    await agent.locator('#prompt').fill(prompt);
    await agent.locator('#send').click();
    heartbeat = setInterval(async () => {
      try {
        console.log(
          `${lang}/${type}: ${(await agent.locator('.turn-status').last().innerText()).slice(0, 160)}`,
        );
      } catch {}
    }, 20000);
    await agent.waitForFunction(
      () =>
        document.querySelector('.turn-status')?.dataset.status === 'completed' ||
        document.querySelector('.turn-status')?.dataset.status === 'failed',
      null,
      { timeout: 360000 },
    );
    clearInterval(heartbeat);
    assert.equal(
      await agent.locator('.turn-status').last().getAttribute('data-status'),
      'completed',
    );
    const answers = await agent.locator('.message.assistant, .message.agent').allTextContents();
    assert(
      answers.some((x) => x.trim()),
      'A real model response was received',
    );
    const transcript = await agent.locator('#messages').innerText();
    fs.writeFileSync(
      path.join(out, `${type}.json`),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          model,
          sources: config.urls,
          resultUrl: source.url(),
          prompt,
          answers,
          transcript,
        },
        null,
        2,
      ) + '\n',
    );
    // Keep the actual result visible; no page or response text is rewritten for capture.
    if (type === 'pdf') {
      await source
        .frameLocator('#viewer')
        .locator('.highlightEditor')
        .first()
        .waitFor({ timeout: 10000 });
      const frame = source.frames().find((f) => f.url().includes('/vendor/pdfjs/'));
      for (const id of ['viewsManagerToggleButton', 'editorHighlightButton']) {
        const button = frame.locator('#' + id);
        if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
      }
      await frame.evaluate(() =>
        PDFViewerApplication.pdfViewer.scrollPageIntoView({ pageNumber: 3 }),
      );
    } else if (type === 'read' || type === 'cooking') {
      await source
        .locator('h1')
        .first()
        .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    }
    if (type === 'travel') {
      for (const frame of source.frames()) {
        const closePreferences = frame.locator('#close-pc-btn-handler');
        if (await closePreferences.isVisible()) await closePreferences.click();
        const dismiss = frame.getByText('Continue without accepting', { exact: true });
        if (await dismiss.isVisible()) {
          await dismiss.click();
          await dismiss.waitFor({ state: 'hidden', timeout: 15000 });
        }
      }
    }
    await agent.evaluate(() => (document.querySelector('#scroll').scrollTop = 0));
    const left = await source.screenshot(),
      right = await agent.screenshot();
    // A labeled side-by-side composition of two untouched captures from the same live run.
    const layout = await ctx.newPage();
    await layout.setViewportSize({ width: 1600, height: 1014 });
    const label = lang === 'en' ? 'Your agent in every tab.' : '每个标签页，都有你的智能助手。';
    await layout.setContent(
      `<meta charset="utf-8"><style>body{margin:0;background:#f5f3fa;font:16px -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#302a40}header{height:64px;padding:0 22px;display:flex;align-items:center;justify-content:space-between}b{font-size:22px}span{color:#756e82}.shots{display:flex}img{display:block;width:800px;height:950px;object-fit:contain}</style><header><b>Tabgent / ${heading}</b><span>${label}</span></header><div class="shots"><img src="data:image/png;base64,${left.toString('base64')}"><img src="data:image/png;base64,${right.toString('base64')}"></div>`,
    );
    await layout.locator('img').evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
    await layout.screenshot({ path: path.join(out, `${type}.png`) });
    console.log(`DONE ${lang}/${type}: ${answers.join('\n').slice(0, 450)}`);
  } finally {
    clearInterval(heartbeat);
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
(async () => {
  for (const lang of process.env.TABGENT_LANGUAGE
    ? [process.env.TABGENT_LANGUAGE]
    : ['en', 'zh-CN'])
    for (const type of process.env.TABGENT_EXAMPLE
      ? [process.env.TABGENT_EXAMPLE]
      : Object.keys(examples))
      await run(type, lang);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
