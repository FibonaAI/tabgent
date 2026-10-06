"""Simulate an absent executable, then start real Codex signed out in an isolated data directory."""

import importlib.util, queue, tempfile, time
from pathlib import Path
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / "native/host.py"
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "native"))
spec = importlib.util.spec_from_file_location("tabgent_host", path)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)
exe = host.executable()
assert exe, "A local Codex binary is required for the recovery half of this test"
messages = queue.Queue()
with tempfile.TemporaryDirectory(
    prefix="tabgent-install-test-"
) as directory, patch.object(host, "HOME", Path(directory)), patch.object(
    host, "send", messages.put
):
    (Path(directory) / "auth.json").symlink_to(Path(directory) / "absent-auth.json")
    session = host.Session("install-test", {})
    try:
        with patch.object(host, "executable", return_value=None):
            session.start()
        assert (
            messages.get(timeout=1)["message"]["params"]["messageKey"]
            == "bridgeInstall"
        )
        assert not session.starting and session.process is None
        started = time.monotonic()
        with patch.object(host, "executable", return_value=exe):
            session.start()
        assert session.ready
        assert session.rpc("account/read")["account"] is None
        process = session.process
        process.terminate()
        process.wait(timeout=5)
        deadline = time.monotonic() + 5
        while session.process is not None and time.monotonic() < deadline:
            time.sleep(0.01)
        assert not session.ready and not session.starting and session.process is None
        session.start()
        assert session.ready
        assert session.rpc("account/read")["account"] is None
        print("PASS exited app-server restarts in the same session")

        print(
            f"PASS missing Codex → install guidance; same session retries real signed-out server in {time.monotonic()-started:.2f}s"
        )
    finally:
        session.close()
        host.POOL.shutdown(wait=True, cancel_futures=True)
