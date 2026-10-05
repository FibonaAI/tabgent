#!/bin/zsh
set -e
connector_python=$(command -v python3 || true)
if [[ -z "$connector_python" ]]; then
  print 'Python 3 is required. Install Python 3, then run this installer again.'
  exit 1
fi
exec "$connector_python" "${0:A:h}/install.py"
