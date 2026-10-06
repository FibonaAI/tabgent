import { agentPointer } from './agent-pointer.js';
import { pdfSource, pdfTab, pdfCommand } from './pdf-routing.js';
import { nativeInput } from './browser-input.js';
const newTab = (tab) => /^chrome:\/\/(newtab|new-tab-page)\//.test(tab.url || '');
const allowed = (tab) =>
  !tab.incognito &&
  (/^(https?:|about:blank)/.test(tab.url || '') || newTab(tab) || !!pdfSource(tab.url));
const busyTabs = new Set();
export async function available(session) {
  const owner = await chrome.tabs.get(session.tabId);
  return (
    await chrome.tabs.query(session.scope === 'browser' ? {} : { windowId: owner.windowId })
  ).filter(allowed);
}
export async function context(session) {
  const tab = await chrome.tabs.get(session.tabId);
  // Agent pages may be context, but are never exposed to browser input tools.
  const agentPage = tab.url?.startsWith(chrome.runtime.getURL('ui/chat.html'));
  return {
    scope: session.scope,
    page: !tab.incognito && (allowed(tab) || agentPage) ? pdfTab(tab) : null,
    ...(allowed(tab) && !newTab(tab)
      ? { contentType: pdfSource(tab.url) ? 'application/pdf' : await contentType(tab.id) }
      : {}),
  };
}
export async function browserTool(session, args, readPdf) {
  if (!args || typeof args.action !== 'string') throw Error('A browser action is required');
  args = { ...args };
  const framed = /^frame=(\d+);([\s\S]+)$/.exec(args.selector || '');
  if (framed) {
    args.frameId = Number(framed[1]);
    args.selector = framed[2];
  }
  const point = /^@point\(([-\d.]+),\s*([-\d.]+)\)$/.exec(args.selector || '');
  if (point) {
    args.x = Number(point[1]);
    args.y = Number(point[2]);
    delete args.selector;
  }
  const id = args.tabId ?? session.tabId;
  if (busyTabs.has(id))
    throw Error('Another browser operation is running in this tab; retry sequentially');
  busyTabs.add(id);
  try {
    return await operate(session, args, id, readPdf);
  } finally {
    busyTabs.delete(id);
  }
}
async function operate(session, args, id, readPdf) {
  if (args.action === 'context') return context(session);
  const tabs = await available(session);
  if (args.action === 'tabs')
    return tabs.map(pdfTab).map(({ id, windowId, title, url, active }) => ({
      id,
      windowId,
      title,
      url,
      active,
    }));
  const owner = await chrome.tabs.get(session.tabId);
  const url = () => {
    const value = new URL(args.url);
    if (!['http:', 'https:'].includes(value.protocol)) throw Error('Only HTTP(S) URLs are allowed');
    return value.href;
  };
  if (args.action === 'open')
    return chrome.tabs.create({ windowId: owner.windowId, url: url(), active: false });
  const check = async () => {
    if (!(await available(session)).some((t) => t.id === id))
      throw Error('Tab is outside the selected scope or is a protected page');
  };
  if (!tabs.some((t) => t.id === id))
    throw Error('Tab is outside the selected scope or is a protected page');
  if (args.action === 'close') {
    if (id === session.tabId)
      throw Error('Close the conversation tab manually; this action can close other scoped tabs');
    await chrome.tabs.remove(id);
    return { success: true };
  }
  if (newTab(tabs.find((t) => t.id === id))) {
    if (args.action === 'read' || args.action === 'frames')
      return {
        url: tabs.find((t) => t.id === id).url,
        title: tabs.find((t) => t.id === id).title,
        text: '',
        controls: [],
        frames: [],
        protected: true,
      };
    if (!['navigate', 'focus', 'reload', 'back', 'forward'].includes(args.action))
      throw Error(
        'Chrome internal pages cannot be inspected or clicked; navigate to a website first',
      );
  }
  if (
    pdfSource(tabs.find((t) => t.id === id).url) &&
    ['read', 'selectText', 'highlight', 'savePdf'].includes(args.action)
  ) {
    const result = await pdfCommand(id, args);
    await check();
    return result;
  }
  // Only one pointer per tab, including when operations cross iframe boundaries.
  if (['click', 'hover', 'scroll', 'drag', 'check', 'select'].includes(args.action))
    await agentPointer(id, null, null);
  let result;
  if (args.action === 'navigate') result = await chrome.tabs.update(id, { url: url() });
  else if (args.action === 'focus') result = await chrome.tabs.update(id, { active: true });
  else if (args.action === 'back' || args.action === 'forward') {
    await chrome.tabs[args.action === 'back' ? 'goBack' : 'goForward'](id);
    result = { success: true };
  } else if (args.action === 'reload') {
    await chrome.tabs.reload(id);
    result = { success: true };
  } else if (args.action === 'read' && (await contentType(id)) === 'application/pdf') {
    if (!readPdf) throw Error('PDF reader unavailable');
    const tab = tabs.find((t) => t.id === id);
    const response = await fetch(tab.url, {
      credentials: 'include',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error(`PDF download failed (${response.status})`);
    const reader = response.body.getReader(),
      parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 10 * 1024 * 1024) throw Error('PDF exceeds the 10 MB reading limit');
        parts.push(value);
      }
    } finally {
      await reader.cancel();
    }
    await check();
    if ((await chrome.tabs.get(id)).url !== tab.url) throw Error('Page changed; read again');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-'))
      throw Error('The current URL did not return a PDF; it may require sign-in');
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    result = {
      url: tab.url,
      title: tab.title,
      contentType: 'application/pdf',
      ...(await readPdf({ data: btoa(binary), page: args.page ?? 1, offset: args.offset ?? 0 })),
      controls: [],
      interaction:
        'Use screenshot, click/drag coordinates, scroll, and press to operate this PDF in place.',
    };
  } else if (args.action === 'read' || args.action === 'frames') {
    const frames = await chrome.webNavigation.getAllFrames({ tabId: id });
    const selected =
      args.frameId === undefined ? frames : frames.filter((f) => f.frameId === args.frameId);
    if (!selected.length) throw Error('Frame unavailable; read the page again');
    const results = await Promise.all(
      selected.map(async (frame) => {
        const info = { frameId: frame.frameId, parentFrameId: frame.parentFrameId, url: frame.url };
        if (!/^https?:|^about:(blank|srcdoc)/.test(frame.url))
          return { ...info, unavailable: true };
        if (args.action === 'frames') return info;
        try {
          const [value] = await chrome.scripting.executeScript({
            target: { tabId: id, frameIds: [frame.frameId] },
            func: pageAction,
            args: [{ action: 'read' }],
          });
          return {
            ...info,
            ...value.result,
            controls: value.result.controls.map((c) => ({
              ...c,
              selector: frame.frameId ? `frame=${frame.frameId};${c.selector}` : c.selector,
            })),
          };
        } catch (e) {
          return { ...info, unavailable: true, error: e.message };
        }
      }),
    );
    const main = results.find((f) => f.frameId === (args.frameId ?? 0));
    result =
      args.action === 'frames'
        ? { frames: results }
        : { ...main, frames: results.filter((f) => f !== main) };
  } else {
    const frameId = args.frameId ?? 0;
    if (!Number.isInteger(frameId) || frameId < 0) throw Error('Invalid frame ID');
    const dom = async (action) => {
      if (['click', 'hover', 'scroll', 'check', 'select'].includes(action)) {
        const point = await dom('point');
        await check();
        await agentPointer(
          id,
          point.x,
          point.y,
          ['click', 'check', 'select'].includes(action),
          frameId,
        );
      }
      await check();
      const frames = await chrome.webNavigation.getAllFrames({ tabId: id });
      const frame = frames.find((f) => f.frameId === frameId);
      if (!frame || !/^https?:|^about:(blank|srcdoc)/.test(frame.url))
        throw Error('Frame is unavailable or protected');
      const [value] = await chrome.scripting.executeScript({
        target: { tabId: id, frameIds: [frameId] },
        func: pageAction,
        args: [{ ...args, action }],
      });
      if (value?.error) throw Error(value.error.message || 'Element operation failed');
      if (value?.result == null) throw Error('Element missing or unavailable; read the page again');
      return value.result;
    };
    if (args.action === 'select' || args.action === 'check') result = await dom(args.action);
    else if (args.action === 'type') {
      if (typeof args.text !== 'string') throw Error('Text is required');
      if (args.selector) await dom('prepareType');
      result = await nativeInput(id, args, check);
    } else if (args.action === 'press') {
      if (args.selector) await dom('focus');
      result = await nativeInput(id, args, check);
    } else if (args.action === 'click' || args.action === 'hover') {
      if (args.selector) {
        // DOM frame IDs are Chrome frame IDs. Frame-local selectors remain usable
        // across origins; screenshot coordinates always address the whole tab.
        if (frameId !== 0) result = await dom(args.action);
        else {
          const point = await dom('point');
          result = await nativeInput(id, { ...args, ...point }, check);
        }
      } else {
        if (!Number.isFinite(args.x) || !Number.isFinite(args.y))
          throw Error('Use a fresh selector or screenshot coordinates');
        result = await nativeInput(id, args, check);
      }
    } else if (args.action === 'scroll' && args.selector) result = await dom('scroll');
    else if (['screenshot', 'scroll', 'drag'].includes(args.action))
      result = await nativeInput(id, args, check);
    else throw Error('Unsupported browser action');
  }
  await check();
  return result;
}
async function contentType(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.contentType,
    });
    return result?.result;
  } catch {
    return undefined;
  }
}
function pageAction(args) {
  if (/(?:recaptcha|hcaptcha\.com|challenges\.cloudflare\.com\/.*turnstile)/i.test(location.href))
    throw Error('Human verification must be completed by the user');
  const roots = [document];
  for (let i = 0; i < roots.length; i++)
    for (const el of roots[i].querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
  const query = (selector) => roots.flatMap((root) => [...root.querySelectorAll(selector)]);
  const visible = (el) =>
    el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  if (args.action === 'read') {
    for (const el of query('[data-browser-agent-connector-ref]'))
      el.removeAttribute('data-browser-agent-connector-ref');
    const prefix = crypto.randomUUID().slice(0, 8);
    const elements = query(
      'a,button,input,textarea,select,[role="button"],[role="checkbox"],[role="combobox"],[contenteditable="true"],canvas,iframe',
    )
      .filter(visible)
      .slice(0, 180);
    const controls = elements.map((el, i) => {
      const ref = `${prefix}-${i}`;
      el.dataset.browserAgentConnectorRef = ref;
      const r = el.getBoundingClientRect();
      return {
        selector: `[data-browser-agent-connector-ref="${ref}"]`,
        tag: el.tagName,
        role: el.getAttribute('role'),
        text: (
          el.innerText ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.title ||
          ''
        ).slice(0, 200),
        type: el.getAttribute('type'),
        disabled: !!el.disabled,
        ...(el instanceof HTMLSelectElement
          ? {
              options: [...el.options].map((o) => ({
                label: o.text,
                value: o.value,
                selected: o.selected,
              })),
            }
          : {}),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });
    return {
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 30000),
      controls,
      viewport: { width: innerWidth, height: innerHeight },
      coordinateSpace:
        'Frame-local CSS viewport pixels; use screenshot coordinates for cross-frame pointer actions',
    };
  }
  if (typeof args.selector !== 'string' || !args.selector)
    throw Error('A selector from a fresh read is required');
  const matches = query(args.selector).filter(visible);
  if (matches.length !== 1) throw Error('Element missing or ambiguous; read the page again');
  const el = matches[0];
  if (el.disabled) throw Error('Element is disabled');
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  if (args.action === 'point') {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
  if (args.action === 'scroll') {
    el.scrollBy({ top: args.pixels ?? 600, left: args.deltaX || 0, behavior: 'instant' });
    return { success: true };
  }
  if (args.action === 'select') {
    if (!(el instanceof HTMLSelectElement)) throw Error('Use click/press for custom dropdowns');
    const values = Array.isArray(args.values) ? args.values : [args.value];
    if (
      !values.length ||
      values.some(
        (v) => typeof v !== 'string' || ![...el.options].some((o) => o.value === v && !o.disabled),
      )
    )
      throw Error('Choose option values returned by read');
    if (!el.multiple && values.length !== 1) throw Error('This dropdown only accepts one option');
    for (const option of el.options) option.selected = values.includes(option.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, value: el.value };
  }
  if (args.action === 'check') {
    if (!(el instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(el.type))
      throw Error('Use click for custom checkboxes');
    if (typeof args.checked !== 'boolean') throw Error('checked must be true or false');
    if (el.checked !== args.checked) el.click();
    return { success: el.checked === args.checked, checked: el.checked };
  }
  el.focus();
  if (args.action === 'prepareType') {
    if (!(
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el.isContentEditable
    ))
      throw Error('Element is not editable');
    if (el.readOnly) throw Error('Element is read-only');
    if (args.replace !== false) {
      if (el.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } else el.select();
    }
  } else if (args.action === 'click') el.click();
  else if (args.action === 'hover')
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { success: true };
}
