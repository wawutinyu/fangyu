"""观测 API：harness_trace + Eval 报告。"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import config as config_mod
from fangyu.core.factory_eval import load_eval_report, write_eval_report
from fangyu.engine.harness_trace import summarize_trace_rows
from fangyu.server import app


@pytest.fixture(autouse=True)
def _iso(tmp_path, monkeypatch):
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    config_mod.set_data_dir(tmp_path / "data")
    yield


def test_summarize_trace_rows():
    rows = [
        {"kind": "agent_loop", "success": True, "tools_used": ["read", "write"]},
        {"kind": "task_child", "success": False, "tools_used": ["read"]},
        {"type": "gate_smoke", "ok": True},
    ]
    s = summarize_trace_rows(rows)
    assert s["total"] == 3
    assert s["success"] == 2
    assert s["failure"] == 1
    assert "read" in s["tools_used"]
    assert s["by_kind"]["agent_loop"] == 1


def test_eval_report_roundtrip(tmp_path):
    path = write_eval_report(
        {"exit_code": 0, "ok": True, "stages": {"unit": {"ok": True}}},
        data_dir=tmp_path / "data",
        also_workspace=False,
    )
    assert path.is_file()
    doc = load_eval_report(data_dir=tmp_path / "data")
    assert doc and doc["ok"] is True
    assert doc["stages"]["unit"]["ok"] is True


def test_monitor_harness_and_eval_api(tmp_path, monkeypatch):
    from fangyu.engine import harness_trace as ht

    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setattr(ht, "resolve_trace_path", lambda **k: ws / ".fangyu" / "harness_trace.jsonl")
    ht.append_harness_trace({"kind": "agent_loop", "success": True, "goal": "hi", "tools_used": ["read"]})
    write_eval_report(
        {"exit_code": 0, "ok": True, "stages": {"unit": {"ok": True}}},
        also_workspace=False,
    )

    with TestClient(app) as client:
        tr = client.get("/api/v1/monitor/harness-traces")
        assert tr.status_code == 200
        body = tr.json()
        assert body["summary"]["total"] >= 1
        assert body["traces"]

        ev = client.get("/api/v1/monitor/eval-report")
        assert ev.status_code == 200
        assert ev.json()["report"]["ok"] is True
