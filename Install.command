#!/bin/zsh
set -e
cd "${0:A:h}"
python3 extension/native/install.py
open "$HOME/Library/Application Support/Tabgent/extension"
open -a 'Google Chrome' 'chrome://extensions'
