"""Agent 工厂 — profile → Bundle（批量产线最小闭环）。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fangyu.core.action_loop import get_action_loop_flow
from fangyu.core.agent_bundle import BundleError, create_agent_bundle
from fangyu.core.harness_flow import CODING_CONSTITUTION, get_opencode_harness_flow
from fangyu.engine.bundle_tools import coding_toolbelt

PROFILES: dict[str, dict[str, Any]] = {
    "opencode": {
        "description": "OpenCode-style coding harness（agent-loop + workspace 手脚）",
        "default_name": "OpenCode-Harness",
        "agent_kind": "worker",
        "require_envelope": False,
        "constitution": CODING_CONSTITUTION,
        "toolbelt": "coding",
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
    max_turns: int = 12,
) -> Path:
    """按 profile 生成 Bundle 目录。"""
    pid = (profile or "").strip().lower()
    if pid not in PROFILES:
        raise BundleError(f"未知 profile: {profile}；可选: {', '.join(PROFILES)}")
    meta = PROFILES[pid]
    agent_name = (name or meta["default_name"]).strip() or meta["default_name"]

    if pid == "opencode":
        skills = {
            meta["skill_id"]: get_opencode_harness_flow(meta["skill_id"], max_turns=max_turns),
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
    return root


def toolbelt_manifest(toolbelt: str | None) -> dict[str, Any] | None:
    if toolbelt == "coding":
        return {
            "id": "coding",
            "tools": sorted(coding_toolbelt().keys()),
            "scope": "bundle/workspace",
        }
    return None
