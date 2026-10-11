# Mermaid 12.1.0

Source: https://www.npmjs.com/package/mermaid/v/12.1.0 (MIT).

Copied from the pinned development dependency with:

```sh
mkdir -p extension/vendor/mermaid/chunks/mermaid.esm.min
cp node_modules/mermaid/dist/mermaid.esm.min.mjs extension/vendor/mermaid/
cp node_modules/mermaid/dist/chunks/mermaid.esm.min/*.mjs extension/vendor/mermaid/chunks/mermaid.esm.min/
cp node_modules/mermaid/LICENSE extension/vendor/mermaid/
```

Source maps and alternate builds are omitted. Bundled chunks retain upstream
license comments. No remote scripts are loaded at runtime.
