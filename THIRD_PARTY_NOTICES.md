# Third-party notices

The project license applies to original Browser Agent Connector code and assets.

Playwright and Prettier are development dependencies, not bundled extension
runtime libraries. Their packages include their respective license notices.

Chrome, Chromium, Codex, and OpenAI names identify compatible products. This is
an independent project, not an official Google or OpenAI extension.

PDF.js 6.4.299 by Mozilla contributors is bundled in `extension/vendor/pdfjs/`
under Apache-2.0. See its `LICENSE`, resource notices, and `README.md` for source
and packaging details. PDF rendering and annotation code runs locally.

Marked 18.0.14 is bundled in `extension/vendor/marked/` under the MIT license.
DOMPurify 3.4.16 is bundled in `extension/vendor/dompurify/` under its Apache-2.0
or MPL-2.0 dual license. Their original license files accompany the sources.
They render and sanitize conversation Markdown locally; no CDN is used.

KaTeX 0.19.0 is bundled in `extension/vendor/katex/` under the MIT license.
Its fonts and stylesheet are included for offline mathematical typesetting.
