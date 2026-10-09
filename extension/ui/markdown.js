import { Marked } from '../vendor/marked/marked.js';
import DOMPurify from '../vendor/dompurify/purify.js';
import katex from '../vendor/katex/katex.mjs';
import hljs from '../vendor/highlight/highlight.js';

// Tokenize before Markdown consumes the backslashes in \(...\) and \[...\].
// Code spans and fences remain ordinary Markdown tokens, never math.
export function markdownFragment(text) {
  const formulas = [];
  const images = [];
  const marker = `math-${crypto.randomUUID()}`;
  const renderer = (token) => {
    const index = formulas.push(token) - 1;
    return `<span data-${marker}="${index}"></span>`;
  };
  const parser = new Marked({
    gfm: true,
    renderer: {
      image(token) {
        const index = images.push(token) - 1;
        return `<span data-${marker}-image="${index}"></span>`;
      },
    },
    extensions: [
      {
        name: 'displayMath',
        level: 'block',
        start: (source) => source.search(/\\\[|\$\$/),
        tokenizer(source) {
          const match = /^(?:\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$)(?:[ \t]*\n|$)/.exec(source);
          if (match)
            return {
              type: 'displayMath',
              raw: match[0],
              text: match[1] ?? match[2],
              display: true,
            };
        },
        renderer,
      },
      {
        name: 'inlineMath',
        level: 'inline',
        start: (source) => source.search(/\\[([]|\$/),
        tokenizer(source) {
          const display = /^(?:\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$)/.exec(source);
          if (display)
            return {
              type: 'inlineMath',
              raw: display[0],
              text: display[1] ?? display[2],
              display: true,
            };
          const inline =
            /^\\\(([\s\S]*?)\\\)/.exec(source) ||
            /^\$(?!\$)([^\s$](?:(?:\\.|[^$\\\n])*?[^\s$\\])?)\$(?!\d)/.exec(source);
          if (inline)
            return { type: 'inlineMath', raw: inline[0], text: inline[1], display: false };
        },
        renderer,
      },
    ],
  });
  const fragment = DOMPurify.sanitize(parser.parse(text), {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['img', 'style', 'input', 'button', 'form', 'iframe', 'svg', 'video', 'audio'],
    FORBID_ATTR: ['style', 'id', 'name'],
  });
  for (const placeholder of fragment.querySelectorAll(`[data-${marker}-image]`)) {
    const token = images[Number(placeholder.getAttribute(`data-${marker}-image`))];
    const img = document.createElement('img');
    img.alt = token.text || '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    const src = token.href;
    if (/^\/(?!\/)/.test(src)) img.dataset.localImage = src;
    else if (/^https:\/\//i.test(src) || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(src))
      img.src = src;
    else {
      placeholder.textContent = token.text || '';
      continue;
    }
    placeholder.replaceWith(img);
  }
  for (const code of fragment.querySelectorAll('pre code')) {
    const language = [...code.classList]
      .find((name) => name.startsWith('language-'))
      ?.slice('language-'.length);
    // Keep unknown languages and very large blocks cheap during streaming.
    if (!language || !hljs.getLanguage(language) || code.textContent.length > 100_000) continue;
    code.innerHTML = DOMPurify.sanitize(
      hljs.highlight(code.textContent, { language, ignoreIllegals: true }).value,
    );
  }
  // Only our generated placeholders get renderer markup. Untrusted Markdown
  // cannot supply styles/SVG; KaTeX's trusted commands stay disabled.
  for (const element of fragment.querySelectorAll(`[data-${marker}]`)) {
    const formula = formulas[Number(element.getAttribute(`data-${marker}`))];
    element.removeAttribute(`data-${marker}`);
    katex.render(formula.text, element, {
      displayMode: formula.display,
      throwOnError: false,
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
      strict: 'ignore',
    });
  }
  return fragment;
}
