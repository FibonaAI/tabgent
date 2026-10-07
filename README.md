<h1>
  <img src="docs/assets/wordmark.svg" width="196" height="44" alt="Tabgent">
</h1>

**Your agent in every tab.**

Tabgent is a Chrome extension that puts Codex in your browser sidebar. It can read the current page, compare tabs, explain and annotate PDFs, and click, fill forms or search websites for you.

[**Get started →**](#get-started) · [See it in action](#see-tabgent-in-action) · [Use cases](docs/use-cases.md)

**English** · [简体中文](README.zh-CN.md)

<sub>macOS · Chrome 142+ · Uses your Codex login · Open source under MIT · Early preview</sub>

## See Tabgent in action

### Compare multiple pages

Open the pages you want to compare and tell Tabgent what matters to you. This example compares two museums for a day out with a seven-year-old: admission, booking requirements and children's activities, with links to the official sources.

![Official V&A pages beside Tabgent's comparison of admission, booking and children's activities](docs/assets/en/travel.png)

[See the multi-tab example →](docs/features.md#plan-a-day-out) · [Open full-size screenshot](docs/assets/en/travel.png)

### Read and annotate PDFs

Open a PDF to ask about selected text or diagrams and highlight passages. In this example, Tabgent explains the architecture figure on page 3 of _Attention Is All You Need_ and highlights the relevant text. You can download the PDF with your annotations.

![The Transformer architecture figure and highlighted source text beside Tabgent's explanation](docs/assets/en/pdf.png)

[PDF reading, citations and annotation →](docs/features.md#work-with-pdfs) · [Open full-size screenshot](docs/assets/en/pdf.png)

### Use website controls

Tabgent can click buttons, fill forms and set filters. Here, it enters title keywords and a publication year in arXiv's advanced search, runs the search and returns a link to the matching paper.

![arXiv search results after Tabgent sets the filters and returns the matching paper](docs/assets/en/act.png)

[See the website task →](docs/features.md#let-tabgent-search-a-website) · [Open full-size screenshot](docs/assets/en/act.png)

### Ask about selected text

Select text on a page and ask a question in the sidebar without copying and pasting. This example asks why Zotero references appeared on a second computer but PDFs did not. Tabgent explains the cause and suggests checks based on the documentation.

![Selected Zotero documentation beside the quoted passage and Tabgent's troubleshooting answer](docs/assets/en/read.png)

[See the selected-text example →](docs/features.md#understand-a-help-page) · [Open full-size screenshot](docs/assets/en/read.png)

<sub>Screenshots show actual Tabgent sessions. English and Chinese examples were recorded separately, with source pages in their original language. Website content may have changed.</sub>

## More features

- **[File attachments](docs/features.md#give-tabgent-the-right-context):** Upload images, PDFs, Word documents (DOCX) or text files and ask questions about them alongside the current page.
- **[Chat history](docs/features.md#keep-your-chats-connected):** Find conversations for the current URL. Chats opened from links record their origin, so you can switch between related tabs. You can also open a chat in a full-page view.
- **[Follow-ups and task controls](docs/features.md#guide-a-task-as-it-runs):** Send messages while a task runs, use Steer to change the current task, or stop it. Edit or delete queued messages, and watch the pointer and activity log to see what is happening.
- **[Plans and goals](docs/features.md#guide-a-task-as-it-runs):** Use Plan mode, or set a task goal with an optional token budget. Goals can be paused and resumed.
- **[Models and permissions](docs/features.md#make-it-fit-your-work):** Choose a model, reasoning effort, approval mode and which browser windows Tabgent can use.
- **[Skills and tools](docs/features.md#make-it-fit-your-work):** Use skills, web search and services already configured in Codex. Copy answers or export conversation messages as Markdown.

Some features require a compatible Codex version, model or configuration.

## Other use cases

[Collect monthly invoices](docs/use-cases.md#collect-monthly-invoices-without-hunting-through-every-account) · [Fill a job application](docs/use-cases.md#apply-for-a-job-without-entering-your-resume-all-over-again) · [Compare rental listings](docs/use-cases.md#compare-rental-listings-without-losing-track-of-the-details)

[Prompts and instructions for seven use cases →](docs/use-cases.md)

These guides suggest ways to use Tabgent. The full workflows have not all been tested, and results depend on the website.

## Get started

### Requirements

- **macOS**, **Chrome 142+**, and **Python 3.9+**.
- **A compatible Codex installation, signed in.** See [compatibility details](docs/installation.md#requirements).
- Access to this GitHub repository while it is private.

Tabgent uses your existing Codex login and settings. It is not yet listed in the Chrome Web Store; installation requires loading the extension locally.

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
~/Library/Application Support/Tabgent/extension

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
   ~/Library/Application Support/Tabgent/extension
   ```

   The installation path stays the same if you use a custom `CODEX_HOME`; that setting only selects your Codex account, configuration and data directory.

4. Pin Tabgent, open a webpage, and click its toolbar icon. Once you see **Codex connected**, try: **“Summarize this page.”**

**Updating:** rerun the installer and reload Tabgent in `chrome://extensions` after active tasks finish. See [installation and troubleshooting](docs/installation.md) for connection problems, custom setups, and uninstall instructions.

## Privacy & control

- **Choose how actions are approved:** Ask for approval, Approve for me, or Full access.
- **Choose which windows the assistant can use:** the current window or all windows. This setting only limits Tabgent’s browser actions; it does not restrict other Codex tools or connected services.
- **Connects to your local Codex installation:** Tabgent connects to Codex on your Mac. There is no separate Tabgent cloud service processing your conversations.
- **Conversation content is sent to Codex:** to answer questions or carry out tasks, your messages, supplied page content and relevant attachments are sent to your configured Codex service. They are not processed solely on your computer.

Read [Privacy & permissions](docs/privacy.md) for data flow, storage locations, and Chrome permissions. Report security concerns using [SECURITY.md](SECURITY.md).

## Current limits

Tabgent is an early preview. **macOS and Chrome are the primary supported setup.** Some older Codex versions may need an update. Tabgent conversations do not synchronize live with Codex Desktop, and after a browser restart, saved conversations may no longer open their original tabs automatically.

## Contribute

Bug reports, suggestions and pull requests are welcome. Start with the [development guide](docs/development.md) and [contribution guidelines](CONTRIBUTING.md).

| Resource                                 | Contents                                     |
| ---------------------------------------- | -------------------------------------------- |
| [Installation](docs/installation.md)     | Setup, updates, troubleshooting, and removal |
| [Development](docs/development.md)       | Run locally, test, and package               |
| [Architecture](docs/architecture.md)     | Extension and native connector internals     |
| [Privacy & permissions](docs/privacy.md) | Data handling and access boundaries          |

This page and the user guide are available in English and Simplified Chinese. The technical guides above are currently in English.

## License

[MIT](LICENSE). Bundled dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

Tabgent is an independent project, not affiliated with OpenAI or Google.
