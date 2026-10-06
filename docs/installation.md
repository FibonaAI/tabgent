# Installation and troubleshooting

## Requirements

- macOS, Python 3.9 or later, and Chrome 142 or later.
- A compatible Codex app-server and access to Codex. Desktop-bundled binaries,
  Homebrew locations, and `codex` on `PATH` are discovered automatically.
- The app-server must support project APIs, dynamic tools, and the turn input
  protocol used here. Not every historical or standalone CLI version has been
  validated. A missing API is a compatibility issue, not proof you are signed out.

## Install

From the repository root, run `python3 extension/native/install.py` or double-click
`Install.command`. Load the installed directory in `chrome://extensions`:

```text
~/.codex/plugins/tabgent/extension
```

Enable Developer mode and choose Load unpacked. Pin the extension, then click
its icon to show or hide the Agent sidebar. No Chrome Web Store installation is provided by this
repository yet.

The installer registers the native host in the standard macOS profile locations
for Chrome, Chrome for Testing, Chromium, Edge, and Brave. Only Chrome is the
primary tested browser. A custom browser profile may need its own native-host
registration. A browser restart can be necessary after registering a host.

## Development installation

```sh
python3 extension/native/install.py --dev
```

Load `<repository>/extension` directly. The Python host still gets copied into
the plugin directory: Chrome may be blocked by macOS privacy controls from
executing a Python file inside Documents or Desktop.

## Update

Rerun the same installer command, then reload the extension in
`chrome://extensions`. Wait for active turns to finish first. Conversations are
stored separately; reloading a development extension can interrupt a running
turn or its tab pairing.

## Custom Codex home

```sh
CODEX_HOME=/absolute/path/to/codex-home python3 extension/native/install.py
```

The generated launcher remembers this location. Use the same home as the Codex
installation whose account and conversations you want to use. `Install.command`
also respects `CODEX_HOME` when opening the installed extension folder.

## Troubleshooting

| Symptom                                                 | What to check                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| The setup screen asks for the connector                 | Run the installer and reload the extension. The extension and native-host registration must use the same extension ID.               |
| Codex is installed but cannot start                     | Check app-server compatibility and update Codex.                                                                                     |
| Sign-in is requested                                    | Complete Codex sign-in. The extension checks for the updated account state; use Retry if needed.                                     |
| The sidebar is closed on a new tab                      | Click the toolbar icon to reopen the sidebar.                                                                                        |
| A file cannot be read                                   | Check its size and format. Scanned PDFs need OCR elsewhere; this connector does not extract text from every binary file.             |
| A conversation is missing from the desktop project list | Add `~/.codex/projects/browser-agent-connector` as a project directory in the desktop app. Shared history remains in the Codex home. |

## Uninstall

Remove the extension in Chrome. Delete the registration file named
`com.tabgent.codex.json` from the relevant browser's
`~/Library/Application Support/<browser>/NativeMessagingHosts/` directory.
You may then remove `~/.codex/plugins/tabgent`.

The shared Codex conversation history and uploaded files in the project directory
are retained. Do not delete the entire Codex home to uninstall this extension.
