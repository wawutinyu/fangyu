"""各节点类型最小 Flow 执行测试 — 确保 start→节点→output 可跑通。"""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from flow_test_helpers import assert_flow_ok, chain_flow, edge, node, run_flow_sync
from fangyu.engine.executor import register_executors
from fangyu.engine.registry import _EXECUTORS


@pytest.fixture(scope="module", autouse=True)
def _ensure_executors():
    register_executors()


def test_all_core_executors_registered():
    expected = {
        "start", "end", "condition", "switch", "loop", "composite", "composite-node",
        "approval", "trigger", "input", "output",
        "llm", "code", "knowledge", "search", "prompt-assembly",
        "json-parse", "variable-set", "variable-get", "transform", "text-process",
        "memory-read", "memory-write", "extract-memory", "search-sessions",
        "http", "tool-call", "register-tool", "execute-skill", "learn-skill",
    }
    missing = expected - set(_EXECUTORS.keys())
    assert not missing, f"缺少 executor: {missing}"


def test_start_node():
    result = run_flow_sync([node("s", "start"), node("o", "output")], [edge("s", "o")], external_inputs={"query": "hi"})
    assert_flow_ok(result, "start", lambda o: o.get("query") == "hi")


def test_end_node():
    nodes = [node("i", "input", config={"default_value": "done"}), node("e", "end")]
    result = run_flow_sync(nodes, [edge("i", "e")])
    assert_flow_ok(result, "end", lambda o: o.get("result") == "done")


def test_input_output_nodes():
    assert_flow_ok(
        chain_flow({"originType": "input", "config": {"default_value": "payload"}}),
        "output",
        lambda o: o.get("result") == "payload",
    )


def test_code_node():
    assert_flow_ok(
        chain_flow({"originType": "code", "config": {"code": "result = 'ok'"}}),
        "output",
        lambda o: o.get("result") == "ok",
    )


def test_condition_node_true_branch():
    nodes = [
        node("s", "start"),
        node("c", "condition", config={"expression": "input == 'yes'"}),
        node("o", "output"),
    ]
    result = run_flow_sync(nodes, [edge("s", "c"), edge("c", "o")], external_inputs={"input": "yes"})
    assert_flow_ok(result, "condition", lambda o: o.get("result") is True and o.get("branch") == "true")


def test_switch_node():
    assert_flow_ok(
        chain_flow({"originType": "switch", "config": {"expression": "input"}}, external_inputs={"input": "branch-a"}),
        "switch",
        lambda o: o.get("result") == "branch-a",
    )


def test_trigger_node():
    assert_flow_ok(
        chain_flow({"originType": "trigger"}, external_inputs={"message": "hello"}),
        "trigger",
        lambda o: o.get("message") == "hello" and o.get("triggered") is True,
    )


def test_approval_node():
    assert_flow_ok(
        chain_flow({"originType": "approval", "config": {"message": "approve me"}}, external_inputs={"input": "data"}),
        "approval",
        lambda o: o.get("status") == "pending" and o.get("approval_id"),
    )


def test_json_parse_node():
    assert_flow_ok(
        chain_flow({"originType": "json-parse", "config": {"source": '{"k": 1}'}}),
        "json-parse",
        lambda o: isinstance(o.get("result"), dict) and o["result"].get("k") == 1,
    )


def test_variable_set_and_get():
    nodes = [
        node("s", "start"),
        node("set", "variable-set", config={"var_name": "foo", "var_value": "bar"}),
        node("get", "variable-get", config={"var_name": "foo"}),
        node("o", "output"),
    ]
    edges = [edge("s", "set"), edge("set", "get"), edge("get", "o")]
    result = run_flow_sync(nodes, edges)
    assert_flow_ok(result, "variable-get", lambda o: o.get("value") == "bar")


def test_transform_mapping():
    nodes = [
        node("i", "input", config={"default_value": {"name": "alice", "age": 20}}),
        node("t", "transform", config={"mapping": {"username": "name", "years": "age"}}),
        node("o", "output"),
    ]
    result = run_flow_sync(nodes, [edge("i", "t"), edge("t", "o")])
    assert_flow_ok(result, "output", lambda o: o.get("result", {}).get("username") == "alice")


def test_text_process_trim():
    assert_flow_ok(
        chain_flow({"originType": "text-process", "config": {"operation": "trim"}}, external_inputs={"text": "  hi  "}),
        "output",
        lambda o: o.get("result") == "hi",
    )


def test_text_process_upper():
    assert_flow_ok(
        chain_flow({"originType": "text-process", "config": {"operation": "upper"}}, external_inputs={"text": "abc"}),
        "output",
        lambda o: o.get("result") == "ABC",
    )


def test_prompt_assembly_node():
    result = chain_flow(
        {"originType": "prompt-assembly", "config": {"stable": "system"}},
        external_inputs={"context": "ctx", "volatile": "vol"},
    )
    assert_flow_ok(result, "prompt-assembly", lambda o: "system" in o.get("assembled", ""))


@patch("fangyu.engine.knowledge.get_embedding", new_callable=AsyncMock)
def test_knowledge_node_empty(mock_embed):
    mock_embed.return_value = None
    assert_flow_ok(
        chain_flow({"originType": "knowledge", "config": {"top_k": 1}}, external_inputs={"query": "test"}),
        "knowledge",
        lambda o: "results" in o,
    )


def test_search_node_empty_query():
    assert_flow_ok(
        chain_flow({"originType": "search"}, external_inputs={"query": ""}),
        "search",
        lambda o: o.get("results") == [],
    )


def test_memory_write_and_read():
    nodes = [
        node("s", "start"),
        node("w", "memory-write", config={"scope": "user", "memory_key": "test_key", "memory_value": "v1"}),
        node("r", "memory-read", config={"scope": "user", "memory_key": "test_key"}),
    ]
    result = run_flow_sync(nodes, [edge("s", "w"), edge("w", "r")])
    assert_flow_ok(result, "memory-read", lambda o: o.get("value") == "v1")


def test_extract_memory_node():
    assert_flow_ok(
        chain_flow(
            {"originType": "extract-memory", "config": {"max_facts": 2}},
            external_inputs={"text": "用户是需要使用这个工具来完成任务的。"},
        ),
        "extract-memory",
        lambda o: o.get("count", 0) >= 0,
    )


def test_search_sessions_node():
    assert_flow_ok(
        chain_flow({"originType": "search-sessions", "config": {"limit": 5}}, external_inputs={"query": "hello"}),
        "search-sessions",
        lambda o: "results" in o,
    )


def test_register_tool_node():
    llm_out = '{"tool": "demo", "description": "d", "parameters": {}}'
    assert_flow_ok(
        chain_flow({"originType": "register-tool", "config": {"llm_output": llm_out}}),
        "register-tool",
        lambda o: o.get("count", 0) >= 0,
    )


def test_execute_skill_missing():
    assert_flow_ok(
        chain_flow({"originType": "execute-skill", "config": {"skill_name": "__nonexistent_skill__"}}),
        "execute-skill",
        lambda o: o.get("success") is False,
        allow_error=True,
    )


def test_learn_skill_node():
    md = "# SkillA\n## 描述\n测试技能\n## 步骤\n1. 做某事"
    assert_flow_ok(
        chain_flow({"originType": "learn-skill", "config": {"llm_output": md}}),
        "learn-skill",
        lambda o: o.get("count", 0) >= 0,
    )


def test_tool_call_node():
    assert_flow_ok(
        chain_flow({"originType": "tool-call", "config": {"tool_name": "skill_list", "args": {}}}),
        "tool-call",
        lambda o: o.get("success") is True,
    )


@patch("fangyu.engine.exec_ai.chat_completion", new_callable=AsyncMock)
def test_llm_node(mock_chat):
    mock_chat.return_value = {"result": "mock-reply", "usage": {}}
    assert_flow_ok(
        chain_flow({"originType": "llm", "config": {"model": "gpt-4o", "prompt": "hi"}}, external_inputs={"input": "hi"}),
        "output",
        lambda o: o.get("result") == "mock-reply",
    )


@patch("httpx.AsyncClient")
def test_http_node(mock_client_cls):
    from unittest.mock import MagicMock
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True}
    mock_resp.headers = {}
    mock_resp.text = '{"ok": true}'
    mock_client = AsyncMock()
    mock_client.request = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client_cls.return_value = mock_client

    assert_flow_ok(
        chain_flow({"originType": "http", "config": {"url": "https://example.com", "method": "GET"}}),
        "http",
        lambda o: o.get("status") == 200,
    )


def test_loop_node_with_inner_graph():
    nodes = [
        node("s", "start"),
        node("arr", "code", config={"code": "result = [1, 2]"}),
        node(
            "loop",
            "loop",
            config={"max_iterations": 5},
            inner_nodes=[
                {"id": "li", "originType": "input", "config": {"default_value": "item"}},
                {"id": "lo", "originType": "output", "config": {}},
            ],
            inner_links=[{"sourceNodeId": "li", "targetNodeId": "lo", "linkType": "serial", "mappings": {}}],
        ),
    ]
    edges = [edge("s", "arr"), edge("arr", "loop")]
    result = run_flow_sync(nodes, edges)
    assert result["success"] is True
    loop_row = next(r for r in result["results"] if r["type"] == "loop")
    assert loop_row["outputs"].get("count", 0) == 2


def test_composite_node_inner_output():
    nodes = [
        node("s", "start"),
        node(
            "g",
            "composite",
            inner_nodes=[
                {"id": "i0", "originType": "input", "config": {"default_value": "inner-val"}},
                {"id": "i1", "originType": "output", "config": {}},
            ],
            inner_links=[{"sourceNodeId": "i0", "targetNodeId": "i1", "linkType": "serial", "mappings": {}}],
        ),
        node("o", "output"),
    ]
    result = run_flow_sync(nodes, [edge("s", "g"), edge("g", "o")])
    assert result["success"] is True
    comp = next(r for r in result["results"] if r["type"] == "composite")
    assert comp["outputs"]["outputs"]["i1"]["result"] == "inner-val"
