"""Bundle 内多 Agent 编排运行时 — 读 topology.json（串行 / 并行段）。"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fangyu.core.topology_export import load_topology, normalize_pipeline_stages
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


def _merge_parallel_outputs(steps: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for s in steps:
        label = s.get("label") or s.get("agent") or "?"
        body = str(s.get("output") or "").strip() or f"(空；error={s.get('error')})"
        parts.append(f"### {label}\n{body}")
    return "\n\n".join(parts)


async def run_topology_async(
    bundle_dir: str | Path,
    query: str,
    *,
    workspace: str | Path | None = None,
    llm=None,
    max_turns: int = 8,
) -> dict[str, Any]:
    """按 config/topology.json 跑各角色 agent-loop（共享 workspace）。

    支持串行 pipeline、pipeline 内 `{parallel:[...]}`、以及 `stages`。
    """
    root = Path(bundle_dir)
    from fangyu.core.agent_bundle import activate_bundle_runtime_context

    activate_bundle_runtime_context(root)
    try:
        from fangyu.core.org_acl import activate_bundle_acl
        activate_bundle_acl(root)
    except Exception:
        pass
    if workspace:
        bind_external_workspace(root, workspace)
        init_bundle_workspace(root, workspace_override=str(workspace))
    else:
        init_bundle_workspace(root)

    topology = load_topology(root)
    agents = {a["id"]: a for a in topology.get("agents") or []}
    stages = normalize_pipeline_stages(topology)
    pass_mode = topology.get("pass_mode") or "append"
    if not stages:
        return {"success": False, "error": "topology pipeline/stages 为空", "steps": [], "final_output": ""}

    llm_fn = llm or _default_llm
    steps_out: list[dict[str, Any]] = []
    current = query
    original = query
    step_index = 0
    prev_stage: list[str] = []

    async def _run_one(aid: str, goal: str, index: int) -> dict[str, Any]:
        agent = agents.get(aid) or {"id": aid, "name": aid, "system": None, "toolbelt": "office"}
        tools = resolve_toolbelt(str(agent.get("toolbelt") or "office"))
        system = str(agent.get("system") or "").strip() or DEFAULT_SYSTEM
        out = await run_agent_loop(
            goal=goal,
            tools=tools,
            llm=llm_fn,
            max_turns=max_turns,
            system=system,
            trace_meta={
                "kind": "topology_step",
                "agent": aid,
                "stage_index": index,
            },
        )
        return {
            "index": index,
            "agent": aid,
            "label": agent.get("name") or aid,
            "input": goal,
            "output": out.get("result") or "",
            "success": bool(out.get("success")),
            "turns": out.get("turns"),
            "error": out.get("error"),
            "parallel_group": False,
        }

    for stage_i, stage in enumerate(stages):
        try:
            from fangyu.core.topology_acl import assert_stage_handoff_allowed
            assert_stage_handoff_allowed(prev_stage, list(stage), topology=topology)
        except Exception as exc:
            return {
                "success": False,
                "error": str(exc),
                "steps": steps_out,
                "final_output": current,
                "topology": {
                    "pipeline": topology.get("pipeline"),
                    "stages": stages,
                    "intent": topology.get("intent"),
                },
                "violation": getattr(exc, "to_dict", lambda: {"type": "edge_acl", "message": str(exc)})(),
            }

        if pass_mode == "append" and steps_out:
            goal = (
                f"原始任务：{original}\n\n"
                f"此前步骤汇总：\n{current}\n\n"
                "请继续完成你的角色职责。"
            )
        else:
            goal = current if steps_out else query

        if len(stage) == 1:
            step = await _run_one(stage[0], goal, step_index)
            step_index += 1
            steps_out.append(step)
            if not step.get("success"):
                return {
                    "success": False,
                    "error": step.get("error") or f"{stage[0]} 失败",
                    "steps": steps_out,
                    "final_output": step.get("output") or current,
                    "topology": {
                        "pipeline": topology.get("pipeline"),
                        "stages": stages,
                        "intent": topology.get("intent"),
                    },
                }
            if step.get("output"):
                current = str(step["output"])
            prev_stage = list(stage)
            continue

        # 并行段：共享同一 goal
        parallel_steps = await asyncio.gather(*[
            _run_one(aid, goal, step_index + j) for j, aid in enumerate(stage)
        ])
        step_index += len(stage)
        for ps in parallel_steps:
            ps["parallel_group"] = True
            steps_out.append(ps)

        if not all(ps.get("success") for ps in parallel_steps):
            failed = next(ps for ps in parallel_steps if not ps.get("success"))
            return {
                "success": False,
                "error": failed.get("error") or f"并行段失败: {stage}",
                "steps": steps_out,
                "final_output": _merge_parallel_outputs(list(parallel_steps)),
                "topology": {
                    "pipeline": topology.get("pipeline"),
                    "stages": stages,
                    "intent": topology.get("intent"),
                },
            }
        current = _merge_parallel_outputs(list(parallel_steps))
        prev_stage = list(stage)

    return {
        "success": True,
        "steps": steps_out,
        "final_output": current,
        "topology": {
            "pipeline": topology.get("pipeline"),
            "stages": stages,
            "intent": topology.get("intent"),
        },
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
