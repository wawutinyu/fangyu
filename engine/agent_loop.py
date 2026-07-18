"""真 Agentic Loop — LLM ↔ 工具多轮，直到 done 或达 max_turns。

与固定四段 action_loop（observe→plan→act→verify）不同：本模块按轮次把工具
结果回灌给模型，是 OpenCode / WorkBuddy harness 的地基原语。

协议（模型须返回 JSON 对象）：
  {"action": "tool", "name": "<tool>", "args": {...}}
  {"action": "done", "result": "<final text>"}
"""
from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from typing import Any

ToolFn = Callable[..., Any]
LlmFn = Callable[[list[dict[str, str]]], Awaitable[str]]

DEFAULT_SYSTEM = (
    "你是可调用工具的执行 Agent。每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '调用工具: {"action":"tool","name":"<name>","args":{...}}\n'
    '结束任务: {"action":"done","result":"<给用户的结论>"}\n'
    "可用工具会在用户消息中列出。"
)


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty LLM response")
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        raise ValueError(f"no JSON object in LLM response: {raw[:200]}")
    data = json.loads(m.group(0))
    if not isinstance(data, dict):
        raise ValueError("JSON root must be object")
    return data


def _invoke_tool(fn: ToolFn, args: dict[str, Any]) -> Any:
    result = fn(**(args or {}))
    return result


async def run_agent_loop(
    *,
    goal: str,
    tools: dict[str, ToolFn],
    llm: LlmFn,
    max_turns: int = 8,
    system: str = DEFAULT_SYSTEM,
) -> dict[str, Any]:
    """执行多轮工具环。

    Returns:
      {
        success: bool,
        result: str | None,
        turns: int,
        trace: [{role, content|tool|...}],
        error: str | None,
      }
    """
    if max_turns < 1:
        return {"success": False, "result": None, "turns": 0, "trace": [], "error": "max_turns < 1"}

    tool_names = sorted(tools.keys())
    catalog = ", ".join(tool_names) if tool_names else "(无)"
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": f"目标：{goal}\n可用工具：{catalog}\n请开始。",
        },
    ]
    trace: list[dict[str, Any]] = []

    for turn in range(1, max_turns + 1):
        try:
            reply = await llm(messages)
        except Exception as exc:
            return {
                "success": False,
                "result": None,
                "turns": turn - 1,
                "trace": trace,
                "error": f"llm error: {exc}",
            }

        messages.append({"role": "assistant", "content": reply})
        trace.append({"turn": turn, "llm": reply})

        try:
            action = _extract_json(reply)
        except (ValueError, json.JSONDecodeError) as exc:
            # 给模型一次纠错机会：记入 user，继续下一轮
            fix = f"上轮输出不是合法协议 JSON（{exc}）。请只输出 tool 或 done 的 JSON。"
            messages.append({"role": "user", "content": fix})
            trace.append({"turn": turn, "parse_error": str(exc)})
            continue

        kind = str(action.get("action") or "").lower()
        if kind == "done":
            result = action.get("result")
            text = "" if result is None else str(result)
            return {
                "success": True,
                "result": text,
                "turns": turn,
                "trace": trace,
                "error": None,
            }

        if kind != "tool":
            messages.append({
                "role": "user",
                "content": f'未知 action={kind!r}。请使用 "tool" 或 "done"。',
            })
            continue

        name = str(action.get("name") or "")
        args = action.get("args") if isinstance(action.get("args"), dict) else {}
        if name not in tools:
            obs = f"工具不存在: {name}。可用: {catalog}"
            messages.append({"role": "user", "content": obs})
            trace.append({"turn": turn, "tool": name, "error": obs})
            continue

        try:
            out = _invoke_tool(tools[name], args)
            # 支持 async tool
            if hasattr(out, "__await__"):
                out = await out  # type: ignore[misc]
            obs = json.dumps({"tool": name, "ok": True, "output": out}, ensure_ascii=False, default=str)
        except Exception as exc:
            obs = json.dumps({"tool": name, "ok": False, "error": str(exc)}, ensure_ascii=False)
        messages.append({"role": "user", "content": f"工具结果：{obs}"})
        trace.append({"turn": turn, "tool": name, "args": args, "observation": obs})

    return {
        "success": False,
        "result": None,
        "turns": max_turns,
        "trace": trace,
        "error": f"exceeded max_turns={max_turns}",
    }
