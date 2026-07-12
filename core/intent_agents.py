"""Intent → Agent 网 — 输出可直接 loadAgents 的画布骨架。"""
from __future__ import annotations

import re
from typing import Any, Literal

TemplateId = Literal["search_analyze_summarize", "worker_pair", "simple_dual"]

_DEFAULT_TRUST = {
    "enabled": True,
    "algorithm": "Ed25519",
    "anchorSource": "auto",
    "policies": [],
    "revocationList": [],
    "auditEnabled": True,
    "auditPath": "./audit.log",
}


def classify_agent_intent(intent: str) -> TemplateId:
    text = (intent or "").strip().lower()
    if not text:
        return "simple_dual"
    if any(k in text for k in ("搜索", "检索", "分析", "汇总", "总结", "search", "analyze", "summary")):
        return "search_analyze_summarize"
    if any(k in text for k in ("工人", "worker", "巡检", "执行", "干活", "产线")):
        return "worker_pair"
    if len(text) >= 16:
        return "search_analyze_summarize"
    return "simple_dual"


def _short(intent: str, n: int = 28) -> str:
    s = re.sub(r"\s+", " ", (intent or "").strip())
    if not s:
        return "Agent 协作"
    return s if len(s) <= n else s[: n - 1] + "…"


def _llm_flow(system_prompt: str) -> dict[str, Any]:
    return {
        "nodes": [
            {"id": "s", "data": {"originType": "start", "config": {}, "label": "开始"}},
            {
                "id": "llm",
                "data": {
                    "originType": "llm",
                    "label": "LLM",
                    "config": {
                        "model": "deepseek-chat",
                        "system_prompt": system_prompt,
                        "auto_inject_memory": False,
                    },
                },
            },
            {"id": "o", "data": {"originType": "output", "config": {}, "label": "输出"}},
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "llm", "data": {}},
            {"id": "e2", "source": "llm", "target": "o", "data": {}},
        ],
    }


def _agent(
    nid: str,
    label: str,
    *,
    x: float,
    y: float,
    skill_id: str,
    skill_name: str,
    desc: str,
    system_prompt: str,
) -> dict[str, Any]:
    return {
        "id": nid,
        "label": label,
        "type": "a2a-agent",
        "position": {"x": x, "y": y},
        "agentCard": {
            "name": label,
            "description": desc,
            "version": "1.0.0",
            "capabilities": {"streaming": False, "pushNotifications": False},
            "skills": [{"id": skill_id, "name": skill_name, "description": desc}],
            "defaultInterface": {"type": "in-memory"},
        },
        "trust": dict(_DEFAULT_TRUST),
        "skillFlows": {skill_id: _llm_flow(system_prompt)},
    }


def build_search_analyze_summarize(intent: str) -> dict[str, Any]:
    title = _short(intent)
    nodes = [
        _agent(
            "agent_search", "搜索 Agent", x=80, y=120,
            skill_id="web_search", skill_name="网络搜索",
            desc=f"检索：{title}",
            system_prompt=f"你是搜索助手。围绕「{title}」列出要点。",
        ),
        _agent(
            "agent_analyze", "分析 Agent", x=80, y=280,
            skill_id="analyze", skill_name="深度分析",
            desc=f"分析：{title}",
            system_prompt=f"你是分析助手。围绕「{title}」做结构化分析。",
        ),
        _agent(
            "agent_summary", "汇总 Agent", x=80, y=440,
            skill_id="summarize", skill_name="汇总输出",
            desc=f"汇总：{title}",
            system_prompt=f"你是汇总助手。把关于「{title}」的结论整理成中文建议。",
        ),
        {
            "id": "router_main",
            "label": "协调路由",
            "type": "a2a-router",
            "position": {"x": 380, "y": 280},
            "agentCard": {
                "name": "协调路由",
                "version": "1.0.0",
                "capabilities": {"streaming": False, "pushNotifications": False},
                "skills": [],
                "defaultInterface": {"type": "in-memory"},
            },
            "trust": dict(_DEFAULT_TRUST),
            "routingRules": [
                {"id": "r1", "sourceSkill": "web_search", "targetAgentId": "agent_search", "priority": 10},
                {"id": "r2", "sourceSkill": "analyze", "targetAgentId": "agent_analyze", "priority": 10},
                {"id": "r3", "sourceSkill": "summarize", "targetAgentId": "agent_summary", "priority": 10},
            ],
            "defaultTarget": "agent_search",
        },
    ]
    edges = [
        {"id": "ae1", "source": "router_main", "target": "agent_search", "label": "search"},
        {"id": "ae2", "source": "router_main", "target": "agent_analyze", "label": "analyze"},
        {"id": "ae3", "source": "router_main", "target": "agent_summary", "label": "summarize"},
    ]
    return {
        "graph_name": f"意图·协作·{title}",
        "nodes": nodes,
        "edges": edges,
        "pipeline": ["agent_search", "agent_analyze", "agent_summary"],
    }


def build_worker_pair(intent: str) -> dict[str, Any]:
    title = _short(intent)
    nodes = [
        _agent(
            "agent_observe", "观察 Worker", x=100, y=140,
            skill_id="observe", skill_name="观察",
            desc=f"观察：{title}",
            system_prompt=f"你是观察 Worker。先观察与「{title}」相关的现状。",
        ),
        _agent(
            "agent_act", "执行 Worker", x=100, y=320,
            skill_id="act", skill_name="执行",
            desc=f"执行：{title}",
            system_prompt=f"你是执行 Worker。根据观察结果推进「{title}」。",
        ),
        {
            "id": "router_main",
            "label": "协调路由",
            "type": "a2a-router",
            "position": {"x": 380, "y": 220},
            "agentCard": {
                "name": "协调路由",
                "version": "1.0.0",
                "capabilities": {"streaming": False, "pushNotifications": False},
                "skills": [],
                "defaultInterface": {"type": "in-memory"},
            },
            "trust": dict(_DEFAULT_TRUST),
            "routingRules": [
                {"id": "r1", "sourceSkill": "observe", "targetAgentId": "agent_observe", "priority": 10},
                {"id": "r2", "sourceSkill": "act", "targetAgentId": "agent_act", "priority": 10},
            ],
            "defaultTarget": "agent_observe",
        },
    ]
    edges = [
        {"id": "ae1", "source": "router_main", "target": "agent_observe", "label": "observe"},
        {"id": "ae2", "source": "router_main", "target": "agent_act", "label": "act"},
        {"id": "ae3", "source": "agent_observe", "target": "agent_act", "label": "handoff"},
    ]
    return {
        "graph_name": f"意图·工人·{title}",
        "nodes": nodes,
        "edges": edges,
        "pipeline": ["agent_observe", "agent_act"],
    }


def build_simple_dual(intent: str) -> dict[str, Any]:
    title = _short(intent) or "协作"
    nodes = [
        _agent(
            "agent_a", "Agent A", x=120, y=180,
            skill_id="default", skill_name="default",
            desc=intent or "主 Agent",
            system_prompt=f"你是 Agent A。目标：{intent or '协助用户'}。",
        ),
        _agent(
            "agent_b", "Agent B", x=360, y=180,
            skill_id="default", skill_name="default",
            desc="协助 Agent",
            system_prompt="你是 Agent B。协助 Agent A 完成任务。",
        ),
    ]
    edges = [{"id": "ae1", "source": "agent_a", "target": "agent_b", "label": "collab"}]
    return {
        "graph_name": f"意图·双Agent·{title}",
        "nodes": nodes,
        "edges": edges,
        "pipeline": ["agent_a", "agent_b"],
    }


def build_agent_graph(intent: str, template: TemplateId) -> dict[str, Any]:
    if template == "search_analyze_summarize":
        return build_search_analyze_summarize(intent)
    if template == "worker_pair":
        return build_worker_pair(intent)
    return build_simple_dual(intent)


def intent_to_agent_graph(
    intent: str,
    *,
    template: TemplateId | None = None,
) -> dict[str, Any]:
    text = (intent or "").strip()
    if not text:
        raise ValueError("intent 不能为空")
    chosen = template or classify_agent_intent(text)
    graph = build_agent_graph(text, chosen)
    return {
        "intent": text,
        "template": chosen,
        "mode": "template",
        "graph": graph,
        "rationale": {
            "search_analyze_summarize": "检索→分析→汇总 三角协作",
            "worker_pair": "观察 Worker + 执行 Worker",
            "simple_dual": "双 Agent 最小协作",
        }.get(chosen, ""),
    }
