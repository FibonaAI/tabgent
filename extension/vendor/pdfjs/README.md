# PDF.js 6.4.299

Vendored from the official Mozilla release:
https://github.com/mozilla/pdf.js/releases/download/v6.4.299/pdfjs-6.4.299-dist.zip

License: Apache-2.0; see LICENSE and individual resource notices.

The viewer, library, worker, fonts, CMaps, ICC profiles, images, and WASM are
bundled locally. Source maps, the sample PDF, debugging tools, scripting sandbox,
and translations other than en-US are omitted. `web/locale/locale.json` is
restricted to en-US. Upstream executable code is unmodified.

Tabgent's wrapper disables PDF JavaScript, remote model downloads,
and document replacement through the viewer. Integration lives in `extension/pdf/`.
