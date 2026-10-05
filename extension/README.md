# Extension source

This directory is the unpacked Chrome extension. It needs no frontend build step.

- [Project overview and installation](../README.md)
- [Development and tests](../docs/development.md)
- [Architecture](../docs/architecture.md)
- [Data and permissions](../docs/privacy.md)

For local development, run `python3 extension/native/install.py --dev` from the
repository root, then load this directory in `chrome://extensions`.

Keep the manifest's public `key` stable: Chrome derives the extension ID from it,
and the native host uses that ID to restrict allowed callers. This is a public
identifier, not a signing key or credential.
