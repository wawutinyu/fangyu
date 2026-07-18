"""Agent Loop 节点执行器 — Flow 内一等 harness 原语。"""
from __future__ import annotations

from typing import Any

from .agent_loop import CODING_SYSTEM, DEFAULT_SYSTEM, PLAN_SYSTEM, run_agent_loop
from .bundle_tools import resolve_toolbelt
from .context import NodeContext
from .llm import chat_completion, get_provider, PROVIDER_BASE_URL
from .registry import register_executor


async def _default_llm_from_ctx(ctx: NodeContext, messages: list[dict[str, str]]) -> str:
    model = ctx.config.get("model") or ctx.global_vars.get("default_model") or "deepseek-chat"
    active = str(ctx.global_vars.get("active_provider") or "deepseek")
    provider_id = get_provider(str(model), fallback=active)
    from fangyu.core.config import settings as env_settings
    db_key = ctx.global_vars.get(f"{provider_id}_api_key", "")
    env_key = getattr(env_settings, f"{provider_id.upper()}_API_KEY", "")
    api_key = ctx.config.get("api_key") or db_key or env_key or ""
    db_base = ctx.global_vars.get(f"{provider_id}_base_url", "")
    base_url = db_base or PROVIDER_BASE_URL.get(provider_id, "")
    result = await chat_completion(
        model=str(model),
        messages=messages,
        api_key=str(api_key),
        base_url=str(base_url),
        temperature=float(ctx.config.get("temperature", 0.2)),
        max_tokens=int(ctx.config.get("max_tokens", 4096)),
    )
    return str(result.get("result") or "")


async def _exec_agent_loop(ctx: NodeContext) -> dict[str, Any]:
    from fangyu.core.materials import default_materials, load_materials
    from fangyu.core.skill_pack import append_skills_to_system

    goal = (
        ctx.inputs.get("input")
        or ctx.inputs.get("query")
        or ctx.inputs.get("message")
        or ctx.config.get("goal")
        or ""
    )
    goal = str(goal).strip() or "complete the task"
    max_turns = int(ctx.config.get("max_turns") or 8)
    toolbelt = str(ctx.config.get("toolbelt") or "coding")
    bundle_root = ctx.global_vars.get("_bundle_root") or ctx.global_vars.get("bundle_root")
    materials = load_materials(bundle_root) if bundle_root else default_materials()
    tools = resolve_toolbelt(toolbelt, materials=materials, bundle_root=bundle_root)

    agent_mode = str(
        ctx.config.get("agent_mode")
        or (materials.get("policies") or {}).get("default_agent_mode")
        or "build"
    ).strip().lower()
    shell_policy = str(
        ctx.config.get("shell_policy")
        or (materials.get("policies") or {}).get("shell")
        or "ask"
    ).strip().lower()
    import os
    env_policy = (os.environ.get("FANGYU_SHELL_POLICY") or "").strip().lower()
    if env_policy in ("allow", "ask", "deny"):
        shell_policy = env_policy

    if ctx.config.get("system"):
        system = str(ctx.config.get("system"))
    elif agent_mode == "plan":
        system = PLAN_SYSTEM
    elif toolbelt == "coding":
        system = CODING_SYSTEM
    else:
        system = DEFAULT_SYSTEM
    system = append_skills_to_system(system, materials)

    require_plan = bool(ctx.config.get("require_plan", toolbelt == "coding" and agent_mode == "build"))
    enable_task = bool(ctx.config.get("enable_task", toolbelt == "coding"))

    custom = ctx.global_vars.get("_agent_loop_llm")
    if callable(custom):
        llm = custom
    else:
        async def llm(messages: list[dict[str, str]]) -> str:
            return await _default_llm_from_ctx(ctx, messages)

    out = await run_agent_loop(
        goal=goal,
        tools=tools,
        llm=llm,
        max_turns=max_turns,
        system=system,
        require_plan=require_plan,
        enable_task=enable_task,
        task_max_turns=int(ctx.config.get("task_max_turns") or 8),
        agent_mode=agent_mode,
        shell_policy=shell_policy,
    )
    return {
        "result": out.get("result"),
        "success": out.get("success"),
        "turns": out.get("turns"),
        "trace": out.get("trace"),
        "error": out.get("error"),
        "plan": out.get("plan"),
        "agent_mode": agent_mode,
    }


def register():
    register_executor("agent-loop", _exec_agent_loop)
