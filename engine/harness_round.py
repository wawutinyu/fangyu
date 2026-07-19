"""可编排的 Harness 单轮 — 供画布 tool-round 节点调用（非整环黑盒）。

状态存 global_vars['_harness_state']；多轮由 loop(mode=until_done) 包住 tool-round。
协议与 agent_loop 相同：plan / tool / done。
"""
from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from fangyu.engine.agent_loop import (
    CODING_SYSTEM,
    DEFAULT_SYSTEM,
    _compact_messages,
    _extract_json,
    _invoke_tool,
    _plan_progress_nudge,
    _truncate_obs,
)

ToolFn = Callable[..., Any]
LlmFn = Callable[[list[dict[str, str]]], Awaitable[str]]

STATE_KEY = "_harness_state"
DONE_KEY = "_harness_done"


def init_harness_state(
    goal: str,
    *,
    tools: dict[str, ToolFn],
    system: str = CODING_SYSTEM,
    require_plan: bool = True,
) -> dict[str, Any]:
    tool_names = sorted(tools.keys())
    catalog = ", ".join(tool_names) if tool_names else "(无)"
    plan_hint = "\n本任务要求：在调用任何 tool 之前，先输出 action=plan。" if require_plan else ""
    messages = [
        {"role": "system", "content": system or DEFAULT_SYSTEM},
        {
            "role": "user",
            "content": f"目标：{goal}\n可用工具：{catalog}{plan_hint}\n请开始。",
        },
    ]
    return {
        "goal": goal,
        "messages": messages,
        "plan_steps": [],
        "saw_tool": False,
        "last_tool_sig": None,
        "repeat_tool": 0,
        "parse_errors": 0,
        "trace": [],
        "turn": 0,
        "done": False,
        "success": False,
        "result": None,
        "error": None,
        "require_plan": require_plan,
        "catalog": catalog,
    }


async def step_harness_round(
    state: dict[str, Any],
    *,
    tools: dict[str, ToolFn],
    llm: LlmFn,
    max_turns_hint: int = 24,
) -> dict[str, Any]:
    """推进一轮；更新并返回同一 state 引用。"""
    if state.get("done"):
        return state

    turn = int(state.get("turn") or 0) + 1
    state["turn"] = turn
    messages: list[dict[str, str]] = state["messages"]
    plan_steps: list[str] = list(state.get("plan_steps") or [])
    require_plan = bool(state.get("require_plan"))
    catalog = str(state.get("catalog") or "")
    trace: list[dict[str, Any]] = state.setdefault("trace", [])

    messages[:] = _compact_messages(messages, plan_steps)
    try:
        reply = await llm(messages)
    except Exception as exc:
        state["done"] = True
        state["success"] = False
        state["error"] = f"llm error: {exc}"
        return state

    messages.append({"role": "assistant", "content": reply})
    trace.append({"turn": turn, "llm": reply})

    try:
        action = _extract_json(reply)
        state["parse_errors"] = 0
    except (ValueError, json.JSONDecodeError) as exc:
        state["parse_errors"] = int(state.get("parse_errors") or 0) + 1
        messages.append({
            "role": "user",
            "content": f"上轮输出不是合法协议 JSON（{exc}）。请只输出 plan / tool / done 的 JSON。",
        })
        trace.append({"turn": turn, "parse_error": str(exc)})
        return state

    kind = str(action.get("action") or "").lower()

    if kind == "plan":
        raw_steps = action.get("steps") or action.get("plan") or []
        if isinstance(raw_steps, str):
            plan_steps = [s.strip() for s in raw_steps.split("\n") if s.strip()]
        elif isinstance(raw_steps, list):
            plan_steps = [str(s).strip() for s in raw_steps if str(s).strip()]
        else:
            plan_steps = []
        if not plan_steps:
            messages.append({
                "role": "user",
                "content": 'plan.steps 必须是非空字符串数组。',
            })
            return state
        state["plan_steps"] = plan_steps
        trace.append({"turn": turn, "plan": plan_steps})
        messages.append({
            "role": "user",
            "content": "计划已记录。请开始执行第 1 步（action=tool），必要时可更新 plan。",
        })
        return state

    if kind == "done":
        if require_plan and not plan_steps and not state.get("saw_tool"):
            messages.append({
                "role": "user",
                "content": "尚未规划也未调用工具。请先 plan，再执行，最后 done。",
            })
            return state
        state["done"] = True
        state["success"] = True
        state["result"] = "" if action.get("result") is None else str(action.get("result"))
        state["error"] = None
        return state

    if kind != "tool":
        messages.append({
            "role": "user",
            "content": f'未知 action={kind!r}。请使用 "plan"、"tool" 或 "done"。',
        })
        return state

    if require_plan and not plan_steps:
        messages.append({
            "role": "user",
            "content": "请先输出 plan（steps 数组），再调用 tool。",
        })
        return state

    name = str(action.get("name") or "")
    args = action.get("args") if isinstance(action.get("args"), dict) else {}
    if name not in tools:
        obs = f"工具不存在: {name}。可用: {catalog}"
        messages.append({"role": "user", "content": obs})
        trace.append({"turn": turn, "tool": name, "error": obs})
        return state

    sig = f"{name}:{json.dumps(args, sort_keys=True, ensure_ascii=False)}"
    if sig == state.get("last_tool_sig"):
        state["repeat_tool"] = int(state.get("repeat_tool") or 0) + 1
    else:
        state["repeat_tool"] = 0
        state["last_tool_sig"] = sig

    try:
        from fangyu.core.org_acl import assert_org_allowed, get_principal
        assert_org_allowed(get_principal(), tool=name)
    except Exception as exc:
        obs = json.dumps({"tool": name, "ok": False, "error": str(exc)}, ensure_ascii=False)
        messages.append({"role": "user", "content": f"工具结果：{obs}"})
        trace.append({"turn": turn, "tool": name, "args": args, "observation": obs})
        return state

    try:
        out = _invoke_tool(tools[name], args)
        if hasattr(out, "__await__"):
            out = await out  # type: ignore[misc]
        obs = json.dumps({"tool": name, "ok": True, "output": out}, ensure_ascii=False, default=str)
    except Exception as exc:
        obs = json.dumps({"tool": name, "ok": False, "error": str(exc)}, ensure_ascii=False)

    obs = _truncate_obs(obs)
    state["saw_tool"] = True
    user_msg = f"工具结果：{obs}"
    if int(state.get("repeat_tool") or 0) >= 2:
        user_msg += "\n注意：你已连续多次调用相同工具与参数。请换策略。"
    if plan_steps and turn % 4 == 0:
        user_msg += "\n" + _plan_progress_nudge(plan_steps, turn, max_turns_hint)
    messages.append({"role": "user", "content": user_msg})
    trace.append({
        "turn": turn, "tool": name, "args": args,
        "observation": obs, "repeat": state.get("repeat_tool"),
    })
    return state
