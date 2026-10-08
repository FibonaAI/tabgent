"""Build separate Chrome Web Store and macOS connector archives."""

import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--extension-id", help="ID assigned by the Chrome Web Store")
parser.add_argument("--connector-url", help="Public HTTPS URL for the connector download page")
parser.add_argument("--output", type=Path, default=Path("dist/store"))
args = parser.parse_args()
if args.extension_id and not re.fullmatch(r"[a-p]{32}", args.extension_id):
    parser.error("Extension ID must contain 32 lowercase letters from a to p")
if args.connector_url:
    from urllib.parse import urlsplit
    url = urlsplit(args.connector_url)
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        parser.error("Connector URL must be a public HTTPS URL without credentials")

root = Path(__file__).resolve().parents[1]
extension = root / "extension"
manifest = json.loads((extension / "manifest.json").read_text())
local_id = "".join(
    chr(ord("a") + int(c, 16))
    for c in hashlib.sha256(base64.b64decode(manifest["key"])).hexdigest()[:32]
)
ext_id = args.extension_id or local_id
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(output / "Tabgent-Chrome.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(extension.rglob("*")):
        relative = file.relative_to(extension)
        if (not file.is_file() or relative.as_posix() == "release.json"
                or relative.parts[0] in {"native", "tests", "scripts"}
                or "__pycache__" in relative.parts or file.name.startswith(".")
                or file.suffix in {".py", ".pyc"}):
            continue
        if relative.as_posix() == "manifest.json":
            # The store assigns its own ID. Do not embed our development key.
            store_manifest = {k: v for k, v in manifest.items() if k != "key"}
            archive.writestr("manifest.json", json.dumps(store_manifest, indent=2) + "\n")
        else:
            archive.write(file, relative.as_posix())
    archive.writestr("release.json", json.dumps({"connectorUrl": args.connector_url}) + "\n")
    for name in ["LICENSE", "THIRD_PARTY_NOTICES.md"]:
        archive.write(root / name, name)

launcher = '''#!/bin/zsh
set -e
connector_python=$(command -v python3 || true)
if [[ -z "$connector_python" ]]; then
  print 'Python 3.9 or later is required. Install Python, then run this installer again.'
  exit 1
fi
"$connector_python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else "Python 3.9 or later is required")'
exec "$connector_python" "${0:A:h}/native/install.py" --connector-only --extension-id EXTENSION_ID
'''.replace("EXTENSION_ID", ext_id)
with zipfile.ZipFile(output / "Tabgent-Connector-macOS.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for name in ["install.py", "host.py", "attachments.py", "lineage.py"]:
        archive.write(extension / "native" / name, "Tabgent Connector/native/" + name)
    entry = zipfile.ZipInfo("Tabgent Connector/Install Connector.command")
    entry.create_system = 3
    entry.external_attr = 0o100755 << 16
    archive.writestr(entry, launcher)
    archive.writestr("Tabgent Connector/README.txt", f'''Tabgent connector for macOS

Requires Python 3.9+ and a compatible Codex installation.
Extension ID: {ext_id}

Unzip this archive and run Install Connector.command.
This installs the connector in ~/Library/Application Support/Tabgent,
registers it with supported browsers, and leaves the Chrome extension alone.
Return to Tabgent and choose Check again. Codex setup/sign-in follows there.

For a custom Codex home, run in Terminal:
CODEX_HOME=/absolute/path/to/codex-home ./"Install Connector.command"

This archive is not signed or notarized. It is a testing build, not a signed
.pkg installer. Do not disable macOS security protections to install it.
''')
    archive.write(root / "LICENSE", "Tabgent Connector/LICENSE")

notes = {
    "version": manifest["version"],
    "connectorExtensionId": ext_id,
    "usesDevelopmentId": not bool(args.extension_id),
    "connectorUrl": args.connector_url,
    "signedInstaller": False,
    "submissionReady": False,
    "remaining": [
        "Verify the ID assigned by the Chrome Web Store and rebuild the connector",
        "Publish and verify the connector download page and rebuild with --connector-url",
        "Provide a public privacy policy, support contact and reviewer access",
        "Prepare store images and complete privacy/permissions declarations",
        "Provide a signed, notarized macOS installer for public distribution",
        "Run first-install tests using the store-assigned ID",
    ],
}
(output / "release-status.json").write_text(json.dumps(notes, indent=2) + "\n")
for file in sorted(output.iterdir()):
    if file.is_file():
        print(file)
