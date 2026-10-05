# Data storage and permissions

## Data flow

Chrome extension → local Python native host → local Codex app-server → configured
Codex service. The extension has no separate project-operated cloud backend.
Local transport does not mean model processing stays on your computer.

The model receives what you submit and the browser results requested by its
tools. Selecting text captures a draft quote locally; sending a message includes
that quote and its location metadata. A selection is limited to 20,000 characters.
The truncated state is exposed in its tooltip and model context.

Browser content and selection metadata are marked as untrusted context. Do not
assume prompt-injection defenses can make an arbitrary page safe. Scope checks
limit which tabs tools can access; they do not validate the intentions of a page.

## Permissions

| Permission                            | Why it is needed                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| HTTP(S) host access and `scripting`   | Read the selected page and observe text selection.                                    |
| `tabs` and `webNavigation`            | Associate conversations with tabs and preserve them across navigation.                |
| `sidePanel`                           | Display the conversation alongside the page.                                          |
| `storage`                             | Keep preferences, draft references, and tab/session state.                            |
| `nativeMessaging`                     | Connect to the installed local Python host.                                           |
| `debugger`                            | Perform trusted browser input and screenshots. Chrome may show an attachment notice.  |
| `declarativeNetRequestWithHostAccess` | Open online PDF documents in the bundled local viewer; allow native fallback per tab. |
| `contextMenus`                        | Quote selected text, including text in Chrome's native PDF viewer.                    |

Browser tools enforce current-window or all-windows scope on each operation.
Incognito and internal browser pages are excluded from ordinary page automation.
A native new tab may be navigated to an HTTP(S) page without inspecting its UI.

## Storage

All Codex paths respect `CODEX_HOME`; the default is `~/.codex`.

| Location                                        | Contents                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `plugins/browser-agent-connector/`              | Installed connector and, for normal installations, extension files.     |
| `projects/browser-agent-connector/attachments/` | User-uploaded file copies, each in a generated subdirectory.            |
| Shared Codex session storage and index          | Conversation history and project association.                           |
| Chrome extension session storage                | Tab bindings, selection drafts, text drafts, and attachment references. |

Removing an attachment from the composer removes its draft reference. It does not
delete the saved file. Sent attachments remain available for conversation history.
There is no automatic file-retention cleanup yet. Browser restarts can lose tab
pairings even though Codex history remains available.

The connector reuses Codex authentication. It does not copy credentials into the
extension or rewrite the user's `config.toml`. Shell, desktop app, and multi-agent
tool restrictions apply to the app-server processes it starts. The attachment
reader only accepts files under the upload directory.

## Reporting a concern

See [SECURITY.md](../SECURITY.md). Do not include credentials, private page contents,
or unredacted conversation logs in public issues.

PDF.js renders documents locally in an extension page. PDF scripts and automatic
alt-text model downloads are disabled. Opening a PDF alone does not send it to
Codex; submitting a quote or asking Agent to read it supplies that context.
Highlights and comments are saved only when you download the edited PDF.
