"""Bundle 内多 Agent 编排运行时 — 读 topology.json 链式 agent-loop。"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fangyu.core.topology_export import load_topology
from fangyu.engine.agent_loop import DEFAULT_SYSTEM, run_agent_loop
from fangyu.engine.bundle_tools import resolve_toolbelt
from fangyu.engine.workspace import bind_external_workspace, init_bundle_workspace


async def _default_llm(messages: list[dict[str, str]]) -> str:
    from fangyu.core.config import settings as env_settings
    from fangyu.engine.llm import PROVIDER_BASE_URL, chat_completion, get_provider

    model = "deepseek-chat"
    provider_id = get_provider(model, fallback="deepseek")
    api_key = getattr(env_settings, f"{provider_id.upper()}_API_KEY", "") or ""
    base_url = PROVIDER_BASE_URL.get(provider_id, "")
    result = await chat_completion(
        model=model,
        messages=messages,
        api_key=str(api_key),
        base_url=str(base_url),
        temperature=0.3,
        max_tokens=2048,
    )
    return str(result.get("result") or "")


async def run_topology_async(
    bundle_dir: str | Path,
    query: str,
    *,
    workspace: str | Path | None = None,
    llm=None,
    max_turns: int = 8,
) -> dict[str, Any]:
    """按 config/topology.json 链式跑各角色 agent-loop（共享 workspace）。"""
    root = Path(bundle_dir)
    from fangyu.core.agent_bundle import activate_bundle_runtime_context

    activate_bundle_runtime_context(root)
    if workspace:
        bind_external_workspace(root, workspace)
        init_bundle_workspace(root, workspace_override=str(workspace))
    else:
        init_bundle_workspace(root)

    topology = load_topology(root)
    agents = {a["id"]: a for a in topology.get("agents") or []}
    pipeline = list(topology.get("pipeline") or [])
    pass_mode = topology.get("pass_mode") or "append"
    if not pipeline:
        return {"success": False, "error": "topology pipeline 为空", "steps": [], "final_output": ""}

    llm_fn = llm or _default_llm
    steps_out: list[dict[str, Any]] = []
    current = query
    original = query

    for i, aid in enumerate(pipeline):
        agent = agents.get(aid) or {"id": aid, "name": aid, "system": None, "toolbelt": "office"}
        if pass_mode == "append" and i > 0:
            goal = (
                f"原始任务：{original}\n\n"
                f"上一步（{steps_out[-1].get('agent')}）结果：\n{current}\n\n"
                "请继续完成你的角色职责。"
            )
        else:
            goal = current if i > 0 else query

        tools = resolve_toolbelt(str(agent.get("toolbelt") or "office"))
        system = str(agent.get("system") or "").strip() or DEFAULT_SYSTEM
        out = await run_agent_loop(
            goal=goal,
            tools=tools,
            llm=llm_fn,
            max_turns=max_turns,
            system=system,
        )
        step = {
            "index": i,
            "agent": aid,
            "label": agent.get("name") or aid,
            "input": goal,
            "output": out.get("result") or "",
            "success": bool(out.get("success")),
            "turns": out.get("turns"),
            "error": out.get("error"),
        }
        steps_out.append(step)
        if not out.get("success"):
            return {
                "success": False,
                "error": out.get("error") or f"{aid} 失败",
                "steps": steps_out,
                "final_output": out.get("result") or current,
                "topology": {"pipeline": pipeline, "intent": topology.get("intent")},
            }
        if out.get("result"):
            current = str(out["result"])

    return {
        "success": True,
        "steps": steps_out,
        "final_output": current,
        "topology": {"pipeline": pipeline, "intent": topology.get("intent")},
        "error": None,
    }


def run_topology(
    bundle_dir: str | Path,
    query: str,
    *,
    workspace: str | Path | None = None,
    llm=None,
    max_turns: int = 8,
) -> dict[str, Any]:
    return asyncio.run(
        run_topology_async(
            bundle_dir, query, workspace=workspace, llm=llm, max_turns=max_turns,
        )
    )
