"""Q1：结构化 trace + 质量 warn。"""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from fangyu.core.constitution import evaluate_runtime_quality
from fangyu.core.tracer import (
    begin_trace,
    drain_events,
    new_trace_id,
    record_event,
    truncate_text,
)
from fangyu.engine.scheduler import run_flow
from fangyu.server import app


def test_new_trace_id_unique():
    a = new_trace_id("demo")
    b = new_trace_id("demo")
    assert a != b
    assert a.startswith("demo-")


def test_truncate_text():
    assert "[TRUNCATED]" in truncate_text("x" * 100, 20)


def test_record_and_drain():
    tid = begin_trace(new_trace_id("t"))
    record_event(node_id="n1", node_type="llm", event_type="start", payload={"inputs": {"a": 1}})
    record_event(node_id="n1", node_type="llm", event_type="end", duration_ms=12.5, payload={"outputs": {"result": "ok"}})
    ev = drain_events()
    assert len(ev) == 2
    assert ev[0].trace_id == tid
    assert ev[1].duration_ms == 12.5


def test_runtime_quality_consecutive_errors():
    rows = [
        {"outputs": {"error": "e1"}},
        {"outputs": {"error": "e2"}},
        {"outputs": {"error": "e3"}},
        {"outputs": {"error": "e4"}},
        {"outputs": {"error": "e5"}},
    ]
    warns = evaluate_runtime_quality(rows)
    assert any(w.get("rule") == "max_consecutive_errors" for w in warns)


def test_flow_returns_trace_id():
    async def _run():
        nodes = [
            {"id": "s", "type": "start", "data": {"originType": "start", "label": "开始", "config": {}}},
        ]
        out = await run_flow(nodes, [], global_vars={"flow_id": "q1demo"})
        assert out.get("success") is True
        assert out.get("trace_id")
        assert str(out["trace_id"]).startswith("q1demo-")

    asyncio.run(_run())


def test_monitor_trace_api(tmp_path, monkeypatch):
    from fangyu.core import config as config_mod
    from fangyu.core.sso import save_sso_config

    d = tmp_path / "data"
    d.mkdir()
    monkeypatch.setattr(config_mod, "DATA_DIR", d)
    monkeypatch.setenv("FANGYU_DATA_DIR", str(d))
    monkeypatch.setenv("FANGYU_REQUIRE_AUTH", "0")
    save_sso_config({"enabled": False, "issuer": "fangyu-local", "audience": "fangyu-api"})

    with TestClient(app) as client:
        r = client.post(
            "/api/v1/flow/run",
            json={
                "nodes": [
                    {"id": "s", "type": "start", "data": {"originType": "start", "label": "开始", "config": {}}},
                ],
                "edges": [],
                "global_vars": {"flow_id": "api-trace"},
            },
        )
        assert r.status_code == 200
        tid = r.json().get("trace_id")
        assert tid
        tr = client.get(f"/api/v1/monitor/traces/{tid}")
        assert tr.status_code == 200
        body = tr.json()
        assert body["trace_id"] == tid
        assert body["count"] >= 1
        types = {e["event_type"] for e in body["events"]}
        assert "flow_start" in types or "start" in types
