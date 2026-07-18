"""P0-3: 多轮 agentic loop 单测。"""
from __future__ import annotations

import pytest

from fangyu.engine.agent_loop import run_agent_loop


@pytest.mark.asyncio
async def test_agent_loop_two_tool_turns_then_done():
    calls: list[str] = []

    def echo(text: str = "") -> str:
        calls.append(text)
        return f"echoed:{text}"

    def add(a: int = 0, b: int = 0) -> int:
        return int(a) + int(b)

    replies = [
        '{"action":"tool","name":"echo","args":{"text":"hi"}}',
        '{"action":"tool","name":"add","args":{"a":2,"b":3}}',
        '{"action":"done","result":"sum was 5 after echo"}',
    ]
    idx = {"i": 0}

    async def fake_llm(messages: list[dict[str, str]]) -> str:
        i = idx["i"]
        idx["i"] = i + 1
        assert messages[0]["role"] == "system"
        return replies[i]

    out = await run_agent_loop(
        goal="echo then add",
        tools={"echo": echo, "add": add},
        llm=fake_llm,
        max_turns=5,
    )
    assert out["success"] is True
    assert out["turns"] == 3
    assert "5" in (out["result"] or "")
    assert calls == ["hi"]
    assert len([t for t in out["trace"] if t.get("tool")]) == 2


@pytest.mark.asyncio
async def test_agent_loop_unknown_tool_then_recover():
    replies = [
        '{"action":"tool","name":"nope","args":{}}',
        '{"action":"done","result":"gave up"}',
    ]
    idx = {"i": 0}

    async def fake_llm(_messages):
        i = idx["i"]
        idx["i"] = i + 1
        return replies[i]

    out = await run_agent_loop(
        goal="x",
        tools={"ok": lambda: "1"},
        llm=fake_llm,
        max_turns=4,
    )
    assert out["success"] is True
    assert out["result"] == "gave up"


@pytest.mark.asyncio
async def test_agent_loop_max_turns():
    async def fake_llm(_messages):
        return '{"action":"tool","name":"tick","args":{}}'

    n = {"c": 0}

    def tick():
        n["c"] += 1
        return n["c"]

    out = await run_agent_loop(
        goal="forever",
        tools={"tick": tick},
        llm=fake_llm,
        max_turns=3,
    )
    assert out["success"] is False
    assert out["turns"] == 3
    assert "max_turns" in (out["error"] or "")
    assert n["c"] == 3
