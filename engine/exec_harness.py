"""画布可编排 Harness 原语 — tool-round（单轮）。"""
from __future__ import annotations

from typing import Any

from .agent_loop import CODING_SYSTEM, DEFAULT_SYSTEM, PLAN_SYSTEM
from .context import NodeContext
from .harness_round import (
    DONE_KEY,
    STATE_KEY,
    init_harness_state,
    step_harness_round,
)
from .registry import register_executor


def _ensure_workspace(global_vars: dict[str, Any]) -> None:
    from fangyu.engine.workspace import get_active_workspace, init_bundle_workspace
    import tempfile
    from pathlib import Path

    if get_active_workspace() is not None:
        return
    override = global_vars.get("workspace_path") or global_vars.get("workspace")
    bundle = global_vars.get("_bundle_root") or global_vars.get("bundle_root")
    if override:
        root = Path(str(override)).expanduser()
        root.mkdir(parents=True, exist_ok=True)
        # 用临时 bundle 壳指向该 workspace
        tmp = Path(tempfile.mkdtemp(prefix="fangyu-flow-ws-"))
        (tmp / "config").mkdir(parents=True, exist_ok=True)
        init_bundle_workspace(tmp, workspace_override=root)
        global_vars["_bundle_root"] = str(tmp)
        global_vars["workspace_path"] = str(root.resolve())
        return
    if bundle:
        init_bundle_workspace(bundle)
        return
    # Studio 预览无 workspace 时建临时目录，保证 coding 工具可写
    tmp = Path(tempfile.mkdtemp(prefix="fangyu-compose-ws-"))
    (tmp / "workspace").mkdir(exist_ok=True)
    init_bundle_workspace(tmp)
    global_vars["_bundle_root"] = str(tmp)
    global_vars["workspace_path"] = str(tmp / "workspace")


async def _default_llm(ctx: NodeContext, messages: list[dict[str, str]]) -> str:
    from .exec_agent import _default_llm_from_ctx
    return await _default_llm_from_ctx(ctx, messages)


async def _exec_tool_round(ctx: NodeContext) -> dict[str, Any]:
    from fangyu.core.materials import default_materials, load_materials
    from fangyu.core.skill_pack import append_skills_to_system
    from fangyu.engine.bundle_tools import resolve_toolbelt

    _ensure_workspace(ctx.global_vars)

    goal = (
        ctx.inputs.get("input")
        or ctx.inputs.get("query")
        or ctx.inputs.get("message")
        or ctx.config.get("goal")
        or ctx.global_vars.get("_harness_goal")
        or ""
    )
    goal = str(goal).strip() or "complete the task"
    ctx.global_vars["_harness_goal"] = goal

    toolbelt = str(ctx.config.get("toolbelt") or "coding")
    bundle_root = ctx.global_vars.get("_bundle_root") or ctx.global_vars.get("bundle_root")
    materials = load_materials(bundle_root) if bundle_root else default_materials()
    tools = resolve_toolbelt(toolbelt, materials=materials, bundle_root=bundle_root)

    agent_mode = str(ctx.config.get("agent_mode") or "build").strip().lower()
    require_plan = bool(ctx.config.get("require_plan", True))
    if ctx.config.get("system"):
        system = str(ctx.config.get("system"))
    elif agent_mode == "plan":
        system = PLAN_SYSTEM
    elif toolbelt == "coding":
        system = CODING_SYSTEM
    else:
        system = DEFAULT_SYSTEM
    system = append_skills_to_system(system, materials)

    state = ctx.global_vars.get(STATE_KEY)
    if not isinstance(state, dict) or not state.get("messages"):
        state = init_harness_state(
            goal, tools=tools, system=system, require_plan=require_plan,
        )
        ctx.global_vars[STATE_KEY] = state
        ctx.global_vars[DONE_KEY] = False

    custom = ctx.global_vars.get("_agent_loop_llm") or ctx.global_vars.get("_harness_llm")
    if callable(custom):
        llm = custom
    else:
        async def llm(messages: list[dict[str, str]]) -> str:
            return await _default_llm(ctx, messages)

    max_hint = int(ctx.config.get("max_turns_hint") or ctx.global_vars.get("_harness_max_turns") or 24)
    await step_harness_round(state, tools=tools, llm=llm, max_turns_hint=max_hint)
    ctx.global_vars[STATE_KEY] = state
    ctx.global_vars[DONE_KEY] = bool(state.get("done"))

    return {
        "result": state.get("result") or state.get("trace") and state["trace"][-1] or None,
        "done": bool(state.get("done")),
        "success": bool(state.get("success")),
        "turn": state.get("turn"),
        "plan": state.get("plan_steps"),
        "error": state.get("error"),
        "action": (state.get("trace") or [{}])[-1],
    }


def register():
    register_executor("tool-round", _exec_tool_round)
