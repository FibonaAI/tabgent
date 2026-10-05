#!/bin/zsh
set -e
cd "${0:A:h}"
python3 extension/native/install.py
open "${CODEX_HOME:-$HOME/.codex}/plugins/browser-agent-connector/extension"
open -a 'Google Chrome' 'chrome://extensions'
