"""OpenCode 风格 task：主 Agent 委派子 Agent（隔离 agent-loop）。

P0：explore | general | review；禁嵌套；task_id 续跑
P1：tasks[] 并行；background=true 异步回灌父环
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from fangyu.engine.bundle_tools import (
    builtin_tool_impls,
    coding_toolbelt,
)

LlmFn = Callable[[list[dict[str, str]]], Awaitable[str]]

EXPLORE_SYSTEM = (
    "你是只读探索子 Agent（explore）。每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '调用工具: {"action":"tool","name":"<name>","args":{...}}\n'
    '结束: {"action":"done","result":"<给父 Agent 的简洁发现>"}\n'
    "只用 list / glob / grep / search / read；不要改文件。结论要含具体路径与要点。\n"
    "可用工具会在用户消息中列出。"
)

GENERAL_SYSTEM = (
    "你是通用执行子 Agent（general）。每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '调用工具: {"action":"tool","name":"<name>","args":{...}}\n'
    '结束: {"action":"done","result":"<给父 Agent 的结论>"}\n'
    "在工作区内完成指派的编码子任务；不确定时可用 question；改完用简洁结果汇报。\n"
    "可用工具会在用户消息中列出。"
)

REVIEW_SYSTEM = (
    "你是只读审查子 Agent（review）。每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '调用工具: {"action":"tool","name":"<name>","args":{...}}\n'
    '结束: {"action":"done","result":"<审查结论：问题/风险/建议>"}\n'
    "只用 list / glob / grep / search / read；聚焦正确性、安全与明显缺陷。\n"
    "可用工具会在用户消息中列出。"
)

SCOUT_SYSTEM = (
    "你是外研子 Agent（scout）。每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '调用工具: {"action":"tool","name":"<name>","args":{...}}\n'
    '结束: {"action":"done","result":"<调研结论：来源 URL + 要点>"}\n'
    "优先 websearch / webfetch；需要对照本地时用 glob/grep/read。不要改文件。\n"
    "可用工具会在用户消息中列出。"
)

SUBAGENT_TYPES: dict[str, dict[str, Any]] = {
    "explore": {
        "description": "只读探索代码库（list/glob/grep/read）",
        "system": EXPLORE_SYSTEM,
        "require_plan": False,
        "max_turns": 8,
        "readonly": True,
    },
    "general": {
        "description": "通用编码子任务（完整 coding 手脚，不可再 task）",
        "system": GENERAL_SYSTEM,
        "require_plan": False,
        "max_turns": 12,
        "readonly": False,
    },
    "review": {
        "description": "只读代码审查（list/glob/grep/read）",
        "system": REVIEW_SYSTEM,
        "require_plan": False,
        "max_turns": 8,
        "readonly": True,
    },
    "scout": {
        "description": "外网调研 + 只读仓内对照（webfetch/websearch）",
        "system": SCOUT_SYSTEM,
        "require_plan": False,
        "max_turns": 10,
        "readonly": True,
    },
}

_SESSIONS: dict[str, dict[str, Any]] = {}


def list_subagent_types() -> list[dict[str, str]]:
    return [
        {"id": sid, "description": str(meta["description"])}
        for sid, meta in SUBAGENT_TYPES.items()
    ]


def clear_task_sessions() -> None:
    _SESSIONS.clear()


def tools_for_subagent(subagent_type: str) -> dict[str, Any]:
    meta = SUBAGENT_TYPES.get(subagent_type)
    if not meta:
        raise ValueError(f"未知 subagent_type: {subagent_type}；可选: {', '.join(SUBAGENT_TYPES)}")
    from fangyu.core.materials import role_tool_ids

    ids = role_tool_ids(subagent_type)
    impls = builtin_tool_impls()
    if ids:
        out = {tid: impls[tid] for tid in ids if tid in impls}
        if out:
            return out
    if meta.get("readonly"):
        # 回退只读集
        return {
            k: impls[k]
            for k in ("read", "list", "glob", "grep", "search")
            if k in impls
        }
    return coding_toolbelt()


def _normalize_spec(item: dict[str, Any] | None = None, **kwargs: Any) -> dict[str, Any]:
    raw = dict(item or {})
    raw.update({k: v for k, v in kwargs.items() if v is not None and v != ""})
    return {
        "subagent_type": str(raw.get("subagent_type") or "explore").strip().lower(),
        "prompt": str(raw.get("prompt") or "").strip(),
        "description": str(raw.get("description") or "").strip(),
        "task_id": str(raw.get("task_id") or "").strip(),
        "max_turns": int(raw.get("max_turns") or 0),
    }


async def _run_one_child(
    *,
    llm: LlmFn,
    depth: int,
    max_depth: int,
    default_max_turns: int | None,
    spec: dict[str, Any],
) -> dict[str, Any]:
    if depth >= max_depth:
        return {
            "ok": False,
            "error": f"已达 subagent 深度上限 ({max_depth})，禁止嵌套 task",
            "task_id": spec.get("task_id") or None,
        }
    kind = spec["subagent_type"]
    if kind not in SUBAGENT_TYPES:
        return {
            "ok": False,
            "error": f"未知 subagent_type={kind!r}；可选: {', '.join(SUBAGENT_TYPES)}",
            "task_id": None,
        }
    goal = spec["prompt"]
    if not goal:
        return {"ok": False, "error": "prompt 不能为空", "task_id": None}

    meta = SUBAGENT_TYPES[kind]
    sid = spec["task_id"] or uuid.uuid4().hex[:12]
    prev = _SESSIONS.get(sid)
    if prev and prev.get("result"):
        goal = (
            f"【续跑同一子会话 task_id={sid}】\n"
            f"上轮结论：{prev.get('result')}\n"
            f"新任务：{goal}"
        )

    turns = (
        int(spec["max_turns"])
        if spec["max_turns"] and int(spec["max_turns"]) > 0
        else int(default_max_turns or meta.get("max_turns") or 8)
    )
    from fangyu.engine.agent_loop import run_agent_loop

    out = await run_agent_loop(
        goal=goal,
        tools=tools_for_subagent(kind),
        llm=llm,
        max_turns=turns,
        system=str(meta["system"]),
        require_plan=bool(meta.get("require_plan")),
        enable_task=True,
        task_depth=depth + 1,
        max_task_depth=max_depth,
    )
    summary = {
        "ok": bool(out.get("success")),
        "task_id": sid,
        "subagent_type": kind,
        "description": spec["description"] or kind,
        "result": out.get("result"),
        "turns": out.get("turns"),
        "error": out.get("error"),
        "plan": out.get("plan") or [],
        "background": False,
    }
    _SESSIONS[sid] = {
        "subagent_type": kind,
        "result": summary.get("result"),
        "success": summary["ok"],
        "description": summary["description"],
    }
    return summary


class TaskRuntime:
    """绑定到一次父 agent-loop：并行、后台任务与回灌队列。"""

    def __init__(
        self,
        *,
        llm: LlmFn,
        depth: int = 0,
        max_depth: int = 1,
        default_max_turns: int | None = None,
    ) -> None:
        self.llm = llm
        self.depth = depth
        self.max_depth = max_depth
        self.default_max_turns = default_max_turns
        self.inject_queue: list[dict[str, Any]] = []
        self._bg_tasks: list[asyncio.Task[Any]] = []

    def make_tool(self) -> Any:
        runtime = self

        async def task(
            subagent_type: str = "explore",
            prompt: str = "",
            description: str = "",
            task_id: str = "",
            max_turns: int = 0,
            background: bool = False,
            tasks: list | None = None,
        ) -> dict[str, Any]:
            specs: list[dict[str, Any]]
            if isinstance(tasks, list) and tasks:
                specs = [_normalize_spec(x if isinstance(x, dict) else {}) for x in tasks]
            else:
                specs = [_normalize_spec(
                    subagent_type=subagent_type,
                    prompt=prompt,
                    description=description,
                    task_id=task_id,
                    max_turns=max_turns,
                )]

            if any(not s["prompt"] for s in specs):
                return {"ok": False, "error": "每个子任务都需要非空 prompt", "task_id": None}

            # 并行前台
            if len(specs) > 1 and not background:
                results = await asyncio.gather(*[
                    _run_one_child(
                        llm=runtime.llm,
                        depth=runtime.depth,
                        max_depth=runtime.max_depth,
                        default_max_turns=runtime.default_max_turns,
                        spec=s,
                    )
                    for s in specs
                ])
                return {
                    "ok": all(r.get("ok") for r in results),
                    "parallel": True,
                    "count": len(results),
                    "results": list(results),
                }

            # 单个或多个后台
            if background:
                started: list[dict[str, Any]] = []
                for s in specs:
                    sid = s["task_id"] or uuid.uuid4().hex[:12]
                    s = {**s, "task_id": sid}
                    started.append({
                        "task_id": sid,
                        "subagent_type": s["subagent_type"],
                        "description": s["description"] or s["subagent_type"],
                        "status": "running",
                    })

                    async def _job(spec: dict[str, Any] = s) -> None:
                        try:
                            summary = await _run_one_child(
                                llm=runtime.llm,
                                depth=runtime.depth,
                                max_depth=runtime.max_depth,
                                default_max_turns=runtime.default_max_turns,
                                spec=spec,
                            )
                        except Exception as exc:  # noqa: BLE001
                            summary = {
                                "ok": False,
                                "task_id": spec.get("task_id"),
                                "subagent_type": spec.get("subagent_type"),
                                "description": spec.get("description") or "",
                                "result": None,
                                "error": str(exc),
                                "background": True,
                            }
                        summary["background"] = True
                        summary["status"] = "completed" if summary.get("ok") else "error"
                        runtime.inject_queue.append(summary)

                    runtime._bg_tasks.append(asyncio.create_task(_job()))

                out: dict[str, Any] = {
                    "ok": True,
                    "background": True,
                    "status": "running",
                    "message": (
                        "后台 task 已启动，完成后会自动注入父会话。"
                        "勿轮询；可继续做不重叠的工作。"
                    ),
                }
                if len(started) == 1:
                    out.update(started[0])
                else:
                    out["parallel"] = True
                    out["jobs"] = started
                return out

            # 单个前台
            return await _run_one_child(
                llm=runtime.llm,
                depth=runtime.depth,
                max_depth=runtime.max_depth,
                default_max_turns=runtime.default_max_turns,
                spec=specs[0],
            )

        task.__name__ = "task"
        task.__doc__ = (
            "委派子 Agent。单任务: subagent_type, prompt, description?, task_id?, "
            "max_turns?, background?。并行: tasks=[{subagent_type,prompt,...},...]。"
        )
        return task

    def drain_injects(self) -> list[dict[str, Any]]:
        items = list(self.inject_queue)
        self.inject_queue.clear()
        return items

    async def wait_background(self, timeout: float | None = None) -> list[dict[str, Any]]:
        pending = [t for t in self._bg_tasks if not t.done()]
        if pending:
            await asyncio.wait(pending, timeout=timeout)
        self._bg_tasks = [t for t in self._bg_tasks if not t.done()]
        return self.drain_injects()


def make_task_tool(
    *,
    llm: LlmFn,
    depth: int = 0,
    max_depth: int = 1,
    default_max_turns: int | None = None,
    runtime: TaskRuntime | None = None,
) -> Any:
    """返回 task 工具；若传入 runtime 则复用其队列（供父 loop 回灌）。"""
    rt = runtime or TaskRuntime(
        llm=llm,
        depth=depth,
        max_depth=max_depth,
        default_max_turns=default_max_turns,
    )
    return rt.make_tool()
