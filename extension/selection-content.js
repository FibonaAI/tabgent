// Clear dismissed page selections, but retain context when focus moves to Agent.
(() => {
  if (globalThis.browserAgentSelectionInstalled) return;
  globalThis.browserAgentSelectionInstalled = true;
  let timer,
    last = '',
    selectionId;
  function path(node) {
    const parts = [];
    while (node && node !== document) {
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        parts.unshift('::shadow');
        node = node.host;
        continue;
      }
      const parent = node.parentNode;
      if (!parent) break;
      parts.unshift(
        node.nodeType === Node.TEXT_NODE
          ? `text()[${[...parent.childNodes].indexOf(node)}]`
          : `${node.localName}:nth-child(${[...parent.children].indexOf(node) + 1})`,
      );
      node = parent;
    }
    return parts.join(' > ');
  }
  function point(node, offset) {
    return { path: path(node), offset };
  }
  const rect = (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  function capture() {
    if (document.activeElement?.matches('input,textarea')) return;
    const selection = window.getSelection();
    const text = selection?.toString() || '';
    if (!selection || selection.isCollapsed || !text.trim()) {
      if (last && document.hasFocus()) {
        try {
          chrome.runtime.sendMessage({ type: 'pageSelectionCleared', selectionId }).catch(() => {});
        } catch {}
        last = '';
      }
      return;
    }
    const range = selection.getRangeAt(0),
      element =
        range.commonAncestorContainer.nodeType === 1
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
    const locator = {
      kind: 'dom',
      start: point(range.startContainer, range.startOffset),
      end: point(range.endContainer, range.endOffset),
      element: { path: path(element), tag: element?.localName, id: element?.id },
      rect: rect(range.getBoundingClientRect()),
      rects: [...range.getClientRects()].slice(0, 100).map(rect),
      viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
      before: range.startContainer.textContent?.slice(
        Math.max(0, range.startOffset - 160),
        range.startOffset,
      ),
      after: range.endContainer.textContent?.slice(range.endOffset, range.endOffset + 160),
      coordinateSpace: 'frame viewport CSS pixels',
      capturedAt: new Date().toISOString(),
    };
    const key = JSON.stringify([location.href, text, locator.start, locator.end]);
    if (key === last) return;
    last = key;
    selectionId = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
    try {
      chrome.runtime
        .sendMessage({
          type: 'pageSelection',
          selectionId,
          text: text.slice(0, 20000),
          truncated: text.length > 20000,
          title: document.title.slice(0, 500),
          locator,
        })
        .catch(() => {});
    } catch {}
  }
  document.addEventListener('selectionchange', () => {
    clearTimeout(timer);
    timer = setTimeout(capture, 120);
  });
  document.addEventListener('pointerup', capture);
  document.addEventListener('keyup', capture);
  capture();
})();
