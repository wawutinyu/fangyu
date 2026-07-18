"""多 Agent 拓扑导出 — 画布/意图网 → Bundle 内可离线编排的 topology。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fangyu.core.agent_bundle import BundleError, create_agent_bundle
from fangyu.core.harness_flow import OFFICE_SYSTEM, get_workbuddy_harness_flow
from fangyu.core.intent_agents import intent_to_agent_graph


def graph_to_topology(graph_result: dict[str, Any]) -> dict[str, Any]:
    """intent_to_agent_graph 结果 → 可序列化 topology.json。"""
    graph = graph_result.get("graph") or {}
    nodes = graph.get("nodes") or []
    pipeline_ids = list(graph.get("pipeline") or [n.get("id") for n in nodes if n.get("id")])
    agents: list[dict[str, Any]] = []
    by_id = {n.get("id"): n for n in nodes if n.get("id")}
    for aid in pipeline_ids:
        n = by_id.get(aid) or {}
        card = n.get("agentCard") or {}
        skills = card.get("skills") or []
        skill_id = (skills[0].get("id") if skills else None) or "default"
        flows = n.get("skillFlows") or {}
        system = OFFICE_SYSTEM
        flow = flows.get(skill_id) or {}
        for node in flow.get("nodes") or []:
            data = node.get("data") or node
            cfg = data.get("config") or {}
            if cfg.get("system_prompt"):
                system = (
                    f"{OFFICE_SYSTEM}\n\n角色说明：{cfg['system_prompt']}"
                )
                break
        agents.append({
            "id": aid,
            "name": n.get("label") or card.get("name") or aid,
            "skill_id": skill_id,
            "system": system,
            "toolbelt": "office",
        })
    return {
        "version": "1.0",
        "intent": graph_result.get("intent") or "",
        "template": graph_result.get("template") or "",
        "graph_name": graph.get("graph_name") or "",
        "pipeline": pipeline_ids,
        "agents": agents,
        "edges": graph.get("edges") or [],
        "pass_mode": "append",
    }


def write_topology(bundle_root: Path, topology: dict[str, Any]) -> Path:
    cfg = bundle_root / "config"
    cfg.mkdir(parents=True, exist_ok=True)
    path = cfg / "topology.json"
    path.write_text(json.dumps(topology, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_topology(bundle_root: str | Path) -> dict[str, Any]:
    path = Path(bundle_root) / "config" / "topology.json"
    if not path.is_file():
        raise BundleError(f"无 topology.json: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def build_multi_agent_bundle(
    dest: str | Path,
    *,
    intent: str,
    name: str | None = None,
    a2a_port: int = 9001,
    max_turns: int = 10,
    workspace: str | Path | None = None,
    template: str | None = None,
) -> Path:
    """意图 → 多 Agent 拓扑 Bundle（导出态可 orchestrate）。"""
    text = (intent or "").strip()
    if not text:
        raise BundleError("multi profile 需要 --intent")
    result = intent_to_agent_graph(text, template=template)  # type: ignore[arg-type]
    topology = graph_to_topology(result)
    agent_name = (name or f"Multi·{_short(text)}").strip()
    skills = {
        "default": get_workbuddy_harness_flow("default", max_turns=max_turns),
    }
    # conductor 用办公宪法；拓扑里各角色有独立 system
    from fangyu.core.harness_flow import WORKBUDDY_CONSTITUTION

    root = create_agent_bundle(
        dest,
        name=agent_name,
        skills=skills,
        agent_kind="hybrid",
        a2a_port=a2a_port,
        require_envelope=False,
        constitution=WORKBUDDY_CONSTITUTION,
        toolbelt="office",
        profile="multi",
        worker_only=False,
    )
    write_topology(root, topology)
    # 更新 manifest 能力位
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    caps = manifest.setdefault("capabilities", {})
    caps["multi_agent"] = True
    caps["topology"] = True
    manifest["topology_agents"] = [a["id"] for a in topology["agents"]]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    if workspace:
        from fangyu.engine.workspace import bind_external_workspace
        bind_external_workspace(root, workspace)
    return root


def _short(s: str, n: int = 20) -> str:
    s = s.strip().replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"
