#!/usr/bin/env python3
"""Browser Agent Connector native messaging host: stdlib only, one Codex process per owned tab."""
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import threading
import time
import uuid
import attachments
import lineage

HOME = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
LOCK = threading.Lock()
START_LOCK = threading.Lock()
SESSIONS = {}
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=8)
CONFIG = None


def send(value):
    raw = json.dumps(value, ensure_ascii=False).encode()
    frames = [raw]
    if len(raw) > 700000:
        text = raw.decode()
        ident = uuid.uuid4().hex
        parts = [text[i : i + 150000] for i in range(0, len(text), 150000)]
        frames = [
            json.dumps(
                {
                    "op": "chunk",
                    "id": ident,
                    "index": i,
                    "count": len(parts),
                    "data": part,
                },
                ensure_ascii=False,
            ).encode()
            for i, part in enumerate(parts)
        ]
    with LOCK:
        for frame in frames:
            sys.stdout.buffer.write(struct.pack("<I", len(frame)))
            sys.stdout.buffer.write(frame)
        sys.stdout.buffer.flush()


def executable():
    candidates = []
    for base in [Path("/Applications"), Path.home() / "Applications"]:
        candidates += [
            base
            / "ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
            base / "Codex.app/Contents/Resources/codex",
        ]
    candidates += [Path("/opt/homebrew/bin/codex"), Path("/usr/local/bin/codex")]
    found = shutil.which("codex")
    if found:
        candidates.append(Path(found))
    return next(
        (str(p) for p in candidates if p.is_file() and os.access(p, os.X_OK)), None
    )


def auth_stamp():
    values = []
    for p in [HOME / "auth.json"]:
        try:
            values.append(p.stat().st_mtime_ns)
        except OSError:
            values.append(None)
    return values


class Session:
    def __init__(self, ident, config, thread_id=None):
        self.id = ident
        self.resume_thread_id = thread_id
        self.config = config
        self.process = None
        self.initialized = None
        self.thread = None
        self.pending = {}
        self.sequence = -1
        self.write_lock = threading.Lock()
        self.lineage_lock = threading.RLock()
        self.closed = False
        self.thread_response = None
        self.populated = False
        self.auth = auth_stamp()
        self.ready = False
        self.start_lock = threading.Lock()
        self.starting = False

    def emit(self, message):
        if not self.closed:
            send({"op": "event", "session": self.id, "message": message})

    def emit_ready(self):
        self.emit({
            "method": "bridge/ready",
            "params": {"threadId": self.thread["id"] if self.thread else None},
        })

    def write(self, message):
        if self.closed or not self.process:
            raise RuntimeError("Codex disconnected")
        with self.write_lock:
            self.process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
            self.process.stdin.flush()

    def rpc(self, method, params=None):
        with self.write_lock:
            ident = self.sequence
            self.sequence -= 1
        future = concurrent.futures.Future()
        self.pending[ident] = future
        self.write({"id": ident, "method": method, "params": params or {}})
        try:
            return future.result(timeout=90)
        finally:
            self.pending.pop(ident, None)

    def read(self):
        try:
            for line in self.process.stdout:
                if len(line) > 32 * 1024 * 1024:
                    raise ValueError("Oversized message")
                message = json.loads(line)
                future = self.pending.get(message.get("id"))
                if future is not None:
                    if message.get("error"):
                        future.set_exception(
                            RuntimeError(message["error"].get("message", "Codex error"))
                        )
                    else:
                        future.set_result(message.get("result", {}))
                    continue
                if message.get("method") == "thread/name/updated" and self.thread:
                    params = message.get("params", {})
                    if params.get("threadId") == self.thread["id"]:
                        self.thread["name"] = params.get("threadName")
                if isinstance(message.get("result"), dict) and message["result"].get(
                    "thread"
                ):
                    self.thread = message["result"]["thread"]
                    self.thread_response = message["result"]
                    self.populated = bool(self.thread.get("turns"))
                if (
                    message.get("method") == "item/tool/call"
                    and message.get("params", {}).get("tool") == "read_attachment"
                ):

                    def reply(m):
                        try:
                            args = m["params"]["arguments"]
                            if isinstance(args, str):
                                args = json.loads(args)
                            value = attachments.read(
                                HOME / "projects/browser-agent-connector/attachments",
                                args,
                            )
                            result = {
                                "success": True,
                                "contentItems": [
                                    {
                                        "type": "inputText",
                                        "text": json.dumps(value, ensure_ascii=False),
                                    }
                                ],
                            }
                        except Exception:
                            result = {
                                "success": False,
                                "contentItems": [
                                    {
                                        "type": "inputText",
                                        "text": "Cannot read this attachment format or page. Ask the user for text or an image if needed.",
                                    }
                                ],
                            }
                        self.write({"id": m["id"], "result": result})

                    POOL.submit(reply, message)
                    continue
                self.emit(message)
        except (OSError, ValueError):
            pass
        finally:
            self.ready = False
            self.starting = False
            self.process = None
            self.initialized = None
            for future in list(self.pending.values()):
                if not future.done():
                    future.set_exception(RuntimeError("Codex disconnected"))
            self.emit(
                {
                    "method": "bridge/closed",
                    "params": {"messageKey": "disconnectedDraft"},
                }
            )

    def start(self):
        with self.start_lock:
            if self.starting or self.closed:
                return
            self.starting = True
        self.start_server()

    def start_server(self):
        if self.closed:
            return
        exe = executable()
        if not exe:
            self.starting = False
            self.emit(
                {"method": "bridge/error", "params": {"messageKey": "bridgeInstall"}}
            )
            return
        HOME.mkdir(parents=True, exist_ok=True)
        os.chmod(HOME, 0o700)
        workspace = HOME / "projects/browser-agent-connector"
        workspace.mkdir(parents=True, exist_ok=True)
        self.auth = auth_stamp()
        try:
            if self.closed:
                return
            self.process = subprocess.Popen(
                # Inherit the installed Codex tool configuration; browser tools are additive.
                [exe, "app-server", "--stdio"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                bufsize=1,
                cwd=workspace,
                env={**os.environ, "CODEX_HOME": str(HOME)},
            )
            threading.Thread(target=self.read, daemon=True).start()
            self.initialized = self.rpc(
                "initialize",
                {
                    "clientInfo": {
                        "name": "browser_agent_connector",
                        "title": "Browser Agent Connector",
                        "version": "0.1.0",
                    },
                    "capabilities": {"experimentalApi": True},
                },
            )
            self.write({"method": "initialized"})
            # Only shared project creation needs serialization, not account/network checks.
            with START_LOCK:
                project = self.rpc(
                    "project/create",
                    {
                        "idempotencyKey": "browser-agent-connector",
                        "name": "Browser Agent Connector",
                        "roots": [{"path": str(workspace)}],
                    },
                )
            self.project_id = project["project"]["id"]
            account = self.rpc("account/read")
            if account.get("account") or account.get("requiresOpenaiAuth") is False:
                self.thread_response = self.rpc(
                    "thread/resume" if self.resume_thread_id else "thread/start",
                    self.thread_params({
                        **self.config,
                        **({"threadId": self.resume_thread_id, "excludeTurns": False}
                           if self.resume_thread_id else {}),
                    }),
                )
                self.thread = self.thread_response["thread"]
            self.ready = True
            self.emit_ready()
            POOL.submit(self.sync_lineage)
        except Exception:
            self.starting = False
            if self.process and self.process.poll() is None:
                self.process.terminate()
            self.process = None
            self.emit(
                {"method": "bridge/error", "params": {"messageKey": "bridgeLaunch"}}
            )

    def sync_lineage(self):
        try:
            lineage.flush(self, HOME)
        except Exception:
            pass  # Durable notes retry before the next user input.

    def thread_params(self, params):
        return {
            **params,
            "cwd": str(HOME / "projects/browser-agent-connector"),
            "projectId": self.project_id,
            "dynamicTools": [
                *(params.get("dynamicTools") or self.config.get("dynamicTools", [])),
                attachments.TOOL,
            ],
            "sandbox": "read-only",
            "approvalPolicy": "untrusted",
            "historyMode": "legacy",
            "ephemeral": False,
        }

    def request(self, message, lineage_flushed=False):
        method = message.get("method")
        if method == "bridge/thread/relations":
            def read_relations():
                try:
                    result = lineage.relatives(self, HOME)
                    self.emit({"id": message["id"], "result": result})
                except Exception as error:
                    self.emit({"id": message["id"], "error": {"code": -32000, "message": str(error)}})
            POOL.submit(read_relations)
            return
        if method == "bridge/thread/link":
            def link_threads():
                try:
                    params = message["params"]
                    lineage.record(
                        HOME, params["parentThreadId"], params["childThreadId"],
                        params.get("source", {}),
                    )
                    # Acknowledge durable storage first: a busy parent must not block
                    # a browser tool result or the child's first message.
                    self.emit({"id": message["id"], "result": {}})
                    for session in list(SESSIONS.values()):
                        session.emit({"method": "bridge/lineageChanged"})
                        try:
                            lineage.flush(session, HOME)
                        except Exception:
                            pass  # Durable notes retry before the next user turn.
                    active_ids = {s.thread["id"] for s in SESSIONS.values() if s.thread}
                    for thread_id in (params["parentThreadId"], params["childThreadId"]):
                        if thread_id in active_ids:
                            continue
                        temporary = Session("lineage", CONFIG or {}, thread_id)
                        try:
                            temporary.start()
                            lineage.flush(temporary, HOME)
                        finally:
                            temporary.close()
                except Exception as error:
                    self.emit({"id": message["id"], "error": {"code": -32000, "message": str(error)}})
            POOL.submit(link_threads)
            return
        if method in ("turn/start", "thread/queue/start", "turn/steer"):
            # Flush relationship notes before admitting input, without generating a turn.
            def with_lineage():
                try:
                    lineage.flush(self, HOME)
                    self.request(message, lineage_flushed=True)
                except Exception as error:
                    self.emit({"id": message["id"], "error": {"code": -32000, "message": str(error)}})
            if not lineage_flushed:
                POOL.submit(with_lineage)
                return
        if method == "bridge/pdf/read":
            try:
                params = message["params"]
                result = attachments.read_pdf(
                    params["data"], params.get("page", 1), params.get("offset", 0)
                )
                self.emit({"id": message["id"], "result": result})
            except Exception:
                self.emit(
                    {
                        "id": message["id"],
                        "error": {
                            "code": -32000,
                            "message": "PDF could not be read; use a screenshot of the current PDF or check the requested page",
                        },
                    }
                )
            return
        if method == "bridge/attachment/save":
            try:
                result = attachments.save(
                    HOME / "projects/browser-agent-connector/attachments",
                    message["params"]["name"],
                    message["params"]["data"],
                )
                self.emit({"id": message["id"], "result": result})
            except Exception:
                self.emit(
                    {
                        "id": message["id"],
                        "error": {
                            "code": -32000,
                            "message": "Attachment could not be saved",
                        },
                    }
                )
            return
        if method == "bridge/attachment/preview":
            try:
                self.emit(
                    {
                        "id": message["id"],
                        "result": attachments.preview(
                            HOME / "projects/browser-agent-connector/attachments",
                            message["params"],
                        ),
                    }
                )
            except Exception:
                self.emit(
                    {
                        "id": message["id"],
                        "error": {"code": -32000, "message": "Image unavailable"},
                    }
                )
            return
        if method == "initialize":
            if self.initialized is not None:
                self.emit({"id": message["id"], "result": self.initialized})
            return
        if method == "initialized":
            return
        if method == "turn/start":
            self.populated = True
        if (
            method in ("thread/start", "thread/resume")
            and self.thread_response
            and not self.populated
            and (
                method == "thread/start"
                or message.get("params", {}).get("threadId") == self.thread["id"]
            )
        ):
            self.emit({"id": message["id"], "result": self.thread_response})
            return
        if method == "thread/start" and self.thread:
            message = {
                **message,
                "method": "thread/resume",
                "params": {"threadId": self.thread["id"], "excludeTurns": False},
            }
            method = "thread/resume"
        if method in ("thread/start", "thread/resume"):
            message = {
                **message,
                "params": self.thread_params(
                    {
                        **message.get("params", {}),
                        "developerInstructions": self.config.get(
                            "developerInstructions", ""
                        ),
                    }
                ),
            }
        try:
            self.write(message)
        except Exception:
            self.emit(
                {
                    "id": message.get("id"),
                    "error": {"code": -32000, "message": "Codex disconnected"},
                }
            )

    def close(self):
        self.closed = True
        process = self.process
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def warm():
    if CONFIG is not None and "spare" not in SESSIONS:
        session = Session("spare", CONFIG)
        SESSIONS["spare"] = session
        POOL.submit(session.start)


def handle(message):
    global CONFIG
    op = message.get("op")
    ident = message.get("session")
    if op == "warm":
        CONFIG = message["config"]
        warm()
        return
    if op == "claim":
        if ident in SESSIONS:
            session = SESSIONS[ident]
            if session.ready:
                session.emit_ready()
            elif session.process is None:
                POOL.submit(session.start)
        else:
            session = SESSIONS.pop("spare", None) if not message.get("threadId") else None
            if session is None:
                session = Session(ident, CONFIG or {}, message.get("threadId"))
                SESSIONS[ident] = session
                POOL.submit(session.start)
            else:
                session.id = ident
                SESSIONS[ident] = session
                if session.ready:
                    session.emit_ready()
                elif session.process is None:
                    POOL.submit(session.start)
            warm()
    elif op == "rpc" and ident in SESSIONS:
        SESSIONS[ident].request(message["message"])
    elif op == "checkAuth" and ident in SESSIONS:
        session = SESSIONS[ident]
        if session.auth != auth_stamp():
            session.auth = auth_stamp()
            session.emit({"method": "bridge/authChanged"})
    elif op in ("close", "restart"):
        session = SESSIONS.pop(ident, None)
        if session:
            POOL.submit(session.close)
        if op == "restart":
            session = Session(ident, CONFIG or {}, message.get("threadId"))
            SESSIONS[ident] = session
            POOL.submit(session.start)


def main():
    # Chrome enforces allowed_origins; additionally reject invocations without an extension origin.
    if len(sys.argv) < 2 or not sys.argv[1].startswith("chrome-extension://"):
        return
    try:
        while True:
            header = sys.stdin.buffer.read(4)
            if not header:
                break
            if len(header) != 4:
                break
            size = struct.unpack("<I", header)[0]
            if size > 32 * 1024 * 1024:
                break
            raw = sys.stdin.buffer.read(size)
            if len(raw) != size:
                break
            handle(json.loads(raw))
    except (BrokenPipeError, KeyboardInterrupt, ValueError):
        pass
    finally:
        for session in list(SESSIONS.values()):
            session.close()
        POOL.shutdown(wait=False, cancel_futures=True)


if __name__ == "__main__":
    main()
