import { parseDocument } from '../vendor/yaml/dist/index.js';

export function addStructuredView(block, heading, pre, code, t) {
  const language = code?.className.match(/\blanguage-(json|ya?ml)\b/i)?.[1].toLowerCase();
  if (!language) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'structured-toggle';
  button.innerHTML =
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v11h4M4 6h4"/><rect x="8" y="3" width="8" height="6" rx="1.5"/><rect x="8" y="11" width="8" height="6" rx="1.5"/></svg>';
  button.title = t('showStructured');
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', 'false');
  heading.prepend(button);
  let tree;
  const populateNodes = new WeakMap();
  const toggleAll = document.createElement('button');
  toggleAll.type = 'button';
  toggleAll.className = 'structured-all';
  toggleAll.hidden = true;
  button.after(toggleAll);
  const updateAll = () => {
    const collapse = tree && !tree.querySelector('details:not([open])');
    toggleAll.title = t(collapse ? 'collapseAll' : 'expandAll');
    toggleAll.setAttribute('aria-label', toggleAll.title);
    toggleAll.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${collapse ? 'M6 3l4 4 4-4M6 17l4-4 4 4' : 'M6 7l4-4 4 4M6 13l4 4 4-4'}"/></svg>`;
  };
  toggleAll.onclick = () => {
    const expand = Boolean(tree.querySelector('details:not([open])'));
    const pending = [...tree.querySelectorAll(':scope > details')];
    while (pending.length) {
      const details = pending.pop();
      details.open = expand;
      if (expand) populateNodes.get(details)();
      pending.push(...details.querySelectorAll(':scope > .structured-children > details'));
    }
    updateAll();
  };
  button.onclick = () => {
    if (!tree) {
      try {
        if (code.textContent.length > 100_000) throw Error('Too large');
        let value;
        if (language === 'json') value = JSON.parse(code.textContent);
        else {
          const doc = parseDocument(code.textContent, { schema: 'core' });
          if (doc.errors.length) throw doc.errors[0];
          value = doc.toJS({ maxAliasCount: 50, mapAsMap: true });
        }
        tree = document.createElement('div');
        tree.className = 'structured-tree';
        let remaining = 2000;
        const render = (key, item, ancestors = []) => {
          const row = document.createElement('div');
          if (--remaining < 0) {
            row.textContent = t('structuredLimit');
            return row;
          }
          const label = key === null ? '' : `${key}: `;
          if (item === null || typeof item !== 'object') {
            row.className = 'structured-value';
            row.textContent =
              label + (typeof item === 'string' ? JSON.stringify(item) : String(item));
            return row;
          }
          if (ancestors.includes(item)) {
            row.textContent = label + t('structuredReference');
            return row;
          }
          const entries = item instanceof Map ? [...item.entries()] : Object.entries(item);
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent =
            label + (Array.isArray(item) ? `[${entries.length}]` : `{${entries.length}}`);
          details.append(summary);
          let populated = false;
          const populate = () => {
            if (populated || !details.open) return;
            populated = true;
            const children = document.createElement('div');
            children.className = 'structured-children';
            for (const [name, child] of entries) {
              children.append(render(String(name), child, [...ancestors, item]));
              if (remaining < 0) break;
            }
            details.append(children);
          };
          populateNodes.set(details, populate);
          details.addEventListener('toggle', () => {
            populate();
            updateAll();
          });
          if (key === null) {
            details.open = true;
            populate();
          }
          return details;
        };
        tree.append(render(null, value));
        block.append(tree);
      } catch {
        tree = null;
        button.title = t('structuredUnavailable');
        button.setAttribute('aria-label', button.title);
        button.disabled = true;
        return;
      }
    }
    const show = !pre.hidden;
    pre.hidden = show;
    tree.hidden = !show;
    toggleAll.hidden = !show;
    updateAll();
    button.setAttribute('aria-pressed', String(show));
    button.title = t(show ? 'showCode' : 'showStructured');
    button.setAttribute('aria-label', button.title);
  };
}
