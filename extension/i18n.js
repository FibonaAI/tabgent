export const loadTimeData = {
  getString: (key) => chrome.i18n.getMessage(key) || key,
  getStringF: (key, ...args) => chrome.i18n.getMessage(key, args.map(String)) || key,
  valueExists: (key) => !!chrome.i18n.getMessage(key),
};
export const t = loadTimeData.getString;
export function localize() {
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
  while (walker.nextNode())
    walker.currentNode.textContent = walker.currentNode.textContent.replace(
      /\$i18n\{([^}]+)\}/g,
      (_, key) => t(key),
    );
  for (const el of document.querySelectorAll('*'))
    for (const attr of [...el.attributes]) {
      if (attr.value.includes('$i18n{'))
        el.setAttribute(
          attr.name,
          attr.value.replace(/\$i18n\{([^}]+)\}/g, (_, key) => t(key)),
        );
    }
  document.body.style.visibility = '';
}
