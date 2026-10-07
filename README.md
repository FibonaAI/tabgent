<h1>
  <img src="docs/assets/wordmark.svg" width="196" height="44" alt="Tabgent">
</h1>

**Your agent in every tab.**

Tabgent is a Chrome extension that brings **Codex into your browser sidebar**. Ask questions about the page you’re reading, compare open tabs, discuss PDFs, and let the agent navigate and interact with websites—all in the same conversation.

**macOS · Chrome 142+ · Uses your Codex login · MIT licensed · Early preview**

**English** · [简体中文](README.zh-CN.md)

[Get started](#get-started) · [What you can do](#what-you-can-do) · [Privacy & control](#privacy--control) · [Contribute](#contribute)

![An article alongside Tabgent, with a selected passage quoted in the conversation](docs/assets/read-with-agent.png)

## What you can do

| Your task                | How Tabgent helps                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **Understand a page**    | Select a passage and ask about it. The quote and its location accompany your message.     |
| **Read a PDF**           | Discuss passages, highlight text, and download an annotated copy.                         |
| **Research across tabs** | Ask the agent to read and compare pages in your current window or across browser windows. |
| **Act on a website**     | Navigate, fill forms, choose options, and inspect the result, with visible tool activity. |

### Read with the page in context

Start with “What is this article saying?” or select a specific passage and ask “Explain this part.” Attach an image, PDF, or document when the answer needs more context.

You can return to previous conversations from **Page chats**. A conversation becomes associated with a URL when you send a message on that page, so the same conversation can cover several pages.

### Make PDFs part of the conversation

Online PDFs open in the bundled PDF.js viewer. Select a passage to quote it with its page and position, ask for an explanation, or have the agent highlight it. Download the edited PDF to keep your annotations.

![A PDF passage quoted in Tabgent beside its source document](docs/assets/chat-with-pdf.png)

If a document cannot load in PDF.js, Chrome’s native viewer remains available. Scanned PDFs may require visual reading or OCR; text extraction is not available for every document.

### Compare without copying between tabs

Ask “Which plan is best for a team of five?” and let the agent compare the live pages. Choose **Current window** or **All windows** to set the scope of Tabgent’s browser tools.

![Tabgent compares plans using two open tabs](docs/assets/compare-tabs.png)

### Take action, and stay in the loop

Ask the agent to fill a form, change an option, or open the next page. Follow its tool calls, queue a follow-up, steer an active task, or stop it. Choose your approval mode before starting.

![Visible browser actions fill a form and stop before saving](docs/assets/act-on-page.png)

<sub>Screenshots show the extension UI with illustrative demo content. Appearance may differ from the latest version.</sub>

### Keep your workflow close

- **Choose the model and reasoning effort** from the composer.
- **Open a full Agent tab** when you need more room for the same conversation.
- **Start a fresh chat with +** without navigating away from the webpage.
- **Use /** to access skills, goals, model selection, and Plan mode.
- **Expand the work log** to inspect tool calls, progress, and reasoning summaries.

## Get started

### Requirements

- **macOS**, **Chrome 142+**, and **Python 3.9+**.
- **Codex installed and signed in**, with a compatible app-server. See [compatibility details](docs/installation.md#requirements).
- Access to this GitHub repository while it is private.

Tabgent reuses your Codex authentication and configuration. There is currently no Chrome Web Store installation; install it locally using one of the options below.

### Option 1: Ask Codex to install it

Copy this prompt into Codex:

```text
Install Tabgent from https://github.com/FibonaAI/tabgent.

Check that this Mac has Python 3.9+, Chrome 142+, and a compatible Codex
installation. Clone the repository into an unused folder using my existing
GitHub access, read docs/installation.md, and run:
python3 extension/native/install.py

Use my existing CODEX_HOME and Codex sign-in. Open chrome://extensions,
enable Developer mode, and load the unpacked extension from:
${CODEX_HOME:-$HOME/.codex}/plugins/tabgent/extension

Pin it and open the Agent sidebar. Keep my existing Chrome profile and tabs.
Use browser controls if available; otherwise guide me through the remaining
clicks. Help resolve missing access, dependencies, or sign-in, and verify
that the sidebar shows “Codex connected”. Report what you verified.
```

### Option 2: Install manually

1. Clone or download this repository.
2. Double-click **Install.command**, or run the following from the repository root:

   ```sh
   python3 extension/native/install.py
   ```

3. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select:

   ```text
   ~/.codex/plugins/tabgent/extension
   ```

   If you use a custom `CODEX_HOME`, select its `plugins/tabgent/extension` directory instead.

4. Pin Tabgent, open a webpage, and click its toolbar icon. Once you see **Codex connected**, try: **“Summarize this page.”**

**Updating:** rerun the installer and reload Tabgent in `chrome://extensions` after active tasks finish. See [installation and troubleshooting](docs/installation.md) for connection problems, custom setups, and uninstall instructions.

## Privacy & control

- **You choose approval behavior:** Ask for approval, Approve for me, or Full access.
- **You choose browser scope:** current window or all windows. This scope applies to Tabgent’s browser tools, not native Codex tools or configured integrations.
- **Your existing Codex setup is reused:** the extension talks to a local connector and Codex app-server. Tabgent has no separate project-operated cloud backend.
- **Model processing is not local-only:** messages, supplied page content, and attachments used in a task are sent to your configured Codex service.

Read [Privacy & permissions](docs/privacy.md) for data flow, storage locations, and Chrome permissions. Report security concerns using [SECURITY.md](SECURITY.md).

## Current limits

Tabgent is an early preview. **macOS and Chrome are the primary supported setup.** Some Codex versions may lack the required app-server APIs. Tabgent conversations do not synchronize live with Codex Desktop, and browser restarts can lose tab pairings even when conversation history remains stored.

## Contribute

Bug reports, usability feedback, and focused pull requests are welcome. Start with the [development guide](docs/development.md) and [contribution guidelines](CONTRIBUTING.md).

| Resource                                 | Contents                                     |
| ---------------------------------------- | -------------------------------------------- |
| [Installation](docs/installation.md)     | Setup, updates, troubleshooting, and removal |
| [Development](docs/development.md)       | Run locally, test, and package               |
| [Architecture](docs/architecture.md)     | Extension and native connector internals     |
| [Privacy & permissions](docs/privacy.md) | Data handling and access boundaries          |

The guides linked above are currently in English. This README is also available in [简体中文](README.zh-CN.md), with matching content.

## License

[MIT](LICENSE). Bundled dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

Tabgent is an independent project, not affiliated with OpenAI or Google.
