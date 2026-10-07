#!/usr/bin/env python3
"""Register the local connector for this unpacked extension (macOS)."""
import argparse, base64, hashlib, json, os, shlex, sys, shutil, tempfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--dev",
    action="store_true",
    help="Load the extension UI directly from this checkout",
)
args = parser.parse_args()
if sys.platform != "darwin":
    raise SystemExit("This installer currently supports macOS.")
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text())
key = base64.b64decode(manifest["key"])
ext_id = "".join(
    chr(ord("a") + int(c, 16)) for c in hashlib.sha256(key).hexdigest()[:32]
)
codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).resolve()
home = Path.home() / "Library/Application Support/Tabgent"
home.mkdir(parents=True, exist_ok=True)
os.chmod(home, 0o700)
# Chrome-launched helpers must live outside macOS protected Documents folders.
host = home / "host.py"
shutil.copy2(root / "native/host.py", host)
shutil.copy2(root / "native/attachments.py", home / "attachments.py")
shutil.copy2(root / "native/lineage.py", home / "lineage.py")
launcher = home / "connector"
launcher.write_text(
    "#!/bin/sh\nexport CODEX_HOME="
    + shlex.quote(str(codex_home))
    + "\nexec "
    + shlex.quote(sys.executable)
    + " "
    + shlex.quote(str(host))
    + ' "$@"\n'
)
launcher.chmod(0o700)
data = {
    "name": "com.tabgent.codex",
    "description": "Tabgent local Codex connector",
    "path": str(launcher),
    "type": "stdio",
    "allowed_origins": ["chrome-extension://" + ext_id + "/"],
}
for directory in [
    "Google/Chrome",
    "Chromium",
    "Google/Chrome for Testing",
    "Microsoft Edge",
    "BraveSoftware/Brave-Browser",
]:
    dest = (
        Path.home() / "Library/Application Support" / directory / "NativeMessagingHosts"
    )
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "com.tabgent.codex.json").write_text(
        json.dumps(data, indent=2) + "\n"
    )
print("Connector installed. Extension ID: " + ext_id)
installed = root if args.dev else home / "extension"
if not args.dev:
    # Stage before replacement so removed runtime files do not survive upgrades.
    with tempfile.TemporaryDirectory(dir=home) as staging:
        prepared = Path(staging) / "extension"
        shutil.copytree(
            root,
            prepared,
            ignore=shutil.ignore_patterns(
                "native", "tests", "scripts", "__pycache__", "*.pyc"
            ),
        )
        if installed.exists():
            shutil.rmtree(installed)
        prepared.rename(installed)
print("Load unpacked extension: " + str(installed))
