let renderer;
const diagrams = new Map();

// Keep Mermaid local and lazy; ordinary messages do not load the diagram library.
export function addMermaidView(block, heading, pre, code, t) {
  if (!code?.classList.contains('language-mermaid')) return;
  const source = code.textContent;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'structured-toggle';
  button.innerHTML =
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="6" y="2" width="8" height="5" rx="1"/><path d="M10 7v4M4 14v-3h12v3"/><rect x="1" y="14" width="6" height="4" rx="1"/><rect x="13" y="14" width="6" height="4" rx="1"/></svg>';
  button.disabled = true;
  button.title = button.ariaLabel = t('showDiagram');
  heading.prepend(button);
  const view = document.createElement('div');
  view.className = 'mermaid-view';
  view.hidden = true;
  block.append(view);
  button.onclick = () => {
    view.hidden = !view.hidden;
    pre.hidden = !view.hidden;
    button.title = button.ariaLabel = t(view.hidden ? 'showDiagram' : 'showCode');
    button.setAttribute('aria-pressed', String(!view.hidden));
  };
  // Markdown is built in a detached fragment; wait until it is mounted for layout.
  queueMicrotask(async () => {
    if (!block.isConnected) return;
    try {
      if (source.length > 50000) throw Error('Diagram too large');
      const dark = matchMedia('(prefers-color-scheme: dark)').matches;
      const key = `${dark}:${source}`;
      if (!diagrams.has(key)) {
        const result = (async () => {
          renderer ||= import('../vendor/mermaid/mermaid.esm.min.mjs').then(
            ({ default: mermaid }) => {
              mermaid.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                htmlLabels: false,
                suppressErrorRendering: true,
                maxTextSize: 50000,
                maxEdges: 500,
                theme: dark ? 'dark' : 'default',
                secure: [
                  'secure',
                  'securityLevel',
                  'startOnLoad',
                  'htmlLabels',
                  'maxTextSize',
                  'maxEdges',
                  'suppressErrorRendering',
                ],
              });
              return mermaid;
            },
          );
          const mermaid = await renderer;
          const host = document.createElement('div');
          host.className = 'mermaid-render-host';
          document.body.append(host);
          try {
            return (await mermaid.render(`diagram-${crypto.randomUUID()}`, source, host)).svg;
          } finally {
            host.remove();
          }
        })();
        diagrams.set(key, result);
        if (diagrams.size > 30) diagrams.delete(diagrams.keys().next().value);
        result.catch(() => diagrams.delete(key));
      }
      const svg = await diagrams.get(key);
      if (!block.isConnected) return;
      // An image document cannot execute links, scripts, or embedded HTML actions.
      const image = document.createElement('img');
      image.alt = t('showDiagram');
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      view.append(image);
      button.disabled = false;
      button.click();
    } catch {
      if (!block.isConnected) return;
      button.remove();
      view.hidden = false;
      view.textContent = t('diagramUnavailable');
    }
  });
}
