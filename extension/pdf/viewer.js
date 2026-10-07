import { paintAgentPointer } from '../agent-pointer.js';
import { t } from '../i18n.js';
import { pdfSource } from '../pdf-routing.js';
const frame = document.querySelector('#viewer');
const status = document.querySelector('#status');
const source = pdfSource(location.href);
if (source) {
  const icon = new Image();
  icon.referrerPolicy = 'no-referrer';
  icon.onload = () => {
    document.querySelector('#favicon').href = icon.src;
  };
  icon.src = new URL('/favicon.ico', source).href;
}
const native = document.querySelector('#native');
native.textContent = t('pdfOpenNative');
status.textContent = t('pdfLoading');
let app,
  port,
  last = '',
  selectionId,
  ready = false;
async function fallback() {
  if (app?.pdfDocument?.annotationStorage.size && !confirm(t('pdfDirty'))) return;
  const result = await chrome.runtime.sendMessage({ type: 'pdfFallback' });
  if (result?.error) status.textContent = result.error;
}
native.onclick = fallback;
const timer = setTimeout(() => {
  if (!ready) void fallback();
}, 30000);
function connect() {
  port = chrome.runtime.connect({ name: 'pdf' });
  port.onMessage.addListener(async ({ id, args }) => {
    try {
      const result =
        args.action === 'pointer'
          ? (paintAgentPointer(args.x, args.y, args.pressed), { success: true })
          : await operate(args);
      port.postMessage({ id, result });
    } catch (e) {
      port.postMessage({ id, error: e.message });
    }
  });
  port.onDisconnect.addListener(() => setTimeout(connect, 1000));
}
function capture() {
  const doc = frame.contentDocument,
    selection = doc.getSelection();
  const text = selection?.toString() || '';
  if (!text.trim() || selection.isCollapsed) {
    if (last && doc.hasFocus()) {
      chrome.runtime.sendMessage({ type: 'pageSelectionCleared', selectionId }).catch(() => {});
      last = '';
    }
    return;
  }
  const range = selection.getRangeAt(0);
  const element = range.startContainer.parentElement;
  const page = element?.closest('.page');
  if (!element?.closest('.textLayer') || !page) return;
  const number = Number(page.dataset.pageNumber);
  const pages = [...doc.querySelectorAll('.page')].map((el) => ({
    page: Number(el.dataset.pageNumber),
    bounds: el.getBoundingClientRect(),
  }));
  const rects = [...range.getClientRects()].slice(0, 100).flatMap((r) => {
    const owner = pages.find(
      ({ bounds }) => r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1,
    );
    if (!owner) return [];
    const { page, bounds } = owner;
    const view = app.pdfViewer.getPageView(page - 1);
    return [
      {
        page,
        x: r.x - bounds.x,
        y: r.y - bounds.y,
        width: r.width,
        height: r.height,
        pdf: [
          ...view.viewport.convertToPdfPoint(r.left - bounds.left, r.top - bounds.top),
          ...view.viewport.convertToPdfPoint(r.right - bounds.left, r.bottom - bounds.top),
        ],
      },
    ];
  });
  const key = JSON.stringify([number, text, rects]);
  if (key === last) return;
  last = key;
  selectionId = crypto.randomUUID();
  chrome.runtime
    .sendMessage({
      type: 'pageSelection',
      text: text.slice(0, 20000),
      truncated: text.length > 20000,
      title: document.title,
      selectionId,
      locator: {
        kind: 'pdf',
        page: number,
        rects,
        coordinateSpace: 'PDF page points and page-local CSS pixels',
        capturedAt: new Date().toISOString(),
      },
    })
    .catch(() => {});
}
async function operate(args) {
  if (!ready) throw Error('PDF is still loading');
  const pageNumber = args.page ?? (args.action === 'read' ? 1 : app.page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > app.pagesCount)
    throw Error('PDF page out of range');
  if (args.action === 'read') {
    const page = await app.pdfDocument.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join('');
    const offset = Math.max(0, args.offset || 0);
    return {
      contentType: 'application/pdf',
      viewer: 'pdfjs',
      url: source,
      title: document.title,
      page: pageNumber,
      pages: app.pagesCount,
      text: text.slice(offset, offset + 30000),
      offset,
      nextOffset: offset + 30000 < text.length ? offset + 30000 : null,
      actions: ['selectText', 'highlight', 'savePdf', 'screenshot', 'scroll', 'click', 'press'],
    };
  }
  if (args.action === 'savePdf') {
    await app.downloadOrSave();
    return { success: true };
  }
  if (!['selectText', 'highlight'].includes(args.action)) throw Error('Unsupported PDF action');
  if (typeof args.text !== 'string' || !args.text.trim()) throw Error('Text is required');
  app.pdfViewer.scrollPageIntoView({ pageNumber });
  const view = app.pdfViewer.getPageView(pageNumber - 1);
  for (let i = 0; i < 100 && !view.textLayer?.div?.querySelector('span'); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  const layer = view.textLayer?.div;
  if (!layer) throw Error('PDF text layer unavailable');
  const walker = frame.contentDocument.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const points = [],
    characters = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (let i = 0; i < node.length; i++) {
      if (/\s/.test(node.data[i])) continue;
      characters.push(node.data[i]);
      points.push({ node, offset: i });
    }
  }
  const needle = args.text.replace(/\s/g, '');
  const haystack = characters.join('');
  const occurrence = args.occurrence ?? 1;
  if (!Number.isInteger(occurrence) || occurrence < 1) throw Error('Invalid occurrence');
  let start = -1;
  for (let i = 0; i < occurrence; i++) {
    start = haystack.indexOf(needle, start + 1);
    if (start < 0) throw Error('Text not found on this PDF page');
  }
  const from = points[start],
    to = points[start + needle.length - 1];
  const range = frame.contentDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset + 1);
  const selection = frame.contentWindow.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  from.node.parentElement.scrollIntoView({ block: 'center' });
  capture();
  if (args.action === 'highlight')
    app.eventBus.dispatch('editingaction', { source: window, name: 'highlightSelection' });
  return { success: true, page: pageNumber, text: args.text, occurrence };
}
document.addEventListener('webviewerloaded', async (event) => {
  if (event.detail.source !== frame.contentWindow) return;
  const win = frame.contentWindow;
  const options = win.PDFViewerApplicationOptions;
  options.setAll({
    defaultUrl: '',
    enableScripting: false,
    isEvalSupported: false,
    disablePreferences: true,
    externalLinkTarget: 2,
    locale: 'en-US',
    enableComment: true,
    enableHighlightFloatingButton: true,
    enableAltTextModelDownload: false,
  });
  app = win.PDFViewerApplication;
  try {
    await app.initializedPromise;
    // The original URL is validated by the wrapper, not the generic demo viewer.
    await app.open({ url: source, withCredentials: true });
    ready = true;
    clearTimeout(timer);
    status.textContent = '';
    const name = decodeURIComponent(new URL(source).pathname.split('/').pop()) || 'PDF';
    document.title = name;
    document.querySelector('#title').textContent = name;
    const doc = frame.contentDocument;
    doc.addEventListener('selectionchange', () => setTimeout(capture, 120));
    doc.addEventListener('pointerup', capture);
    // A document switch would invalidate the source tab binding. Open PDFs via Chrome instead.
    for (const id of ['openFile', 'secondaryOpenFile']) doc.getElementById(id)?.remove();
    doc.addEventListener(
      'drop',
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true,
    );
    doc.addEventListener(
      'keydown',
      (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
    connect();
  } catch {
    clearTimeout(timer);
    status.textContent = t('pdfFailed');
    await fallback();
  }
});
if (source) frame.src = '../vendor/pdfjs/web/viewer.html?file=' + new URL(source).hash;
else {
  clearTimeout(timer);
  status.textContent = t('pdfInvalid');
  native.disabled = true;
}
