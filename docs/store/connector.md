# Install the Tabgent connector for Chrome Web Store

Tabgent needs a local connector to use Codex from Chrome. This source installation
is for **macOS**, with **Python 3.9+**, Git and a compatible Codex installation.
It is not a signed `.pkg` installer. Do not disable macOS security protections.

The Chrome Web Store version uses extension ID
`babedlnnpikldpofiadocebjenlkkflp`.

## Install

Download the source using Git, then install only the connector:

```sh
git clone https://github.com/FibonaAI/tabgent.git
cd tabgent
python3 extension/native/install.py --connector-only --extension-id babedlnnpikldpofiadocebjenlkkflp
```

If you already have the source, update it before running the final command.
The connector installs to `~/Library/Application Support/Tabgent` and registers
with supported browsers. Chrome manages the store extension separately.
Return to Tabgent and select **Check again**. Follow the Codex sign-in/setup prompt
if shown. Codex access and usage limits apply.

This registration replaces the native host's allowed extension ID. If you were
using the unpacked development extension, it will no longer connect until you
reinstall its development registration.

## Privacy and support

Messages and requested page content go through Codex to your configured service;
processing is not entirely local. Read the [privacy policy](privacy-policy.md).
For help, contact deeprsi@fibona.ai or use
[GitHub Issues](https://github.com/FibonaAI/tabgent/issues).

## 简体中文

商店版 Tabgent 需要单独安装本地连接器。目前提供源码安装方式，需要 macOS、
Python 3.9 或更高版本、Git，以及兼容的 Codex。这不是已签名的 `.pkg` 安装器，
不需要关闭 macOS 的安全保护。

运行上面的三条命令，随后回到 Tabgent 点击 **Check again**，按提示完成 Codex
安装或登录。连接器保存在 `~/Library/Application Support/Tabgent`。

该命令会将本地连接器绑定到商店版扩展。如果此前使用开发版扩展，开发版将无法
连接，直到重新运行开发版安装命令。卸载扩展不会自动删除 Codex 中的会话记录。
