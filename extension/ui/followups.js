import { pageContextPrefix } from '../session-config.js';
// App-server owns durable queueing; this view mirrors the desktop's queued-message strip.
import { normalizeUserInput, selectionContextPrefix } from './user-input.js';
export { selectionContextPrefix } from './user-input.js';

export function createFollowups({
  rpc,
  i18n,
  thread,
  busy,
  turn,
  queueing,
  setQueueing,
  prepareEdit,
  showError,
}) {
  const list = document.getElementById('followups');
  let entries = [],
    revision = 0,
    paused = false;
  const pending = new Set();
  const paths = {
    queued: 'M4 3v9a2 2 0 0 0 2 2h10m-3-3 3 3-3 3M8 5h6M8 9h4',
    steer: 'M3 5v6a2 2 0 0 0 2 2h12m-4-4 4 4-4 4',
    trash: 'M4 5h12M8 5V3h4v2M6 5l1 12h6l1-12M9 8v6m2-6v6',
    more: 'M5 10h.01M10 10h.01M15 10h.01',
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[name]);
    svg.append(path);
    return svg;
  }
  function button(parent, key, action, iconName, label = false) {
    const el = document.createElement('button');
    el.type = 'button';
    el.title = el.ariaLabel = i18n(key);
    if (iconName) el.append(icon(iconName));
    if (label || !iconName) el.append(document.createTextNode(i18n(key)));
    el.onclick = action;
    parent.append(el);
    return el;
  }
  async function refresh() {
    const request = ++revision;
    try {
      const data = [];
      let cursor;
      do {
        const page = await rpc('thread/queue/list', { threadId: thread(), cursor, limit: 100 });
        data.push(...(page.data || []));
        cursor = page.nextCursor;
      } while (cursor);
      if (request !== revision) return;
      entries = data;
      render();
    } catch (error) {
      if (request === revision) showError(error.message);
    }
  }
  const params = (entry) => ({
    threadId: thread(),
    queuedSubmissionId: entry.id,
    browserTabId: (() => {
      const part = entry.input?.find(
        (p) => p.type === 'text' && p.text.startsWith(pageContextPrefix),
      );
      return part ? JSON.parse(part.text.slice(pageContextPrefix.length)).tabId : undefined;
    })(),
  });
  async function act(entry, action) {
    if (pending.has(entry.id)) return;
    pending.add(entry.id);
    render();
    try {
      await action();
    } catch (error) {
      showError(error.message);
    } finally {
      pending.delete(entry.id);
      await refresh();
    }
  }
  async function sendNow(entry) {
    if (!busy()) return rpc('thread/queue/start', params(entry));
    const expectedTurnId = turn();
    if (!expectedTurnId) return;
    // Claim the queued entry before steering so another view cannot send it too.
    if (!(await rpc('thread/queue/delete', params(entry))).deleted) return;
    try {
      await rpc('turn/steer', {
        threadId: thread(),
        expectedTurnId,
        input: entry.input,
        clientUserMessageId: entry.clientUserMessageId,
      });
    } catch (error) {
      // Keep the saved message if the active turn changed or steering was rejected.
      await rpc('thread/queue/add', {
        threadId: thread(),
        input: entry.input,
        clientUserMessageId: entry.clientUserMessageId,
      });
      throw error;
    }
  }
  function render() {
    list.replaceChildren();
    list.hidden = !entries.length;
    if (paused && !busy() && entries.length) {
      const header = document.createElement('div');
      header.className = 'queue-paused';
      header.textContent = i18n('queuePaused');
      button(header, 'resumeQueue', () => act(entries[0], () => sendNow(entries[0])));
      list.append(header);
    }
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'followup';
      row.append(icon('queued'));
      const text = normalizeUserInput(entry.input)
        .filter(
          (p) =>
            p.type === 'text' &&
            !p.browserContext &&
            !p.text.startsWith(selectionContextPrefix) &&
            !p.text.startsWith(pageContextPrefix) &&
            !p.text.startsWith(i18n('selectionQuote') + '\n'),
        )
        .map((p) => p.text)
        .join('\n');
      const preview = document.createElement('span');
      preview.className = 'followup-text';
      preview.textContent = text || i18n('attachFiles');
      preview.title = text;
      row.append(preview);
      const steer = button(
        row,
        'steerQueued',
        () => act(entry, () => sendNow(entry)),
        'steer',
        true,
      );
      steer.title = i18n('steerQueuedHint');
      button(
        row,
        'removeFollowup',
        () => act(entry, () => rpc('thread/queue/delete', params(entry))),
        'trash',
      );
      const menu = document.createElement('div');
      menu.popover = 'auto';
      menu.className = 'followup-menu';
      const more = button(
        row,
        'followupActions',
        () => {
          menu.showPopover();
          const rect = more.getBoundingClientRect();
          menu.style.left =
            Math.max(
              8,
              Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8),
            ) + 'px';
          menu.style.top = Math.max(8, rect.top - menu.offsetHeight - 4) + 'px';
          menu.querySelector('button').focus();
        },
        'more',
      );
      more.setAttribute('aria-haspopup', 'menu');
      menu.setAttribute('role', 'menu');
      button(menu, 'editFollowup', () => {
        menu.hidePopover();
        void act(entry, async () => {
          const restore = await prepareEdit(entry);
          if ((await rpc('thread/queue/delete', params(entry))).deleted) restore();
        });
      });
      button(menu, queueing() ? 'disableQueueing' : 'enableQueueing', () => {
        menu.hidePopover();
        setQueueing(!queueing());
        render();
      });
      menu.onkeydown = (event) => {
        const choices = [...menu.querySelectorAll('button')];
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          choices[
            (choices.indexOf(document.activeElement) +
              (event.key === 'ArrowDown' ? 1 : choices.length - 1)) %
              choices.length
          ].focus();
        }
        if (event.key === 'Escape') more.focus();
      };
      for (const el of row.querySelectorAll('button')) el.disabled = pending.has(entry.id);
      row.append(menu);
      list.append(row);
    }
  }
  return {
    refresh,
    render,
    pause(value) {
      paused = value;
      render();
    },
    async add(input, selection) {
      const parts = [...input];
      if (selection)
        parts.push({
          type: 'text',
          text: selectionContextPrefix + JSON.stringify(selection),
          text_elements: [],
        });
      const result = await rpc('thread/queue/add', {
        threadId: thread(),
        clientUserMessageId: crypto.randomUUID(),
        input: parts,
      });
      await refresh();
      return result;
    },
  };
}
