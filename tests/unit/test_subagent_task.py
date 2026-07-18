"""P0: task 子 Agent 委派。"""
from __future__ import annotations

import pytest

from fangyu.engine.agent_loop import run_agent_loop
from fangyu.engine.subagent_task import clear_task_sessions, list_subagent_types, tools_for_subagent
from fangyu.engine.workspace import init_bundle_workspace


def test_list_subagent_types():
    ids = {x["id"] for x in list_subagent_types()}
    assert ids == {"explore", "general", "review"}


def test_explore_tools_readonly():
    tools = tools_for_subagent("explore")
    assert set(tools) == {"read", "list", "search"}
    assert "write" not in tools and "task" not in tools


@pytest.mark.asyncio
async def test_parent_task_explore_then_done(tmp_path):
    clear_task_sessions()
    root = tmp_path / "b"
    (root / "workspace").mkdir(parents=True)
    (root / "workspace" / "note.txt").write_text("hello-task\n", encoding="utf-8")
    init_bundle_workspace(root)

    # 父：plan → task explore → done
    # 子：list → read → done
    parent_replies = [
        '{"action":"plan","steps":["explore","summarize"]}',
        (
            '{"action":"tool","name":"task","args":{'
            '"subagent_type":"explore",'
            '"prompt":"列出工作区并读 note.txt，汇报内容",'
            '"description":"scout note"'
            "}}"
        ),
        '{"action":"done","result":"parent saw child"}',
    ]
    child_replies = [
        '{"action":"tool","name":"list","args":{"path":"."}}',
        '{"action":"tool","name":"read","args":{"path":"note.txt"}}',
        '{"action":"done","result":"note.txt contains hello-task"}',
    ]
    state = {"phase": "parent", "pi": 0, "ci": 0}

    async def fake_llm(messages):
        # 子会话 system 含「探索子 Agent」
        sys0 = messages[0]["content"] if messages else ""
        if "探索子 Agent" in sys0 or "explore" in sys0.lower() and "只读" in sys0:
            i = state["ci"]
            state["ci"] = i + 1
            return child_replies[min(i, len(child_replies) - 1)]
        i = state["pi"]
        state["pi"] = i + 1
        return parent_replies[min(i, len(parent_replies) - 1)]

    from fangyu.engine.bundle_tools import coding_toolbelt

    out = await run_agent_loop(
        goal="用 task explore 查看 note.txt",
        tools=coding_toolbelt(),
        llm=fake_llm,
        max_turns=8,
        require_plan=True,
        enable_task=True,
    )
    assert out["success"] is True
    assert out["result"] == "parent saw child"
    task_traces = [t for t in out["trace"] if t.get("tool") == "task"]
    assert len(task_traces) == 1
    obs = task_traces[0].get("observation") or ""
    assert "hello-task" in obs or "note.txt" in obs
    assert "task_id" in obs


@pytest.mark.asyncio
async def test_task_parallel_two_explores(tmp_path):
    clear_task_sessions()
    root = tmp_path / "bp"
    (root / "workspace").mkdir(parents=True)
    (root / "workspace" / "a.txt").write_text("AAA\n", encoding="utf-8")
    (root / "workspace" / "b.txt").write_text("BBB\n", encoding="utf-8")
    init_bundle_workspace(root)

    parent_replies = [
        (
            '{"action":"tool","name":"task","args":{"tasks":['
            '{"subagent_type":"explore","prompt":"只读 a.txt 汇报内容","description":"a"},'
            '{"subagent_type":"explore","prompt":"只读 b.txt 汇报内容","description":"b"}'
            "]}}"
        ),
        '{"action":"done","result":"both done"}',
    ]
    # 两个子会话各自：read → done
    child_queues = {
        "a": [
            '{"action":"tool","name":"read","args":{"path":"a.txt"}}',
            '{"action":"done","result":"a has AAA"}',
        ],
        "b": [
            '{"action":"tool","name":"read","args":{"path":"b.txt"}}',
            '{"action":"done","result":"b has BBB"}',
        ],
    }
    child_idx = {"a": 0, "b": 0}
    parent_i = {"i": 0}

    async def fake_llm(messages):
        sys0 = messages[0]["content"] if messages else ""
        if "探索子 Agent" in sys0:
            # 用 goal 里的路径区分
            user = "\n".join(m["content"] for m in messages if m["role"] == "user")
            key = "a" if "a.txt" in user and "b.txt" not in user.split("新任务")[-1] else (
                "a" if "只读 a.txt" in user else "b"
            )
            if "只读 a.txt" in user:
                key = "a"
            elif "只读 b.txt" in user:
                key = "b"
            i = child_idx[key]
            child_idx[key] = i + 1
            return child_queues[key][min(i, len(child_queues[key]) - 1)]
        i = parent_i["i"]
        parent_i["i"] = i + 1
        return parent_replies[min(i, len(parent_replies) - 1)]

    from fangyu.engine.bundle_tools import coding_toolbelt

    out = await run_agent_loop(
        goal="parallel explore",
        tools=coding_toolbelt(),
        llm=fake_llm,
        max_turns=6,
        require_plan=False,
        enable_task=True,
    )
    assert out["success"] is True
    obs = next(t["observation"] for t in out["trace"] if t.get("tool") == "task")
    assert "parallel" in obs
    assert "AAA" in obs and "BBB" in obs


@pytest.mark.asyncio
async def test_task_background_inject(tmp_path):
    clear_task_sessions()
    root = tmp_path / "bb"
    (root / "workspace").mkdir(parents=True)
    (root / "workspace" / "x.txt").write_text("xyz\n", encoding="utf-8")
    init_bundle_workspace(root)

    # 父：background task → 立刻 list → done（结束前回收 bg）
    parent_replies = [
        (
            '{"action":"tool","name":"task","args":{'
            '"subagent_type":"explore","prompt":"读 x.txt","description":"bgx","background":true}}'
        ),
        '{"action":"tool","name":"list","args":{"path":"."}}',
        '{"action":"done","result":"parent done"}',
    ]
    child_replies = [
        '{"action":"tool","name":"read","args":{"path":"x.txt"}}',
        '{"action":"done","result":"x has xyz"}',
    ]
    pi, ci = {"i": 0}, {"i": 0}

    async def fake_llm(messages):
        sys0 = messages[0]["content"] if messages else ""
        if "探索子 Agent" in sys0:
            i = ci["i"]
            ci["i"] = i + 1
            return child_replies[min(i, len(child_replies) - 1)]
        i = pi["i"]
        pi["i"] = i + 1
        return parent_replies[min(i, len(parent_replies) - 1)]

    from fangyu.engine.bundle_tools import coding_toolbelt

    out = await run_agent_loop(
        goal="bg task",
        tools=coding_toolbelt(),
        llm=fake_llm,
        max_turns=8,
        require_plan=False,
        enable_task=True,
    )
    assert out["success"] is True
    assert any(t.get("background_inject") for t in out["trace"])
    injects = [t["background_inject"] for t in out["trace"] if t.get("background_inject")]
    assert any("xyz" in str(x.get("result") or "") for x in injects)
