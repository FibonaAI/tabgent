"""Real app-server OAuth initiation/cancellation and rejected callbacks, without signing in."""

import json, os, queue, struct, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(
    prefix="browser-agent-connector-oauth-preauth-"
) as directory:
    home = Path(directory)
    (home / "auth.json").symlink_to(home / "isolated-auth.json")
    p = subprocess.Popen(
        [
            sys.executable,
            str(root / "native/host.py"),
            "chrome-extension://lfbgkeagkfmndclpgmipadggnkoimkee/",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env={**os.environ, "CODEX_HOME": directory},
    )
    messages = queue.Queue()
    sequence = 0

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

    def wait(predicate, timeout=15):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            m = messages.get(timeout=max(0.01, end - time.monotonic()))
            if predicate(m):
                return m["message"]
        raise AssertionError("Native response timed out")

    def rpc(method, params=None):
        global sequence
        sequence += 1
        ident = sequence
        send(
            {
                "op": "rpc",
                "session": "oauth-test",
                "message": {"id": ident, "method": method, "params": params or {}},
            }
        )
        m = wait(lambda m: m.get("message", {}).get("id") == ident)
        assert "error" not in m, "RPC failed: " + method
        return m["result"]

    def begin():
        result = rpc("account/login/start", {"type": "chatgpt"})
        u = urllib.parse.urlparse(result["authUrl"])
        q = urllib.parse.parse_qs(u.query)
        assert u.scheme == "https" and u.hostname == "auth.openai.com"
        assert q["response_type"] == ["code"] and q["code_challenge_method"] == ["S256"]
        assert len(q["code_challenge"][0]) >= 43 and len(q["state"][0]) >= 16
        callback = q["redirect_uri"][0]
        parsed = urllib.parse.urlparse(callback)
        assert parsed.scheme == "http" and parsed.hostname in ["localhost", "127.0.0.1"]
        assert parsed.path == "/auth/callback"
        return result["loginId"], q, callback

    def callback_status(url, params):
        try:
            with urllib.request.urlopen(
                url + "?" + urllib.parse.urlencode(params), timeout=5
            ) as response:
                return response.status
        except urllib.error.HTTPError as e:
            return e.code

    try:
        send({"op": "warm", "config": {}})
        send({"op": "claim", "session": "oauth-test"})
        wait(
            lambda m: m.get("session") == "oauth-test"
            and m.get("message", {}).get("method") == "bridge/ready"
        )
        rpc("initialize")
        assert rpc("account/read")["account"] is None
        login, first, callback = begin()
        print(
            "PASS official HTTPS OAuth endpoint / authorization code / PKCE S256 / random state / loopback callback"
        )
        assert (
            callback_status(
                callback,
                {"code": "invalid-test-code", "state": "deliberately-wrong-test-state"},
            )
            == 400
        )
        assert rpc("account/read")["account"] is None
        print("PASS wrong-state callback is rejected; account remains signed out")
        rpc("account/login/cancel", {"loginId": login})
        login, second, callback = begin()
        assert (
            second["state"] != first["state"]
            and second["code_challenge"] != first["code_challenge"]
        )
        print("PASS cancellation and retry generate fresh state and PKCE challenge")
        status = callback_status(
            callback, {"error": "access_denied", "state": second["state"][0]}
        )
        assert status in [200, 400]
        completed = wait(
            lambda m: m.get("message", {}).get("method") == "account/login/completed"
        )
        assert completed["params"]["success"] is False
        assert rpc("account/read")["account"] is None
        print(
            "PASS simulated denied callback emits real login-failure notification; account remains signed out"
        )
        rpc("account/login/cancel", {"loginId": login})
        assert (
            not (home / "auth.json").exists()
            and not (home / "isolated-auth.json").exists()
        )
        print("PASS no login credentials created; original account untouched")
    finally:
        p.stdin.close()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()
