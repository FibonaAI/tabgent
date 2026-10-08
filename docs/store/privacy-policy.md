# Tabgent privacy policy

Effective date: October 8, 2026.

Tabgent is published by Fibona. For privacy questions or requests, contact
[deeprsi@fibona.ai](mailto:deeprsi@fibona.ai). Product information and source code
are available at [FibonaAI/tabgent](https://github.com/FibonaAI/tabgent).

## Information handled

Tabgent handles the messages and files you submit, the current page's URL and
title, selected text, and page content or screenshots requested for a task. Page
associations let you find conversations about a URL. Browser tools also obtain
information about tabs and controls when needed to carry out instructions.
Selecting text creates a local draft; submitting it provides that text to Codex.
Opening a PDF alone does not send the PDF to Codex.

## Processing and sharing

The extension communicates with a connector on your Mac, which starts a local
Codex app-server. Messages and requested browser results are sent to the service
configured in Codex. Depending on your configuration, this includes OpenAI and
other connected services used for a task. The project's connector does not itself
operate a separate cloud backend. This does not mean processing is entirely local.

Codex and connected services have their own terms, account settings and retention
rules. Review these before submitting sensitive information. Tabgent cannot
promise deletion from providers or a particular provider training policy.

## Storage and deletion

The connector is installed in `~/Library/Application Support/Tabgent`. Codex login,
configuration and conversation history remain in the Codex data directory, usually
`~/.codex` or the configured `CODEX_HOME`. Uploaded copies are stored under
`projects/browser-agent-connector/attachments/` in that directory. Chrome stores
extension preferences, page/chat associations and temporary tab/draft state.

Removing an attachment from a draft does not delete its uploaded copy. There is
currently no automatic attachment retention cleanup. To remove uploaded copies,
delete the appropriate files from that attachments directory; earlier conversations
may then lose access to them. Manage shared conversation history through Codex.
Uninstalling the Chrome extension and local connector does not delete that history.
Do not delete your entire Codex directory merely to uninstall Tabgent.

## Controls

You choose the message and attachments to send and can stop tasks. The browser
scope limits Tabgent browser actions to the current window or all windows. Codex's
other tools and connected services are governed by their own permissions. The
approval mode controls Codex action approval; completed actions are not undone
when a task is stopped.

## Limited Use and contact

Tabgent uses browser information to provide the user-facing features described
above. Fibona does not operate a backend that receives your conversations for
advertising or resale. Model processing is performed by the services configured
in Codex, subject to their own policies and your account settings.

For support, use [GitHub Issues](https://github.com/FibonaAI/tabgent/issues).
Do not post private page content, credentials or conversation logs in public
issues. Send privacy requests to [deeprsi@fibona.ai](mailto:deeprsi@fibona.ai).
