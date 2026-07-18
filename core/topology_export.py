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
    # 过滤 router 等非 pipeline 节点
    pipeline_ids = [str(x) for x in pipeline_ids if str(x).strip()]
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

    canvas_edges = list(graph.get("edges") or [])
    agent_set = set(pipeline_ids)
    edges = [dict(e) for e in canvas_edges]
    # 规范化 agent 间 handoff 等为 depends
    for e in edges:
        if str(e.get("source")) in agent_set and str(e.get("target")) in agent_set:
            if _edge_kind(e) in ("handoff", "sequence", "serial", "default") and not e.get("type"):
                e["type"] = "depends"

    has_agent_depends = any(
        str(e.get("source")) in agent_set
        and str(e.get("target")) in agent_set
        and _edge_kind(e) in ("depends", "dependency", "handoff", "sequence", "serial")
        for e in edges
    )
    # 无 agent 间 depends 时，按 pipeline 相邻补边（串行默认）
    if not has_agent_depends:
        for i in range(len(pipeline_ids) - 1):
            src, tgt = pipeline_ids[i], pipeline_ids[i + 1]
            edges.append({
                "id": f"dep_{i}_{src}_{tgt}",
                "source": src,
                "target": tgt,
                "type": "depends",
                "label": "depends",
            })

    return {
        "version": "1.0",
        "intent": graph_result.get("intent") or "",
        "template": graph_result.get("template") or "",
        "graph_name": graph.get("graph_name") or "",
        "pipeline": pipeline_ids,
        "agents": agents,
        "edges": edges,
        "pass_mode": "append",
        "schedule": "auto",
    }


def _edge_kind(edge: dict[str, Any]) -> str:
    raw = edge.get("type") or edge.get("linkType") or edge.get("label") or ""
    text = str(raw).strip().lower()
    if text in ("depends", "depend", "dependency", "handoff", "sequence", "serial"):
        return text if text != "depend" else "depends"
    if text in ("parallel", "collab", "fanout"):
        return "parallel"
    if not text:
        return "default"
    return text


def collect_depends_edges(topology: dict[str, Any]) -> list[dict[str, Any]]:
    """合并 edges 与 agents[].depends_on。"""
    edges = [dict(e) for e in (topology.get("edges") or []) if isinstance(e, dict)]
    for a in topology.get("agents") or []:
        if not isinstance(a, dict):
            continue
        aid = str(a.get("id") or "").strip()
        if not aid:
            continue
        for dep in a.get("depends_on") or []:
            src = str(dep).strip()
            if src:
                edges.append({
                    "source": src,
                    "target": aid,
                    "type": "depends",
                    "label": "depends",
                })
    return edges


def stages_from_depends_edges(
    edges: list[dict[str, Any]],
    agent_ids: list[str],
) -> list[list[str]] | None:
    """按 depends 边做波次拓扑排序；无可用 depends 时返回 None。

    约定：source 先于 target（target depends on source）。
    同波次 = 当前入度为 0 的节点（可并行）。
    """
    agents = [str(a) for a in agent_ids if str(a).strip()]
    if not agents:
        return []
    agent_set = set(agents)
    preds: dict[str, set[str]] = {a: set() for a in agents}
    succs: dict[str, set[str]] = {a: set() for a in agents}
    depend_count = 0
    for e in edges or []:
        src = str(e.get("source") or "").strip()
        tgt = str(e.get("target") or "").strip()
        if src not in agent_set or tgt not in agent_set or src == tgt:
            continue
        kind = _edge_kind(e)
        if kind == "parallel":
            continue
        if kind in ("depends", "dependency", "handoff", "sequence", "serial", "default"):
            preds[tgt].add(src)
            succs[src].add(tgt)
            depend_count += 1
    if depend_count == 0:
        return None

    indeg = {a: len(preds[a]) for a in agents}
    remaining = set(agents)
    stages: list[list[str]] = []
    while remaining:
        wave = sorted(a for a in remaining if indeg[a] == 0)
        if not wave:
            # 环：放弃边调度
            return None
        stages.append(wave)
        for a in wave:
            remaining.remove(a)
            for b in succs[a]:
                if b in remaining:
                    indeg[b] -= 1
    return stages


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


def normalize_pipeline_stages(topology: dict[str, Any]) -> list[list[str]]:
    """将 stages / depends 边 / pipeline（含 {parallel:[...]}）规范为二维阶段表。

    优先级：
      1. 显式 stages
      2. agent 间 depends 边（或 agents[].depends_on）波次调度（schedule!=pipeline）
      3. pipeline（含 parallel 段）
    """
    raw_stages = topology.get("stages")
    if isinstance(raw_stages, list) and raw_stages:
        out: list[list[str]] = []
        for stage in raw_stages:
            if isinstance(stage, str):
                out.append([stage])
            elif isinstance(stage, list):
                ids = [str(x) for x in stage if str(x).strip()]
                if ids:
                    out.append(ids)
            elif isinstance(stage, dict) and stage.get("parallel"):
                ids = [str(x) for x in (stage.get("parallel") or []) if str(x).strip()]
                if ids:
                    out.append(ids)
        return out

    agent_ids = [
        str(a.get("id"))
        for a in (topology.get("agents") or [])
        if isinstance(a, dict) and a.get("id")
    ]
    if not agent_ids:
        for item in topology.get("pipeline") or []:
            if isinstance(item, str) and item.strip():
                agent_ids.append(item.strip())
            elif isinstance(item, dict) and item.get("parallel"):
                agent_ids.extend(str(x) for x in item["parallel"] if str(x).strip())
            elif isinstance(item, dict) and item.get("id"):
                agent_ids.append(str(item["id"]))
            elif isinstance(item, list):
                agent_ids.extend(str(x) for x in item if str(x).strip())

    schedule = str(topology.get("schedule") or "auto").lower()
    if schedule != "pipeline":
        from_edges = stages_from_depends_edges(
            collect_depends_edges(topology),
            agent_ids,
        )
        if from_edges:
            return from_edges

    pipeline = list(topology.get("pipeline") or [])
    out: list[list[str]] = []
    for item in pipeline:
        if isinstance(item, str) and item.strip():
            out.append([item.strip()])
        elif isinstance(item, dict):
            if item.get("parallel"):
                ids = [str(x) for x in (item.get("parallel") or []) if str(x).strip()]
                if ids:
                    out.append(ids)
            elif item.get("id"):
                out.append([str(item["id"])])
        elif isinstance(item, list):
            ids = [str(x) for x in item if str(x).strip()]
            if ids:
                out.append(ids)
    return out


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
