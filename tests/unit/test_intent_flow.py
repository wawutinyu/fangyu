"""Intent → Flow 单元测试 — 分类、生成、宪法扫描、HTTP。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))

from flow_test_helpers import assert_flow_ok, run_flow_sync
from fangyu.core.intent_flow import (
    classify_intent,
    intent_to_flow,
    build_action_loop_flow,
    build_doc_assistant_flow,
    build_simple_io_flow,
)
from fangyu.engine.executor import register_executors
from fangyu.server import app


@pytest.fixture(scope="module", autouse=True)
def _ensure_executors():
    register_executors()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.mark.parametrize(
    "intent,expected",
    [
        ("hi", "simple_io"),
        ("总结这篇文档", "doc_assistant"),
        ("document summary please", "doc_assistant"),
        ("完成巡检任务并写入结果", "action_loop"),
        ("帮我执行 workspace 清理", "action_loop"),
        ("please do something long enough", "action_loop"),  # len >= 12
    ],
)
def test_classify_intent(intent, expected):
    assert classify_intent(intent) == expected


def test_classify_empty():
    assert classify_intent("") == "simple_io"
    assert classify_intent("   ") == "simple_io"


def test_build_simple_io_has_chain():
    flow = build_simple_io_flow("hello")
    assert flow["flow_name"].startswith("意图·")
    assert len(flow["nodes"]) == 2
    assert flow["nodes"][0]["config"]["default_value"] == "hello"
    assert flow["links"][0]["sourceNodeId"] == "n1"
    assert flow["links"][0]["targetNodeId"] == "n2"


def test_build_doc_assistant_has_llm():
    flow = build_doc_assistant_flow("总结 README")
    types = [n["type"] for n in flow["nodes"]]
    assert types == ["input", "llm", "output"]
    assert "为人类服务" in flow["nodes"][1]["config"]["system_prompt"]


def test_build_action_loop_phases():
    flow = build_action_loop_flow("完成写入任务")
    names = [n["name"] for n in flow["nodes"]]
    assert names == ["任务", "observe", "plan", "act", "verify", "输出"]
    assert len(flow["links"]) == 5


def test_build_action_loop_llm_plan():
    flow = build_action_loop_flow("完成写入任务", use_llm_plan=True)
    types = [n["type"] for n in flow["nodes"]]
    assert "llm" in types
    assert any(n["name"] == "plan_parse" for n in flow["nodes"])


def test_intent_to_flow_scan_not_blocked():
    result = intent_to_flow("完成巡检任务")
    assert result["template"] == "action_loop"
    assert result["scan"]["blocked"] is False
    assert result["flow"]["nodes"]
    assert result["rationale"]
    observe = next(n for n in result["flow"]["nodes"] if n["name"] == "observe")
    assert "result =" in observe["config"]["code"]
    assert "return {" not in observe["config"]["code"]


def test_intent_action_loop_runs_with_chat_input():
    """意图生成的行动闭环应能被引擎跑通，聊天文本覆盖任务默认值。"""
    built = build_action_loop_flow("默认任务文案")
    nodes = [
        {
            "id": n["id"],
            "data": {
                "originType": n["type"],
                "label": n["name"],
                "config": n.get("config") or {},
            },
        }
        for n in built["nodes"]
    ]
    edges = [
        {"id": lk["id"], "source": lk["sourceNodeId"], "target": lk["targetNodeId"]}
        for lk in built["links"]
    ]
    result = run_flow_sync(
        nodes,
        edges,
        external_inputs={"query": "聊天覆盖目标", "message": "聊天覆盖目标", "input": "聊天覆盖目标"},
    )
    assert result["success"] is True
    verify = next(r for r in result["results"] if r["nodeName"] == "verify")
    assert verify["outputs"]["result"]["verified"] is True
    assert verify["outputs"]["result"]["status"] == "completed"
    observe = next(r for r in result["results"] if r["nodeName"] == "observe")
    assert observe["outputs"]["result"]["goal"] == "聊天覆盖目标"


def test_intent_to_flow_empty_raises():
    with pytest.raises(ValueError, match="intent"):
        intent_to_flow("  ")


def test_intent_to_flow_force_template():
    result = intent_to_flow("hi", template="doc_assistant")
    assert result["template"] == "doc_assistant"
    assert any(n["type"] == "llm" for n in result["flow"]["nodes"])


def test_router_to_flow(client):
    resp = client.post("/api/v1/intent/to-flow", json={"intent": "总结这篇文档"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["template"] == "doc_assistant"
    assert data["scan"]["blocked"] is False
    assert data["flow"]["links"]
    assert data["flow"]["nodes"][0]["type"] == "input"


def test_router_to_flow_action_llm_plan(client):
    resp = client.post(
        "/api/v1/intent/to-flow",
        json={"intent": "执行巡检任务", "use_llm_plan": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["template"] == "action_loop"
    assert data["use_llm_plan"] is True
    assert any(n["type"] == "llm" for n in data["flow"]["nodes"])


def test_router_empty_intent(client):
    resp = client.post("/api/v1/intent/to-flow", json={"intent": ""})
    assert resp.status_code == 422  # pydantic min_length


def test_router_templates(client):
    resp = client.get("/api/v1/intent/templates")
    assert resp.status_code == 200
    ids = {t["id"] for t in resp.json()["templates"]}
    assert ids == {"action_loop", "doc_assistant", "simple_io"}
