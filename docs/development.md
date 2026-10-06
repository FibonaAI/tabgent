# Development

Use Node.js 22+, Python 3.9+, and a recent Playwright Chromium installation.
The shipped extension has no Node.js runtime dependency and no build step.

```sh
npm ci
npx playwright install chromium
python3 extension/native/install.py --dev
npm run dev
```

`npm run dev` registers the source extension and launches a dedicated Chrome for
Testing profile. It does not reuse your everyday Chrome profile. Set `CHROME_PATH`
when using a different compatible browser binary. Set `CHROME_PROFILE` to choose
a different development profile. `PYTHON` selects a development Python command.

Reload the extension after frontend changes. Run the `--dev` installer again after
changing the native host. The installed native host intentionally runs outside
the source directory to avoid macOS protected-folder restrictions.

## Default checks

```sh
npm test
npm run format:check
```

The default suite checks syntax and English string references, scoped-browser
guards, selection ownership, DOM range capture, native disconnect reporting,
upload validation, and the chat UI with a controlled bridge. Browser tests launch
headless Chromium and use local fixtures. They do not authenticate or call a real
model. `CHROME_PATH` can override the headless binary too.

JavaScript/HTML/CSS/JSON/Markdown use Prettier. Python uses Black and four-space indentation.
To format Python, use a development virtual environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m black extension/native extension/tests scripts
```

`npm run check` validates Python syntax without creating bytecode files.

## Optional integration checks

These are deliberately excluded from `npm test`:

| Check                                        | Prerequisites and effects                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `python3 extension/tests/native-smoke.py`    | Installed Codex; isolated signed-out app-server tests.                                       |
| `python3 extension/tests/native-install.py`  | Installed Codex; installation discovery and signed-out recovery.                             |
| `python3 extension/tests/session-storage.py` | Installed Codex with project APIs; isolated shared-home semantics.                           |
| `python3 extension/tests/oauth-preauth.py`   | Installed Codex and network; starts and cancels real OAuth flows without completing sign-in. |
| `node extension/tests/browser-input.cjs`     | Loaded extension in a dedicated debug browser; manipulates local fixture pages.              |

Start a debug browser with:

```sh
CHROME_DEBUG_PORT=9341 npm run dev
```

Tests default to `http://127.0.0.1:9341`; override it with `CHROME_CDP`. Close any
existing development instance for that profile before changing its launch flags.
Never point integration tests at a personal browser with important tabs or drafts.

## Packaging

```sh
npm run package
```

The result is `dist/Tabgent-macOS.zip`. Packaging includes the
extension runtime, Python connector, installation entry point, documentation,
and licenses. It also includes the development scripts and tests so the archive can be inspected
and developed independently. Dependencies, local profiles, credentials, and caches are excluded. No signing, publishing, or Git commit is performed.

### Manual conversation regression

Click the toolbar icon twice: the sidebar must show and hide without a menu.
Open the conversation in a new Agent tab. Check that messages, drafts, attachments
and approvals synchronize with the original sidebar and the original page remains
the default context. The new Agent tab must not show another expand button.
Its own sidebar must have an independent thread. Close either view and verify
the remaining view keeps its conversation. Test the Agent + button creates an empty Agent tab with the same original page,
model, effort and scope, but no shared history, draft or attachments.
Do not replace Chrome's native new-tab page or inject an Agent overlay into websites.

## Isolated browser input tests

Run `npm run test:browser` to exercise real Chrome input against local fixtures:
trusted clicks and typing, shadow DOM, cross-origin frames, dragging, screenshots,
and history navigation. The runner uses a temporary profile and a minimal test
extension with no native messaging, so it cannot access your Codex account. Both
are removed after the run. It requires the Playwright Chromium browser.
