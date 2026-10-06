// These are the visible counterparts of the durable, model-visible lineage notes.
export function isLineageNote(item) {
  if (item.type !== 'userMessage') return false;
  const text = (item.content || []).map((part) => part.text || '').join('');
  return (
    item.type === 'userMessage' &&
    text.startsWith('Browser conversation lineage (context only; no reply required).\n') &&
    /\nReference: browser-lineage:[\da-f-]{36}:[\da-f-]{36}:[\da-f-]{36}$/.test(text)
  );
}

export function createRelations({ rpc, i18n, open, error, ready }) {
  const messages = document.querySelector('#messages');
  let revision = 0;
  document.addEventListener('click', (event) => {
    for (const details of messages.querySelectorAll('.lineage-details[open]')) {
      if (!details.contains(event.target)) details.open = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const details of messages.querySelectorAll('.lineage-details[open]')) {
      const hadFocus = details.contains(document.activeElement);
      details.open = false;
      if (hadFocus) details.querySelector('summary').focus();
    }
  });
  function branchIcon() {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.classList.add('lineage-icon');
    icon.innerHTML =
      '<path d="M6 7v10m0-6h7a5 5 0 0 0 5-5"/><circle cx="6" cy="4" r="2"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="4" r="2"/>';
    return icon;
  }
  function groupChildren() {
    for (let row = messages.firstElementChild; row;) {
      if (!row.dataset.relation?.startsWith('child:')) {
        row = row.nextElementSibling;
        continue;
      }
      const rows = [row];
      let next = row.nextElementSibling;
      while (
        next?.dataset.relation?.startsWith('child:') &&
        Number(next.dataset.timestamp) - Number(row.dataset.timestamp) <= 60000
      ) {
        rows.push(next);
        next = next.nextElementSibling;
      }
      if (rows.length > 1) {
        const group = document.createElement('details');
        group.className = 'lineage-group';
        group.dataset.first = row.dataset.relation;
        group.dataset.timestamp = row.dataset.timestamp;

        const summary = document.createElement('summary');
        summary.append(branchIcon(), document.createTextNode(i18n('lineageGroup', rows.length)));
        group.append(summary);
        row.before(group);
        group.append(...rows);
      }
      row = next;
    }
  }
  async function refresh() {
    if (!ready()) return;
    const current = ++revision;
    try {
      const { parents = [], children = [] } = await rpc('bridge/thread/relations');
      if (current !== revision) return;
      const expandedGroups = [...messages.querySelectorAll('.lineage-group[open]')].map(
        (g) => g.dataset.first,
      );
      for (const group of messages.querySelectorAll('.lineage-group')) {
        for (const row of group.querySelectorAll('.lineage-message')) group.before(row);
        group.remove();
      }
      for (const [kind, entries] of [
        ['parent', parents],
        ['child', children],
      ]) {
        for (const entry of entries) {
          const key = `${kind}:${entry.threadId}`;
          let row = [...messages.querySelectorAll('.lineage-message')].find(
            (node) => node.dataset.relation === key,
          );
          if (!row) {
            row = document.createElement('article');
            row.className = 'message lineage-message';
            row.setAttribute('role', 'note');
            row.dataset.relation = key;
            row.dataset.timestamp = String(entry.createdAt || Date.now());
            const next = [...messages.children].find(
              (node) => Number(node.dataset.timestamp) > Number(row.dataset.timestamp),
            );
            messages.insertBefore(row, kind === 'parent' ? messages.firstChild : next || null);
          }
          const detailsOpen = !!row.querySelector('.lineage-details[open]');
          row.replaceChildren();
          row.append(branchIcon());
          const text = document.createElement('span');
          text.className = 'lineage-text';
          row.append(text);
          text.append(
            document.createTextNode(i18n(kind === 'parent' ? 'lineageFrom' : 'lineageTo') + ' '),
          );
          const link = document.createElement('button');
          link.textContent =
            entry.title && entry.title !== i18n('newChat') ? entry.title : i18n('lineageUntitled');
          link.className = 'lineage-link';
          link.title = i18n('relatedOpen');
          link.onclick = () => open(entry.threadId).catch((e) => error(e.message));
          text.append(link, document.createTextNode('.'));
          const details = document.createElement('details');
          details.className = 'lineage-details';
          details.open = detailsOpen;
          const summary = document.createElement('summary');
          summary.textContent = '…';
          summary.setAttribute('aria-label', i18n('lineageDetails'));
          details.append(summary);
          const id = document.createElement('code');
          id.textContent = entry.threadId;
          const copy = document.createElement('button');
          copy.textContent = i18n('lineageCopy');
          copy.onclick = async () => {
            try {
              await navigator.clipboard.writeText(entry.threadId);
              copy.textContent = i18n('lineageCopied');
            } catch (e) {
              error(e.message);
            }
          };
          const content = document.createElement('div');
          content.append(id, copy);
          details.append(content);
          row.append(details);
        }
      }
      groupChildren();
      for (const group of messages.querySelectorAll('.lineage-group'))
        group.open = expandedGroups.includes(group.dataset.first);
    } catch (e) {
      error(e.message);
    }
  }
  return { refresh };
}
