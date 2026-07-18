"""Intent → Agent 网单元测试。"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from fangyu.core.intent_agents import classify_agent_intent, intent_to_agent_graph
from fangyu.server import app


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.mark.parametrize(
    "intent,expected",
    [
        ("hi", "simple_dual"),
        ("搜索并分析再汇总", "search_analyze_summarize"),
        ("产线巡检工人执行", "worker_pair"),
        ("请协作写本周产品周报并落盘", "office_report"),
        ("please collaborate on a long enough topic", "search_analyze_summarize"),
    ],
)
def test_classify_agent_intent(intent, expected):
    assert classify_agent_intent(intent) == expected


def test_intent_to_agent_graph_shape():
    result = intent_to_agent_graph("搜索分析汇总报告")
    assert result["template"] == "search_analyze_summarize"
    graph = result["graph"]
    assert len(graph["nodes"]) >= 3
    assert any(n["type"] == "a2a-router" for n in graph["nodes"])
    assert any(n["type"] == "a2a-agent" for n in graph["nodes"])
    assert graph["edges"]
    assert "agent_search" in graph["pipeline"]


def test_intent_to_agent_empty():
    with pytest.raises(ValueError):
        intent_to_agent_graph("  ")


def test_router_to_agents(client):
    resp = client.post("/api/v1/intent/to-agents", json={"intent": "产线巡检执行"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["template"] == "worker_pair"
    assert data["graph"]["nodes"]
    types = {n["type"] for n in data["graph"]["nodes"]}
    assert "a2a-agent" in types


def test_templates_include_agent(client):
    resp = client.get("/api/v1/intent/templates")
    assert resp.status_code == 200
    ids = {t["id"] for t in resp.json()["agent_templates"]}
    assert "search_analyze_summarize" in ids
