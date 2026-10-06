import { pdfCommand } from './pdf-routing.js';

// Runs in the extension's isolated world; never intercepts page input.
export function paintAgentPointer(x, y, pressed = false) {
  const key = '__bacAgentPointer';
  let state = globalThis[key];
  if (x === null) {
    if (state) {
      clearTimeout(state.timer);
      state.host.remove();
      delete globalThis[key];
    }
    return;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (!state?.host.isConnected) {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;';
    const root = host.attachShadow({ mode: 'closed' });
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cursor.setAttribute('viewBox', '0 0 22 22');
    cursor.style.cssText =
      'position:absolute;width:22px;height:22px;overflow:visible;pointer-events:none;filter:drop-shadow(0 0 6px #a78bfacc) drop-shadow(0 0 15px #a78bfa66);';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M4 2.5 C2.5 2 2 2.5 2.5 4 L7 17 C7.6 18.7 9.3 18.8 10 17.1 L11.8 13.2 Q12.2 12.2 13.2 11.8 L17.1 10 C18.8 9.3 18.7 7.6 17 7 Z',
    );
    path.setAttribute('fill', '#171717');
    path.setAttribute('stroke', 'white');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linejoin', 'round');
    cursor.append(path);
    root.append(cursor);
    (document.fullscreenElement || document.documentElement).append(host);
    state = globalThis[key] = { host, cursor };
  }
  clearTimeout(state.timer);
  state.cursor.style.left = `${x - 2}px`;
  state.cursor.style.top = `${y - 2}px`;
  state.cursor.style.transformOrigin = '2px 2px';
  state.cursor.style.transform = pressed ? 'scale(.85)' : 'scale(1)';
  if (pressed) {
    state.cursor.getAnimations().forEach((animation) => animation.cancel());
    state.cursor.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: 240 });
  }
  state.timer = setTimeout(() => {
    state.host.remove();
    if (globalThis[key] === state) delete globalThis[key];
  }, 1600);
}

export async function agentPointer(tabId, x, y, pressed = false, frameId = 0) {
  try {
    await chrome.scripting.executeScript({
      target: x === null ? { tabId, allFrames: true } : { tabId, frameIds: [frameId] },
      func: paintAgentPointer,
      args: [x, y, pressed],
    });
  } catch {
    // Extension PDF pages use their existing port; Chrome's native PDF cannot
    // host an overlay. Feedback must never prevent the browser operation.
    await pdfCommand(tabId, { action: 'pointer', x, y, pressed }).catch(() => {});
  }
}
