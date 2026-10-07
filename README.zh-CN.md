<h1>
  <img src="docs/assets/wordmark.svg" width="196" height="44" alt="Tabgent">
</h1>

**在浏览器里，与你并肩工作的智能助手。**

Tabgent 是一款 Chrome 扩展，将 **Codex 带到浏览器侧边栏**。你可以围绕正在阅读的网页提问、比较多个标签页、讨论 PDF，也可以让智能助手浏览和操作网站——这些都能在同一个会话中完成。

**macOS · Chrome 142+ · 使用现有 Codex 登录 · MIT 许可 · 早期预览版**

[English](README.md) · **简体中文**

[开始使用](#开始使用) · [你可以做什么](#你可以做什么) · [隐私与控制](#隐私与控制) · [参与贡献](#参与贡献)

![文章旁边的 Tabgent，选中的段落已作为引用加入会话](docs/assets/read-with-agent.png)

## 你可以做什么

| 你的任务         | Tabgent 如何帮助你                                           |
| ---------------- | ------------------------------------------------------------ |
| **理解网页**     | 选中一段文字并提问，引用内容和所在位置会随消息一起发送。     |
| **阅读 PDF**     | 讨论段落、标注文字，并下载带注释的副本。                     |
| **跨标签页研究** | 让智能助手阅读和比较当前窗口或所有浏览器窗口中的网页。       |
| **操作网站**     | 浏览页面、填写表单、选择选项、检查结果，并查看工具执行过程。 |

### 带着网页上下文阅读

直接问“这篇文章在讲什么？”，或者选中一段文字，问“解释一下这部分”。需要更多背景时，还可以附上图片、PDF 或文档。

通过 **Page chats（网页会话）** 可以回到以前的会话。在某个网页发送消息后，这个会话就会与该网址关联，因此一个会话可以涵盖多个网页。

### 把 PDF 带进会话

在线 PDF 会在内置的 PDF.js 阅读器中打开。选中段落即可引用，并附带页码和位置；你可以让助手解释或高亮标注。下载编辑后的 PDF，即可保留注释。

![Tabgent 中引用的 PDF 段落及其旁边的源文档](docs/assets/chat-with-pdf.png)

如果文档无法在 PDF.js 中加载，仍可使用 Chrome 原生阅读器。扫描版 PDF 可能需要视觉阅读或 OCR，并非所有文档都能提取文字。

### 比较标签页，不用来回复制

问一句“五人团队选哪个套餐更合适？”，让助手比较实际网页。通过 **Current window（当前窗口）** 或 **All windows（所有窗口）**，设置 Tabgent 浏览器工具的访问范围。

![Tabgent 根据两个已打开的标签页比较套餐](docs/assets/compare-tabs.png)

### 让助手行动，随时掌握进展

让助手填写表单、调整选项，或打开下一个网页。你可以查看工具调用、排队发送后续消息、在任务执行中补充指令，或停止任务。开始前，可以选择操作审批模式。

![可见的浏览器操作过程：填写表单并在保存前停下](docs/assets/act-on-page.png)

<sub>截图展示扩展界面，内容为演示示例；外观可能与最新版本有所不同。</sub>

### 在会话中完成更多工作

- **选择模型和推理强度**：直接在输入框旁设置。
- **打开完整的 Agent 标签页**：为同一个会话提供更大的显示空间。
- **点击 + 新建会话**：无需离开当前网页。
- **输入 /**：使用技能、目标、模型选择和计划模式。
- **展开工作记录**：查看工具调用、进度和推理摘要。

## 开始使用

### 环境要求

- **macOS**、**Chrome 142+** 和 **Python 3.9+**。
- **已安装并登录 Codex**，且 app-server 版本兼容。参见[兼容性说明](docs/installation.md#requirements)。
- 仓库处于私有状态期间，需要拥有该 GitHub 仓库的访问权限。

Tabgent 使用你现有的 Codex 登录和配置。目前尚未提供 Chrome 应用商店安装，请使用以下任一方式在本地安装。

### 方式一：让 Codex 帮你安装

将下面的提示词复制到 Codex：

```text
请从 https://github.com/FibonaAI/tabgent 安装 Tabgent。

检查这台 Mac 是否有 Python 3.9+、Chrome 142+ 和兼容的 Codex。
使用我现有的 GitHub 权限，将仓库克隆到一个未被占用的目录，
阅读 docs/installation.md，并运行：
python3 extension/native/install.py

使用我现有的 CODEX_HOME 和 Codex 登录。打开 chrome://extensions，
启用开发者模式，从以下目录加载已解压的扩展：
${CODEX_HOME:-$HOME/.codex}/plugins/tabgent/extension

固定扩展并打开 Agent 侧边栏。保留我现有的 Chrome 配置和标签页。
如果可以控制浏览器，请直接操作；否则只引导我完成剩余点击。
帮助解决访问权限、依赖或登录问题，验证侧边栏显示“Codex connected”，
并告诉我实际验证了哪些内容。
```

### 方式二：手动安装

1. 克隆或下载本仓库。
2. 双击 **Install.command**，或在仓库根目录运行：

   ```sh
   python3 extension/native/install.py
   ```

3. 打开 `chrome://extensions`，启用**开发者模式**，选择**加载已解压的扩展程序**，然后选择：

   ```text
   ~/.codex/plugins/tabgent/extension
   ```

   如果使用自定义 `CODEX_HOME`，请改选该目录下的 `plugins/tabgent/extension`。

4. 固定 Tabgent，打开一个网页，点击工具栏中的扩展图标。看到 **Codex connected** 后，试着问：**“总结一下这个网页。”**

**更新：** 等正在执行的任务结束后，重新运行安装程序，再到 `chrome://extensions` 重新加载 Tabgent。连接问题、自定义配置和卸载方法请参阅[安装与故障排查](docs/installation.md)。

## 隐私与控制

- **自行选择审批方式：** Ask for approval（请求批准）、Approve for me（代为审批）或 Full access（完全访问）。
- **自行选择浏览器范围：** 当前窗口或所有窗口。这一范围限制适用于 Tabgent 的浏览器工具，不适用于 Codex 原生工具或已配置的集成。
- **沿用现有 Codex 配置：** 扩展通过本地连接器和 Codex app-server 工作。Tabgent 没有单独运营的云端后端。
- **模型处理并非完全在本地进行：** 消息、提供的网页内容和任务中使用的附件，会发送到你配置的 Codex 服务。

数据流、存储位置和 Chrome 权限详见[隐私与权限](docs/privacy.md)。安全问题请按 [SECURITY.md](SECURITY.md) 中的方式报告。

## 当前限制

Tabgent 仍处于早期预览阶段，**主要支持 macOS 和 Chrome**。部分 Codex 版本可能缺少所需的 app-server API。Tabgent 会话不会与 Codex 桌面端实时同步；重启浏览器后，标签页与会话的对应关系可能丢失，但会话历史仍可保留在存储中。

## 参与贡献

欢迎提交问题报告、使用体验反馈，以及范围明确的 Pull Request。请先阅读[开发指南](docs/development.md)和[贡献指南](CONTRIBUTING.md)。

| 文档                             | 内容                       |
| -------------------------------- | -------------------------- |
| [安装指南](docs/installation.md) | 安装、更新、故障排查和卸载 |
| [开发指南](docs/development.md)  | 本地运行、测试和打包       |
| [架构说明](docs/architecture.md) | 扩展与本地连接器的内部结构 |
| [隐私与权限](docs/privacy.md)    | 数据处理和访问边界         |

以上链接文档目前为英文。本 README 同时提供内容一致的 [English](README.md) 版本。

## 许可证

采用 [MIT 许可证](LICENSE)。内置依赖保留各自的许可证，详见[第三方声明](THIRD_PARTY_NOTICES.md)。

Tabgent 是独立项目，与 OpenAI 或 Google 没有关联。
