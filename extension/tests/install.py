"""Exercise installation in an isolated home, without touching browser profiles."""

import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import zipfile

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

    output = user_home / "artifacts"
    store_id = "abcdefghijklmnopabcdefghijklmnop"
    subprocess.run(
        [sys.executable, str(root.parent / "scripts/package-store.py"),
         "--extension-id", store_id, "--connector-url", "https://example.com/download",
         "--output", str(output)], check=True, capture_output=True,
    )
    with zipfile.ZipFile(output / "Tabgent-Chrome.zip") as archive:
        names = archive.namelist()
        assert len(names) == len(set(names))
        assert "manifest.json" in names
        assert "key" not in json.loads(archive.read("manifest.json"))
        assert not any(n.startswith(("native/", "tests/", "scripts/")) for n in names)
        assert json.loads(archive.read("release.json"))["connectorUrl"] == "https://example.com/download"
    with zipfile.ZipFile(output / "Tabgent-Connector-macOS.zip") as archive:
        archive.extractall(output)
    package = output / "Tabgent Connector"
    assert store_id in (package / "Install Connector.command").read_text()
    assert not (package / "manifest.json").exists()
    untouched = installed / "extension/keep.txt"
    untouched.write_text("Chrome manages this directory")
    subprocess.run(
        ["zsh", str(package / "Install Connector.command")],
        env=env, check=True, capture_output=True,
    )
    assert untouched.exists()
    for registration in registrations:
        assert json.loads(registration.read_text())["allowed_origins"] == [
            f"chrome-extension://{store_id}/"
        ]
    invalid = subprocess.run(
        [sys.executable, str(root / "native/install.py"),
         "--connector-only", "--extension-id", "invalid"],
        env=env, capture_output=True,
    )
    assert invalid.returncode != 0
    assert json.loads(registrations[0].read_text())["allowed_origins"] == [
        f"chrome-extension://{store_id}/"
    ]

print("PASS installer, store archives, connector-only install, ID validation and Codex preservation")
