<h1>
  <img src="docs/assets/wordmark.svg" width="196" height="44" alt="Tabgent">
</h1>

**每个标签页，都有你的智能助手。**

Tabgent 是一个 Chrome 扩展，让你在浏览器侧边栏使用 Codex。它能阅读当前网页、比较多个标签页、解释和标注 PDF，也能按你的要求点击、填表和搜索。

[**开始使用 →**](#开始使用) · [功能演示](#功能演示) · [使用场景](docs/use-cases.zh-CN.md)

[English](README.md) · **简体中文**

<sub>macOS · Chrome 142+ · 使用现有 Codex 登录 · MIT 开源许可 · 早期预览版</sub>

## 功能演示

点击动图可查看大图。

<table>
  <tr>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/11-ask-about-tabs.gif"><img src="docs/assets/demos/11-ask-about-tabs.gif" alt="询问网页内容" width="180"></a><br>
      <strong>询问网页内容</strong>
    </td>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/12-hotel-comparison.gif"><img src="docs/assets/demos/12-hotel-comparison.gif" alt="比较酒店" width="180"></a><br>
      <strong>比较酒店</strong>
    </td>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/04-pdf-explain-highlight.gif"><img src="docs/assets/demos/04-pdf-explain-highlight.gif" alt="阅读标注论文" width="180"></a><br>
      <strong>阅读标注论文</strong>
    </td>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/03-github-code.gif"><img src="docs/assets/demos/03-github-code.gif" alt="导航讲解代码" width="180"></a><br>
      <strong>导航讲解代码</strong>
    </td>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/05-fill-search-form.gif"><img src="docs/assets/demos/05-fill-search-form.gif" alt="填写搜索条件" width="180"></a><br>
      <strong>填写搜索条件</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/13-manual.gif"><img src="docs/assets/demos/13-manual.gif" alt="查找说明书步骤" width="180"></a><br>
      <strong>查找说明书步骤</strong>
    </td>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/14-job-application.gif"><img src="docs/assets/demos/14-job-application.gif" alt="填写求职申请" width="180"></a><br>
      <strong>填写求职申请</strong>
    </td>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/15-event-registration.gif"><img src="docs/assets/demos/15-event-registration.gif" alt="填写报名表" width="180"></a><br>
      <strong>填写报名表</strong>
    </td>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/07-recipe-quantities.gif"><img src="docs/assets/demos/07-recipe-quantities.gif" alt="换算食谱份量" width="180"></a><br>
      <strong>换算食谱份量</strong>
    </td>
    <td width="20%" align="center" valign="top">
      <a href="docs/assets/demos/10-page-history.gif"><img src="docs/assets/demos/10-page-history.gif" alt="找回历史对话" width="180"></a><br>
      <strong>找回历史对话</strong>
    </td>
  </tr>
</table>

[中文对话截图与详细示例 →](docs/features.zh-CN.md)

## 更多功能

- **[上传附件](docs/features.zh-CN.md#把相关材料一起交给助手)**：支持图片、PDF、Word（DOCX）和文本文件，可以结合当前网页提问。
- **[会话历史](docs/features.zh-CN.md#让网页和会话保持关联)**：查看当前网址下的历史对话；从链接打开的会话会记录来处，点击可切换标签页。聊天也可以展开为独立页面。
- **[补充要求或停止任务](docs/features.zh-CN.md#任务进行中也能随时调整)**：执行过程中可以继续发消息，用 Steer 调整当前任务，或点击停止。排队中的消息支持编辑和删除；操作位置和执行记录也可以查看。
- **[计划与目标](docs/features.zh-CN.md#任务进行中也能随时调整)**：支持计划模式，也可以设置任务目标和 token 用量上限，并暂停或恢复目标。
- **[模型与权限](docs/features.zh-CN.md#按你的习惯使用)**：选择模型、思考强度、操作批准方式，以及允许操作的浏览器窗口。
- **[技能与工具](docs/features.zh-CN.md#按你的习惯使用)**：使用 Codex 中已有的技能、网页搜索和已连接的服务。回答可以复制，会话消息可以导出为 Markdown。

部分功能需要相应的 Codex 版本、模型或配置支持。

## 其他使用场景

[收集每月发票](docs/use-cases.zh-CN.md#月底收发票不再逐个翻找) · [填写求职申请](docs/use-cases.zh-CN.md#申请工作少填一遍简历) · [比较房源](docs/use-cases.zh-CN.md#房源看得太多把条件放在一起比较)

[查看七个场景的具体用法 →](docs/use-cases.zh-CN.md)

这些场景提供了提问和操作建议，尚未逐一验证完整流程，实际效果取决于网站。

## 开始使用

### 安装要求

- **macOS**、**Chrome 142+** 和 **Python 3.9+**。
- **已安装并登录 Codex**，且版本兼容。参见[兼容性说明](docs/installation.md#requirements)。
- 仓库处于私有状态期间，需要拥有该 GitHub 仓库的访问权限。

Tabgent 使用你现有的 Codex 账号和配置，目前需要手动加载扩展，尚未上架 Chrome 应用商店。

### 方式一：让 Codex 帮你安装

将下面这段话复制到 Codex：

```text
请从 https://github.com/FibonaAI/tabgent 安装 Tabgent。

检查这台 Mac 是否有 Python 3.9+、Chrome 142+ 和兼容的 Codex。
使用我现有的 GitHub 权限，将仓库克隆到一个未被占用的目录，
阅读 docs/installation.md，并运行：
python3 extension/native/install.py

使用我现有的 CODEX_HOME 和 Codex 登录。打开 chrome://extensions，
启用开发者模式，从以下目录加载已解压的扩展：
~/Library/Application Support/Tabgent/extension

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
   ~/Library/Application Support/Tabgent/extension
   ```

   自定义 `CODEX_HOME` 不会改变这个安装位置；它只指定 Codex 的账号、配置和数据目录。

4. 固定 Tabgent，打开一个网页，点击工具栏中的扩展图标。看到 **Codex connected** 后，试着问：**“总结一下这个网页。”**

**更新：** 等正在执行的任务结束后，重新运行安装程序，再到 `chrome://extensions` 重新加载 Tabgent。连接问题、自定义配置和卸载方法请参阅[安装与故障排查](docs/installation.md)。

## 隐私与控制

- **选择操作的批准方式：** Ask for approval（请求批准）、Approve for me（代为审批）或 Full access（完全访问）。
- **选择助手可以使用的窗口：** 当前窗口或所有窗口。这项设置只限制 Tabgent 对浏览器的操作；Codex 的其他工具和已连接服务不受此设置限制。
- **连接本机 Codex：** Tabgent 连接 Mac 上已安装的 Codex，没有单独处理会话的 Tabgent 云端服务。
- **对话内容会发送到 Codex 服务：** 为了回答问题或执行任务，你的消息、提供的网页内容及使用的附件会发送到你配置的 Codex 服务，并非只在这台电脑上处理。

数据流、存储位置和 Chrome 权限详见[隐私与权限](docs/privacy.md)。安全问题请按 [SECURITY.md](SECURITY.md) 中的方式报告。

## 当前限制

Tabgent 仍处于早期预览阶段，**主要支持 macOS 和 Chrome**。部分旧版 Codex 可能需要更新。Tabgent 会话不会与 Codex 桌面端实时同步；重启浏览器后，历史会话可能仍然保留，但不一定能自动回到原来的标签页。

## 参与贡献

欢迎反馈问题、提出建议或提交 Pull Request。参与开发前请阅读[开发指南](docs/development.md)和[贡献指南](CONTRIBUTING.md)。

| 文档                             | 内容                       |
| -------------------------------- | -------------------------- |
| [安装指南](docs/installation.md) | 安装、更新、故障排查和卸载 |
| [开发指南](docs/development.md)  | 本地运行、测试和打包       |
| [架构说明](docs/architecture.md) | 扩展与本地连接器的内部结构 |
| [隐私与权限](docs/privacy.md)    | 数据处理和访问边界         |

本页和使用指南均提供中英文版本；上方技术文档目前为英文。

## 许可证

采用 [MIT 许可证](LICENSE)。内置依赖保留各自的许可证，详见[第三方声明](THIRD_PARTY_NOTICES.md)。

Tabgent 是独立项目，并非 OpenAI 或 Google 的官方产品。
