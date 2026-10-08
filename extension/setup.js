import { localize } from './i18n.js';
localize();
// Release metadata is bundled at build time; it never supplies executable code.
try {
  const { connectorUrl } = await (await fetch(chrome.runtime.getURL('release.json'))).json();
  if (connectorUrl) {
    const url = new URL(connectorUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) {
      const link = document.querySelector('#connectorDownload');
      link.href = url.href;
      link.hidden = false;
      document.querySelector('#connectorUnavailable').hidden = true;
      document.querySelector('#installDownload').hidden = false;
      document.querySelector('#installSource').hidden = true;
    }
  }
} catch {
  // Development builds remain usable without a published download URL.
}
