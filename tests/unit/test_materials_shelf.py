"""原料货架 API + harness trace 落盘。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FANGYU_DATA_DIR", str(tmp_path / "data"))
    # 重新绑定 DATA_DIR（若 config 已缓存）
    from fangyu.core import config as cfg

    monkeypatch.setattr(cfg, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)

    from fangyu.server import app

    return TestClient(app)


def test_materials_catalog(client):
    r = client.get("/api/v1/materials/catalog")
    assert r.status_code == 200
    body = r.json()
    assert "materials" in body
    assert isinstance(body["materials"].get("tools"), list)
    assert "mcp_internal_tools" in body


def test_skill_progressive_detail(client):
    r = client.get("/api/v1/materials/skills/implement-and-verify")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["skill_id"] == "implement-and-verify"
    assert "反例" in body["body"] or len(body["body"]) > 40
    missing = client.get("/api/v1/materials/skills/__no_such_skill__")
    assert missing.status_code == 404


def test_draft_and_selection(client, tmp_path):
    r = client.get("/api/v1/materials/draft")
    assert r.status_code == 200
    assert r.json()["source"] in ("default", "draft")

    r2 = client.post("/api/v1/materials/selection", json={
        "coding_tools": ["read", "write", "shell", "task"],
        "active_skills": ["implement-and-verify"],
        "shell_policy": "ask",
        "default_agent_mode": "plan",
        "target": "draft",
    })
    assert r2.status_code == 200, r2.text
    mat = r2.json()["materials"]
    assert mat["policies"]["default_agent_mode"] == "plan"
    coding = [
        t["id"] for t in mat["tools"]
        if "coding" in (t.get("belts") or []) or t["id"] == "task"
    ]
    assert "read" in coding
    assert "task" in coding

    r3 = client.get("/api/v1/materials/draft")
    assert r3.json()["source"] == "draft"


def test_bundle_materials_write(client, tmp_path):
    root = tmp_path / "bundle"
    (root / "config").mkdir(parents=True)
    r = client.put("/api/v1/materials/bundle", json={
        "bundle_dir": str(root),
        "materials": {
            "policies": {"shell": "deny"},
            "tools": [{"id": "read", "belts": ["coding"]}],
        },
    })
    assert r.status_code == 200, r.text
    assert (root / "config" / "materials.json").is_file()
    assert (root / "config" / "toolbelt.json").is_file()
    tb = json.loads((root / "config" / "toolbelt.json").read_text())
    assert "read" in tb["tools"]


def test_harness_trace_append(tmp_path, monkeypatch):
    from fangyu.engine import harness_trace as ht

    class FakeWs:
        root = tmp_path / "ws"

    FakeWs.root.mkdir(parents=True)
    monkeypatch.setattr(
        "fangyu.engine.workspace.get_active_workspace",
        lambda: FakeWs(),
    )

    path = ht.append_harness_trace(
        ht.summarize_loop_result(
            goal="demo",
            out={
                "success": True,
                "turns": 2,
                "trace": [{"tool": "read"}, {"tool": "write"}],
                "plan": ["a"],
                "result": "ok",
                "error": None,
            },
            agent_mode="build",
        ),
    )
    assert path and path.is_file()
    rows = ht.read_traces(path)
    assert rows[0]["goal"] == "demo"
    assert rows[0]["tools_used"] == ["read", "write"]


@pytest.mark.asyncio
async def test_agent_loop_writes_trace(tmp_path, monkeypatch):
    from fangyu.engine import harness_trace as ht
    from fangyu.engine.agent_loop import run_agent_loop

    class FakeWs:
        root = tmp_path / "ws2"

    FakeWs.root.mkdir(parents=True)
    monkeypatch.setattr(
        "fangyu.engine.workspace.get_active_workspace",
        lambda: FakeWs(),
    )

    async def llm(_msgs):
        return json.dumps({"action": "done", "result": "hi"}, ensure_ascii=False)

    out = await run_agent_loop(goal="trace me", tools={}, llm=llm, max_turns=3)
    assert out["success"] is True
    path = FakeWs.root / ".fangyu" / "harness_trace.jsonl"
    assert path.is_file()
    rows = ht.read_traces(path)
    assert rows[0]["goal"] == "trace me"
