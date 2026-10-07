"""Exercise installation in an isolated home, without touching browser profiles."""

import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

if sys.platform != "darwin":
    print("SKIP macOS installer")
    raise SystemExit(0)

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="tabgent-install-") as directory:
    user_home = Path(directory)
    codex_home = user_home / "custom Codex home"
    old_install = codex_home / "plugins/tabgent"
    old_install.mkdir(parents=True)
    sentinel = old_install / "keep.txt"
    sentinel.write_text("existing installation")
    config = codex_home / "config.toml"
    config.write_text("# existing configuration\n")
    env = {**os.environ, "HOME": str(user_home), "CODEX_HOME": str(codex_home)}
    installed = user_home / "Library/Application Support/Tabgent"

    def install(*args):
        return subprocess.check_output(
            [sys.executable, str(root / "native/install.py"), *args],
            env=env,
            text=True,
        )

    assert str(installed / "extension") in install()
    assert (installed / "extension/manifest.json").read_bytes() == (
        root / "manifest.json"
    ).read_bytes()
    assert not (installed / "extension/native").exists()
    launcher = installed / "connector"
    assert os.access(launcher, os.X_OK)
    assert "export CODEX_HOME=" + shlex.quote(str(codex_home.resolve())) in launcher.read_text()
    registrations = list(
        (user_home / "Library/Application Support").glob(
            "**/NativeMessagingHosts/com.tabgent.codex.json"
        )
    )
    assert len(registrations) == 5
    for registration in registrations:
        assert json.loads(registration.read_text())["path"] == str(launcher)

    stale = installed / "extension/obsolete.js"
    stale.write_text("old release")
    install()
    assert not stale.exists()
    assert "Load unpacked extension: " + str(root) in install("--dev")
    assert sentinel.read_text() == "existing installation"
    assert config.read_text() == "# existing configuration\n"
    assert list(old_install.iterdir()) == [sentinel]

print("PASS independent install path, host registrations, update, dev mode and Codex preservation")
