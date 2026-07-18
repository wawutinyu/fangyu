"""场景模板库单测。"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fangyu.core import constitution as constitution_mod
from fangyu.core.scenario_templates import instantiate_scenario, list_scenarios
from fangyu.server import app


@pytest.fixture()
def scenario_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("FANGYU_SCENARIO_DIR", str(tmp_path / "scenarios"))
    const_path = tmp_path / "constitution.json"
    const_path.write_text(
        json.dumps(
            {
                "version": "1",
                "name": "t",
                "enabled": True,
                "values": [],
                "forbidden_actions": [],
                "forbidden_node_types": [],
                "require_audit": False,
                "policies": [],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(constitution_mod, "CONSTITUTION_FILE", const_path)
    yield tmp_path


@pytest.fixture()
def client():
    return TestClient(app)


def test_list_scenarios():
    items = list_scenarios()
    ids = {s["id"] for s in items}
    assert "line_inspection" in ids
    assert "doc_assistant" in ids
    assert "full_experience" in ids
    assert items[0]["id"] == "full_experience"
    assert items[0].get("featured") is True


def test_instantiate_full_experience(scenario_dir):
    result = instantiate_scenario("full_experience", apply_policies=True, create_bundle=True)
    assert result["flow"]["template"] == "doc_assistant"
    assert any(n.get("type") == "llm" for n in result["flow"]["flow"]["nodes"])
    assert result["agents"]["template"] == "search_analyze_summarize"
    assert result["bundle"] is not None
    assert result["bundle"]["mqtt_topic"] == "fangyu/demo/+/trigger"
    assert set(result["policy_ids"]) >= {"tpl-llm-model", "tpl-ssrf", "tpl-loop-limit", "tpl-tool-name"}


def test_instantiate_line_inspection(scenario_dir):
    result = instantiate_scenario("line_inspection", apply_policies=True, create_bundle=True)
    assert result["flow"]["template"] == "action_loop"
    assert result["agents"]["template"] == "worker_pair"
    assert result["bundle"] is not None
    assert Path(result["bundle"]["path"]).exists()
    assert (Path(result["bundle"]["path"]) / "manifest.json").exists()
    assert result["bundle"]["mqtt_topic"] == "fangyu/line/+/alert"
    assert "tpl-ssrf" in result["policy_ids"]
    assert result["policies_applied"]


def test_instantiate_doc_assistant(scenario_dir):
    result = instantiate_scenario("doc_assistant", apply_policies=False, create_bundle=True)
    assert result["flow"]["template"] == "doc_assistant"
    assert result["agents"]["template"] == "search_analyze_summarize"
    assert result["bundle"]["agent_kind"] == "interface"
    assert result["policies_applied"] == []


def test_instantiate_unknown():
    with pytest.raises(ValueError, match="未知"):
        instantiate_scenario("no_such")


def test_scenario_api(client, scenario_dir):
    resp = client.get("/api/v1/scenario/templates")
    assert resp.status_code == 200
    assert len(resp.json()["scenarios"]) >= 2

    bad = client.post("/api/v1/scenario/instantiate", json={"id": "nope"})
    assert bad.status_code == 400

    ok = client.post(
        "/api/v1/scenario/instantiate",
        json={"id": "doc_assistant", "apply_policies": False},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["flow"]["flow"]["nodes"]
    assert body["agents"]["graph"]["nodes"]
    assert body["bundle"]["path"]
