"""场景模板库 — 一键实例化 Flow + Agent 网 + Bundle + 策略包（Phase 6）。

复用 intent_flow / intent_agents / agent_bundle，不另起平行模板系统。
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

from fangyu.core.agent_bundle import add_mqtt_trigger, create_agent_bundle
from fangyu.core.constitution import load_constitution, save_constitution
from fangyu.core.intent_agents import intent_to_agent_graph
from fangyu.core.intent_flow import intent_to_flow

# 与前端 constitutionTemplates.ts 对齐的策略片段（按 id 引用）
_POLICY_BY_ID: dict[str, dict[str, Any]] = {
    "tpl-llm-model": {
        "id": "warn-missing-llm-model",
        "enabled": True,
        "description": "LLM 节点应配置 model",
        "when": {"node_type": "llm"},
        "assert": {"field": "config.model", "op": "nonempty"},
        "on_fail": {
            "rule": "policy_llm_model",
            "action": "warn",
            "message": "LLM 节点未配置 model: {label}",
        },
    },
    "tpl-ssrf": {
        "id": "deny-localhost-http",
        "enabled": True,
        "description": "禁止 HTTP 访问 localhost",
        "when": {"node_type": "http"},
        "assert": {"field": "config.url", "op": "not_contains", "value": "localhost"},
        "on_fail": {
            "rule": "policy_ssrf",
            "action": "deny",
            "message": "禁止访问 localhost: {label}",
        },
    },
    "tpl-loop-limit": {
        "id": "deny-loop-overflow",
        "enabled": True,
        "description": "循环次数不得超过 100",
        "when": {"node_type": "loop"},
        "assert": {"field": "config.max_iterations", "op": "lte", "value": 100},
        "on_fail": {
            "rule": "policy_loop_limit",
            "action": "deny",
            "message": "循环次数超限: {label}",
        },
    },
    "tpl-tool-name": {
        "id": "deny-empty-tool-name",
        "enabled": True,
        "description": "tool-call 必须指定 tool_name",
        "when": {"node_type": "tool-call"},
        "assert": {"field": "config.tool_name", "op": "nonempty"},
        "on_fail": {
            "rule": "policy_tool_name",
            "action": "deny",
            "message": "tool-call 未配置 tool_name: {label}",
        },
    },
}

SCENARIOS: dict[str, dict[str, Any]] = {
    "line_inspection": {
        "id": "line_inspection",
        "title": "产线巡检",
        "summary": "观察·执行双 Agent + 行动闭环 skill，MQTT 告警触发，带 SSRF/工具名策略。",
        "intent_flow": "产线巡检：观察异常并执行处置闭环",
        "flow_template": "action_loop",
        "intent_agents": "产线工人巡检与执行协作",
        "agent_template": "worker_pair",
        "policy_ids": ["tpl-ssrf", "tpl-tool-name", "tpl-loop-limit"],
        "bundle_name": "line-inspection-worker",
        "agent_kind": "worker",
        "mqtt_topic": "fangyu/line/+/alert",
    },
    "doc_assistant": {
        "id": "doc_assistant",
        "title": "文档助手",
        "summary": "文档问答 Flow + 双 Agent 协作，Interface 型 Bundle，强制 LLM model 策略。",
        "intent_flow": "文档助手：阅读并总结说明文档",
        "flow_template": "doc_assistant",
        "intent_agents": "文档检索与总结协作",
        "agent_template": "search_analyze_summarize",
        "policy_ids": ["tpl-llm-model"],
        "bundle_name": "doc-assistant",
        "agent_kind": "interface",
        "mqtt_topic": None,
    },
    "full_experience": {
        "id": "full_experience",
        "title": "体验全部功能",
        "summary": (
            "序：文档问答 LLM Flow（可直接聊天）+ 三角 Agent 协作；"
            "律：LLM/SSRF/循环/工具 全套策略；"
            "行：Worker Bundle + MQTT 演示主题；"
            "观：派发或 A2A 后看协作边与时间线。"
        ),
        "intent_flow": "用中文友好地回答用户问题，并简要介绍方隅能做什么",
        "flow_template": "doc_assistant",
        "use_llm_plan": False,
        "intent_agents": "检索、分析、汇总三角协作",
        "agent_template": "search_analyze_summarize",
        "policy_ids": ["tpl-llm-model", "tpl-ssrf", "tpl-loop-limit", "tpl-tool-name"],
        "bundle_name": "full-experience-demo",
        "agent_kind": "worker",
        "mqtt_topic": "fangyu/demo/+/trigger",
        "featured": True,
    },
}


def list_scenarios() -> list[dict[str, Any]]:
    items = [
        {
            "id": s["id"],
            "title": s["title"],
            "summary": s["summary"],
            "policy_ids": list(s["policy_ids"]),
            "flow_template": s["flow_template"],
            "agent_template": s["agent_template"],
            "agent_kind": s["agent_kind"],
            "featured": bool(s.get("featured")),
        }
        for s in SCENARIOS.values()
    ]
    # 推荐体验包置顶
    items.sort(key=lambda x: (0 if x.get("featured") else 1, x["id"]))
    return items


def _scenario_root() -> Path:
    raw = os.environ.get("FANGYU_SCENARIO_DIR")
    if raw:
        root = Path(raw)
    else:
        root = Path(__file__).resolve().parents[1] / "data" / "scenarios"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _merge_policies(policy_ids: list[str]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for pid in policy_ids:
        pol = _POLICY_BY_ID.get(pid)
        if pol:
            merged.append(dict(pol))
    return merged


def _apply_policies_to_constitution(policy_ids: list[str]) -> list[str]:
    """把场景策略并入本机宪法（按 policy.id 去重）。返回新写入的 policy id。"""
    policies = _merge_policies(policy_ids)
    if not policies:
        return []
    current = load_constitution()
    existing = list(current.get("policies") or [])
    existing_ids = {p.get("id") for p in existing if isinstance(p, dict)}
    added: list[str] = []
    for pol in policies:
        if pol["id"] in existing_ids:
            continue
        existing.append(pol)
        existing_ids.add(pol["id"])
        added.append(pol["id"])
    if added:
        save_constitution({**current, "policies": existing})
    return added


def instantiate_scenario(
    scenario_id: str,
    *,
    apply_policies: bool = True,
    create_bundle: bool = True,
) -> dict[str, Any]:
    spec = SCENARIOS.get(scenario_id)
    if not spec:
        raise ValueError(f"未知场景: {scenario_id}")

    flow_result = intent_to_flow(
        str(spec["intent_flow"]),
        template=spec["flow_template"],  # type: ignore[arg-type]
        use_llm_plan=bool(spec.get("use_llm_plan")),
        model="deepseek-chat",
    )
    agents_result = intent_to_agent_graph(
        str(spec["intent_agents"]),
        template=spec["agent_template"],  # type: ignore[arg-type]
    )

    policies = _merge_policies(list(spec["policy_ids"]))
    applied_policy_ids: list[str] = []
    if apply_policies:
        applied_policy_ids = _apply_policies_to_constitution(list(spec["policy_ids"]))

    bundle_info: dict[str, Any] | None = None
    if create_bundle:
        dest = _scenario_root() / f"{scenario_id}-{uuid.uuid4().hex[:8]}"
        # ExportFormat flow → Bundle skill（normalize_flow 可吃 links）
        skill_flow = dict(flow_result["flow"])
        skill_flow["meta"] = {
            "name": spec["title"],
            "description": spec["summary"],
            "kind": "action",
        }
        root = create_agent_bundle(
            dest,
            name=str(spec["bundle_name"]),
            skills={"default": skill_flow},
            agent_kind=str(spec["agent_kind"]),
            worker_only=spec["agent_kind"] == "worker",
            mqtt_triggers=None,
        )
        topic = spec.get("mqtt_topic")
        if topic:
            add_mqtt_trigger(root, str(topic), skill_id="default", use_sim=True)
        manifest_path = root / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
        bundle_info = {
            "path": str(root.resolve()),
            "name": spec["bundle_name"],
            "agent_id": manifest.get("agent_id"),
            "agent_kind": spec["agent_kind"],
            "mqtt_topic": topic,
        }

    return {
        "scenario": {
            "id": spec["id"],
            "title": spec["title"],
            "summary": spec["summary"],
        },
        "flow": flow_result,
        "agents": agents_result,
        "policy_ids": list(spec["policy_ids"]),
        "policies": policies,
        "policies_applied": applied_policy_ids,
        "bundle": bundle_info,
    }
