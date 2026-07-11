"""A2A 多 Agent 链式协作测试"""
import asyncio

import pytest

from fangyu.engine.a2a_runtime import AgentBus, AgentOrchestrator, AgentRegistry, extract_task_output


def _code_flow(code: str):
    return {
        "nodes": [
            {"id": "s", "data": {"originType": "start", "config": {}, "label": "开始"}},
            {"id": "c", "data": {"originType": "code", "config": {"code": code}, "label": "代码"}},
            {"id": "o", "data": {"originType": "output", "config": {}, "label": "输出"}},
        ],
        "edges": [
            {"source": "s", "target": "c", "data": {}},
            {"source": "c", "target": "o", "data": {}},
        ],
    }


@pytest.fixture(autouse=True)
def _setup_agents():
    AgentRegistry.register(
        "agent_a",
        {"name": "Agent A", "skills": [{"id": "step_a"}]},
        {"step_a": _code_flow("result = 'A:' + str(_input if not isinstance(_input, dict) else _input.get('query', ''))")},
    )
    AgentRegistry.register(
        "agent_b",
        {"name": "Agent B", "skills": [{"id": "step_b"}]},
        {"step_b": _code_flow("result = 'B:' + str(_input if not isinstance(_input, dict) else _input.get('query', ''))")},
    )
    AgentRegistry.register(
        "agent_c",
        {"name": "Agent C", "skills": [{"id": "step_c"}]},
        {"step_c": _code_flow("result = 'C:' + str(_input if not isinstance(_input, dict) else _input.get('query', ''))")},
    )
    yield
    for name in ("agent_a", "agent_b", "agent_c"):
        AgentRegistry.unregister(name)


def test_orchestrator_pipeline_chain():
    bus = AgentBus()
    orch = AgentOrchestrator(bus)
    result = orch.run_pipeline(
        "hello",
        [
            {"agent": "agent_a", "skill_id": "step_a", "label": "第一步"},
            {"agent": "agent_b", "skill_id": "step_b", "label": "第二步"},
            {"agent": "agent_c", "skill_id": "step_c", "label": "第三步"},
        ],
    )
    assert result["success"] is True
    assert len(result["steps"]) == 3
    assert result["steps"][0]["output"] == "A:hello"
    assert result["steps"][1]["output"] == "B:A:hello"
    assert result["steps"][2]["output"] == "C:B:A:hello"
    assert result["final_output"] == "C:B:A:hello"


def test_orchestrator_append_mode():
    bus = AgentBus()
    orch = AgentOrchestrator(bus)
    result = orch.run_pipeline(
        "question",
        [
            {"agent": "agent_a", "skill_id": "step_a", "label": "A"},
            {"agent": "agent_b", "skill_id": "step_b", "label": "B"},
        ],
        pass_mode="append",
    )
    assert result["success"] is True
    assert "question" in result["steps"][1]["input"]
    assert "A:question" in result["steps"][1]["input"]


def test_orchestrator_empty_pipeline():
    orch = AgentOrchestrator()
    result = orch.run_pipeline("x", [])
    assert result["success"] is False
    assert "pipeline" in result["error"]


def test_extract_task_output_from_history():
    task = {
        "history": [
            {"role": "user", "parts": [{"type": "text", "text": "hi"}]},
            {"role": "agent", "parts": [{"type": "text", "text": "done"}]},
        ]
    }
    assert extract_task_output(task) == "done"
