"""Exercise native framing, signed-out setup, and external-login detection without touching real credentials."""

import json, os, queue, struct, subprocess, sys, tempfile, threading
from pathlib import Path

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(
    prefix="browser-agent-connector-native-test-"
) as directory:
    home = Path(directory)
    (home / "auth.json").symlink_to(home / "absent-auth.json")
    p = subprocess.Popen(
        [
            sys.executable,
            str(root / "native/host.py"),
            "chrome-extension://lfbgkeagkfmndclpgmipadggnkoimkee/",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env={**os.environ, "CODEX_HOME": directory},
    )
    messages = queue.Queue()

    def read():
        while True:
            header = p.stdout.read(4)
            if not header:
                return
            messages.put(json.loads(p.stdout.read(struct.unpack("<I", header)[0])))

    threading.Thread(target=read, daemon=True).start()

    def send(m):
        raw = json.dumps(m).encode()
        p.stdin.write(struct.pack("<I", len(raw)) + raw)
        p.stdin.flush()

    def wait(predicate):
        import time

        end = time.monotonic() + 30
        while time.monotonic() < end:
            m = messages.get(timeout=max(0.01, end - time.monotonic()))
            if predicate(m):
                return m
        raise AssertionError("Native response timed out")

    try:
        send({"op": "warm", "config": {}})
        send({"op": "claim", "session": "test"})
        wait(
            lambda m: m.get("session") == "test"
            and m.get("message", {}).get("method") == "bridge/ready"
        )
        send(
            {
                "op": "rpc",
                "session": "test",
                "message": {"id": 1, "method": "initialize", "params": {}},
            }
        )
        assert (
            "result" in wait(lambda m: m.get("message", {}).get("id") == 1)["message"]
        )
        send(
            {
                "op": "rpc",
                "session": "test",
                "message": {"id": 2, "method": "account/read", "params": {}},
            }
        )
        assert (
            wait(lambda m: m.get("message", {}).get("id") == 2)["message"]["result"][
                "account"
            ]
            is None
        )
        (home / "absent-auth.json").write_text("{}")
        send({"op": "checkAuth", "session": "test"})
        wait(
            lambda m: m.get("session") == "test"
            and m.get("message", {}).get("method") == "bridge/authChanged"
        )
        print(
            "PASS native framing / warm-claim race / signed-out account / external auth change"
        )
    finally:
        p.stdin.close()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()
