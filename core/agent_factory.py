"""Agent 工厂 — profile → Bundle（批量产线最小闭环）。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fangyu.core.action_loop import get_action_loop_flow
from fangyu.core.agent_bundle import BundleError, create_agent_bundle
from fangyu.core.harness_flow import (
    CODING_CONSTITUTION,
    WORKBUDDY_CONSTITUTION,
    get_opencode_harness_flow,
    get_workbuddy_harness_flow,
)
from fangyu.engine.bundle_tools import coding_toolbelt, office_toolbelt

PROFILES: dict[str, dict[str, Any]] = {
    "opencode": {
        "description": "OpenCode coding harness（plan + task 子 Agent + 多轮手脚）",
        "default_name": "OpenCode-Harness",
        "agent_kind": "worker",
        "require_envelope": False,
        "constitution": CODING_CONSTITUTION,
        "toolbelt": "coding",
        "skill_id": "default",
    },
    "workbuddy": {
        "description": "办公数字员工（成品落盘 deliverables/ + office toolbelt）",
        "default_name": "WorkBuddy-Office",
        "agent_kind": "worker",
        "require_envelope": False,
        "constitution": WORKBUDDY_CONSTITUTION,
        "toolbelt": "office",
        "skill_id": "default",
    },
    "multi": {
        "description": "多 Agent 编排 Bundle（意图→topology.json，可 bundle orchestrate）",
        "default_name": "Multi-Agent",
        "agent_kind": "hybrid",
        "require_envelope": False,
        "constitution": WORKBUDDY_CONSTITUTION,
        "toolbelt": "office",
        "skill_id": "default",
    },
    "action": {
        "description": "经典 action loop（observe→plan→act→verify）",
        "default_name": "Action-Worker",
        "agent_kind": "worker",
        "require_envelope": False,
        "constitution": None,
        "toolbelt": None,
        "skill_id": "default",
    },
}


def list_profiles() -> list[dict[str, str]]:
    return [
        {"id": pid, "description": str(meta.get("description") or "")}
        for pid, meta in PROFILES.items()
    ]


def build_from_profile(
    profile: str,
    dest: str | Path,
    *,
    name: str | None = None,
    a2a_port: int = 9001,
    require_envelope: bool | None = None,
    max_turns: int | None = None,
    workspace: str | Path | None = None,
    intent: str | None = None,
    template: str | None = None,
) -> Path:
    """按 profile 生成 Bundle 目录。"""
    pid = (profile or "").strip().lower()
    if pid not in PROFILES:
        raise BundleError(f"未知 profile: {profile}；可选: {', '.join(PROFILES)}")
    meta = PROFILES[pid]
    agent_name = (name or meta["default_name"]).strip() or meta["default_name"]
    # opencode 默认更高轮次，留给 plan + 多文件探索
    turns = max_turns if max_turns is not None else (24 if pid == "opencode" else 12)

    if pid == "multi":
        from fangyu.core.topology_export import build_multi_agent_bundle

        return build_multi_agent_bundle(
            dest,
            intent=intent or "",
            name=agent_name if name else None,
            a2a_port=a2a_port,
            max_turns=turns,
            workspace=workspace,
            template=template,
        )

    if pid == "opencode":
        skills = {
            meta["skill_id"]: get_opencode_harness_flow(meta["skill_id"], max_turns=turns),
        }
    elif pid == "workbuddy":
        skills = {
            meta["skill_id"]: get_workbuddy_harness_flow(meta["skill_id"], max_turns=turns),
        }
    else:
        skills = {meta["skill_id"]: get_action_loop_flow(meta["skill_id"], meta["skill_id"])}

    env_flag = meta["require_envelope"] if require_envelope is None else require_envelope
    root = create_agent_bundle(
        dest,
        name=agent_name,
        skills=skills,
        agent_kind=str(meta["agent_kind"]),
        a2a_port=a2a_port,
        require_envelope=bool(env_flag),
        constitution=meta.get("constitution"),
        toolbelt=meta.get("toolbelt"),
        profile=pid,
    )
    if workspace:
        from fangyu.engine.workspace import bind_external_workspace
        bind_external_workspace(root, workspace)
    return root


def toolbelt_manifest(toolbelt: str | None) -> dict[str, Any] | None:
    if toolbelt == "coding":
        tools = sorted(set(coding_toolbelt().keys()) | {"task"})
        return {
            "id": "coding",
            "tools": tools,
            "scope": "bundle/workspace",
            "subagents": ["explore", "general", "review"],
        }
    if toolbelt == "office":
        return {
            "id": "office",
            "tools": sorted(office_toolbelt().keys()),
            "scope": "bundle/workspace/deliverables",
        }
    return None
