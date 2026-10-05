"""Verify project identity and shared-home isolation using the real app-server, without login."""

import importlib.util, tempfile
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "native"))
spec = importlib.util.spec_from_file_location(
    "connector", Path(__file__).resolve().parents[1] / "native/host.py"
)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)
with tempfile.TemporaryDirectory(
    prefix="browser-agent-connector-storage-"
) as directory, patch.object(host, "HOME", Path(directory)), patch.object(
    host, "send", lambda _: None
):
    config = Path(directory) / "config.toml"
    config.write_text(
        '# User configuration must survive\nmodel_reasoning_effort="medium"\n'
        'web_search="live"\n[features]\nshell_tool=true\nunified_exec=true\n'
        'multi_agent=true\napps=false\ncode_mode=true\n'
    )
    before = config.read_bytes()
    first = host.Session("first", {})
    second = host.Session("second", {})
    try:
        first.start()
        second.start()
        assert first.ready and second.ready
        effective = first.rpc("config/read", {})["config"]
        assert effective["web_search"] == "live", effective
        for flag in ["shell_tool", "unified_exec", "multi_agent", "code_mode"]:
            assert effective["features"][flag] is True, flag
        assert effective["features"]["apps"] is False
        # Native tools are additive; browser scope and execution approvals remain.
        params = first.thread_params({"dynamicTools": [{"name": "browser"}]})
        assert [tool["name"] for tool in params["dynamicTools"]] == ["browser", "read_attachment"]
        assert params["sandbox"] == "read-only"
        assert params["approvalPolicy"] == "untrusted"
        assert first.project_id == second.project_id
        project = first.rpc("project/read", {"projectId": first.project_id})["project"]
        assert project["name"] == "Browser Agent Connector"
        thread = first.rpc("thread/start", first.thread_params({}))["thread"]
        assert thread["projectId"] == first.project_id
        assert thread["cwd"] == str(
            Path(directory) / "projects/browser-agent-connector"
        )
        assert config.read_bytes() == before
        assert not (Path(directory) / "auth.json").exists()
        assert not (Path(directory) / "auth.json").is_symlink()
        print(
            "PASS inherited native tool flags / web search / retained approvals / shared home / project / untouched config and auth"
        )
    finally:
        first.close()
        second.close()
        host.POOL.shutdown(wait=True, cancel_futures=True)
