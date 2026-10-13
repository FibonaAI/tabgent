// Runs in the selected frame. Only resources observed on that page are downloadable.
export function pageResource(args) {
  const resources = new Map();
  const add = (url, kind) => {
    if (!url) return;
    try {
      url = new URL(url, document.baseURI).href;
      if (/^(https?:|blob:|data:)/.test(url)) resources.set(url, { url, kind });
    } catch {}
  };
  add(location.href, 'document');
  for (const entry of performance.getEntriesByType('resource'))
    add(entry.name, entry.initiatorType);
  for (const el of document.querySelectorAll('[src], [href], video, audio, img')) {
    add(el.currentSrc || el.src || el.href, el.tagName.toLowerCase());
    if (el.poster) add(el.poster, 'poster');
  }
  if (args.action === 'resources')
    return { url: location.href, resources: [...resources.values()] };
  const el = args.selector ? document.querySelector(args.selector) : document.documentElement;
  if (!el) throw Error('Element not found');
  const format = args.format || 'resource';
  let url;
  if (format === 'html' || format === 'text') {
    const text =
      format === 'html'
        ? (args.selector ? '' : '<!doctype html>\n') + el.outerHTML
        : el.textContent;
    url = `data:${format === 'html' ? 'text/html' : 'text/plain'};charset=utf-8,${encodeURIComponent(text)}`;
  } else if (el.tagName === 'CANVAS' && args.selector) url = el.toDataURL('image/png');
  else {
    url = args.url
      ? new URL(args.url, document.baseURI).href
      : el.currentSrc || el.src || el.href || location.href;
    if (!resources.has(url))
      throw Error(
        'Resource is not present on this page; call resources or select its element first',
      );
  }
  return { url, pageUrl: location.href, format };
}

export async function saveResource(tabId, args, checkScope, session) {
  const [{ result, error }] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [args.frameId || 0] },
    func: pageResource,
    args: [args],
  });
  if (error) throw Error(error.message || 'Cannot read this resource');
  await checkScope();
  if (args.action === 'resources') return result;
  if (!result?.url || !/^(https?:|blob:|data:)/.test(result.url))
    throw Error('Unsupported resource URL');
  const filename =
    args.filename ||
    (result.format === 'html'
      ? 'page.html'
      : result.format === 'text'
        ? 'page.txt'
        : result.url.startsWith('data:image/png')
          ? 'canvas.png'
          : undefined);
  if (filename && (/[\\/\x00-\x1f]/.test(filename) || /^\.+$/.test(filename)))
    throw Error('Use a filename without directories');
  const id = await chrome.downloads.download({
    url: result.url,
    conflictAction: 'uniquify',
    saveAs: false,
    ...(filename ? { filename: `Tabgent/${filename}` } : {}),
  });
  await chrome.storage.session.set({ [`resourceDownload:${id}`]: session.threadId || session.id });
  // Downloads continue in Chrome if the UI closes or a large file takes longer.
  for (let attempt = 0; attempt < 120; attempt++) {
    const value = await downloadStatus(id, session);
    if (value.state !== 'in_progress') return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return downloadStatus(id, session);
}
export async function downloadStatus(id, session) {
  const key = `resourceDownload:${id}`;
  if ((await chrome.storage.session.get(key))[key] !== (session.threadId || session.id))
    throw Error('Download does not belong to this conversation');
  const [item] = await chrome.downloads.search({ id });
  if (!item) throw Error('Download not found');
  if (item.state === 'interrupted')
    throw Error(`Download interrupted: ${item.error || 'unknown reason'}`);
  return {
    downloadId: id,
    state: item.state,
    path: item.filename,
    bytes: item.bytesReceived,
    error: item.error,
  };
}
