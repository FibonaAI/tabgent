# Reviewer notes

Draft for the dashboard. Supply verified download/support URLs and an appropriate
Codex test-access arrangement before submission; do not submit these instructions
with unresolved dependencies.

## Single purpose

Enable users to read and act on their current browser pages through a Codex
conversation in Chrome. Page reading, multi-tab comparison, PDF annotation and
browser actions are available from this same user-directed workflow.

## Prerequisites and test sequence

1. Use macOS with Chrome 142+, Python 3.9+ and compatible Codex access. Windows and
   Linux are unsupported. Download the matching connector from the public setup
   link supplied with the submission.
2. Install the store extension. Pin its icon and open it on a normal HTTPS page.
   Without a connector, the sidebar should offer connector setup.
3. Install the connector, return to the sidebar and click **Check again**. The
   installer registers `com.tabgent.codex` and restricts it to the submitted ID.
4. Follow the Codex installation or sign-in prompt if shown. Use the approved test
   account arrangement; production users supply their own Codex access.
5. Open https://www.zotero.org/support/sync, select a paragraph and ask for an
   explanation. The answer should appear beside the page with the supplied quote.
6. Open another relevant page and ask for a comparison. Check that browser tools
   obey the selected Current window or All windows scope.
7. Open https://arxiv.org/pdf/1706.03762. Ask about page 3, select a passage and ask
   to highlight it. Download an annotated copy. Switch to Chrome's PDF viewer if
   needed; precise annotation requires the bundled viewer.
8. While a task runs, queue a follow-up, edit/remove it, use Steer and stop a task.
   Expand the activity record to inspect tool operations.
9. Restart the browser and check saved chats. Original tab pairings may not survive
   a restart. Uninstalling the extension does not delete shared Codex history.

## Permission justifications

| Permission                            | Implemented use                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `sidePanel`                           | Display the conversation next to the current webpage.                   |
| `storage`                             | Save preferences, page/chat associations and temporary tab/draft state. |
| `tabs`                                | Identify the page attached to each message and switch related tabs.     |
| `webNavigation`                       | Track navigation and linked-tab origins for conversation context.       |
| HTTP(S) hosts and `scripting`         | Read pages and selections across user-chosen sites, including frames.   |
| `debugger`                            | Send browser input and capture screenshots for requested browser tasks. |
| `nativeMessaging`                     | Communicate with the separately installed local Codex connector.        |
| `contextMenus`                        | Quote selected text, including from Chrome's native PDF viewer.         |
| `declarativeNetRequestWithHostAccess` | Route online PDFs into the bundled viewer, with native-viewer fallback. |

## Data and code

The route is extension → local Python connector → local Codex app-server → the
configured Codex service. The setup page discloses that messages and relevant
browser results leave the computer for processing. See the public privacy policy
supplied with the submission for storage, sharing and deletion information.

The extension bundles its JavaScript, PDF.js, Markdown and math dependencies.
The connector download URL is a build-time value. The native host and Codex
process are external dependencies; provide their behavior and access instructions
to reviewers. Model tool requests use the declared browser action schema. Do not
represent this as a complete remote-code or security audit.

For the privacy declaration, account for website content, URLs/page titles,
selections, screenshots, submitted messages and attachments. Their presence in a
local bridge does not make third-party model processing local. Check each current
dashboard category against actual behavior instead of selecting “no user data”.
