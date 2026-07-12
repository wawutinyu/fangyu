"""Intent → Flow — 自然语言目标生成 action-first 画布 Flow（ExportFormat）+ 宪法扫描。

Phase 6 MVP：模板路由为主（可测、无 API Key 也能用）；可选 LLM plan 节点。
"""
from __future__ import annotations

import re
from typing import Any, Literal

from .constitution import apply_flow_governance

TemplateId = Literal["action_loop", "doc_assistant", "simple_io"]

OBSERVE_JS = """const goal = (input && (input.input || input.query || input.message)) || 'demo task'
const files = (input && input.files) || []
return { phase: 'observe', goal, files }"""

PLAN_JS = """const goal = input?.goal || input?.result?.goal || 'task'
const files = input?.files || []
const action = files.includes('result.txt') ? 'verify_only' : 'write_result'
return { phase: 'plan', goal, action, files }"""

ACT_JS = """const action = input?.action || ''
const goal = input?.goal || ''
let files = input?.files || []
if (action === 'write_result') {
  if (!files.includes('result.txt')) files = [...files, 'result.txt']
  return { phase: 'act', acted: true, goal, files }
}
return { phase: 'act', acted: false, goal, files }"""

VERIFY_JS = """const files = input?.files || []
const ok = files.includes('result.txt')
return { phase: 'verify', verified: ok, status: ok ? 'completed' : 'pending', files }"""

PLAN_PARSE_JS = """const raw = typeof input === 'string' ? input : (input?.result || input?.input || JSON.stringify(input||{}))
const text = String(raw)
let action = 'write_result'
let goal = 'task'
if (text.includes('{')) {
  try {
    const chunk = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const j = JSON.parse(chunk)
    action = j.action || action
    goal = j.goal || goal
  } catch (e) {}
}
return { phase: 'plan', goal, action, files: [], mode: 'llm' }"""


def _node(
    nid: str,
    ntype: str,
    name: str,
    *,
    x: float,
    y: float = 220,
    category: str = "流程控制",
    config: dict | None = None,
) -> dict[str, Any]:
    return {
        "id": nid,
        "type": ntype,
        "name": name,
        "category": category,
        "config": config or {},
        "position": {"x": x, "y": y},
    }


def _link(lid: str, src: str, tgt: str) -> dict[str, Any]:
    return {
        "id": lid,
        "sourceNodeId": src,
        "targetNodeId": tgt,
        "linkType": "serial",
        "mappings": {},
    }


def _export(flow_name: str, nodes: list[dict], links: list[dict]) -> dict[str, Any]:
    return {
        "flow_id": "",
        "flow_name": flow_name,
        "nodes": nodes,
        "links": links,
        "global_meta": {"session_id": "", "user_id": ""},
    }


def classify_intent(intent: str) -> TemplateId:
    """根据意图关键词选择模板（确定性，便于单测）。"""
    text = (intent or "").strip().lower()
    if not text:
        return "simple_io"

    doc_keys = (
        "文档", "总结", "摘要", "问答", "知识", "阅读", "说明", "写邮件",
        "document", "summary", "qa", "knowledge", "readme",
    )
    action_keys = (
        "任务", "执行", "完成", "工作", "worker", "巡检", "监控", "写入",
        "验证", "observe", "action", "loop", "干活", "处理文件", "workspace",
    )

    if any(k.lower() in text for k in doc_keys):
        return "doc_assistant"
    if any(k.lower() in text for k in action_keys):
        return "action_loop"
    if len(text) >= 12:
        return "action_loop"
    return "simple_io"


def _short_title(intent: str, max_len: int = 36) -> str:
    cleaned = re.sub(r"\s+", " ", (intent or "").strip())
    if not cleaned:
        return "Intent Flow"
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1] + "…"


def build_simple_io_flow(intent: str) -> dict[str, Any]:
    title = _short_title(intent) or "简单输入输出"
    goal = intent.strip() or "hello"
    nodes = [
        _node("n1", "input", "输入", x=80, config={"default_value": goal}),
        _node("n2", "output", "输出", x=320),
    ]
    return _export(f"意图·{title}", nodes, [_link("e1", "n1", "n2")])


def build_doc_assistant_flow(intent: str, *, model: str = "deepseek-chat") -> dict[str, Any]:
    title = _short_title(intent)
    goal = intent.strip() or "请总结这段内容"
    nodes = [
        _node("n1", "input", "问题", x=60, config={"default_value": goal}),
        _node(
            "llm",
            "llm",
            "回答",
            x=280,
            category="AI 能力",
            config={
                "model": model,
                "temperature": 0.3,
                "max_tokens": 1024,
                "system_prompt": (
                    "你是方隅文档助手。根据用户意图简洁、准确作答；"
                    "不确定时明确说明。最终价值：为人类服务。"
                ),
                "user_template": "{{input}}",
            },
        ),
        _node("o", "output", "输出", x=520),
    ]
    links = [_link("e1", "n1", "llm"), _link("e2", "llm", "o")]
    return _export(f"意图·文档·{title}", nodes, links)


def build_action_loop_flow(
    intent: str,
    *,
    use_llm_plan: bool = False,
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    title = _short_title(intent)
    goal = intent.strip() or "complete task"
    nodes: list[dict[str, Any]] = [
        _node("n1", "input", "任务", x=40, config={"default_value": goal}),
        _node("observe", "code", "observe", x=200, category="代码", config={"code": OBSERVE_JS}),
    ]
    links: list[dict[str, Any]] = [_link("e0", "n1", "observe")]

    if use_llm_plan:
        nodes.append(
            _node(
                "plan_llm",
                "llm",
                "plan",
                x=380,
                category="AI 能力",
                config={
                    "model": model,
                    "temperature": 0.2,
                    "max_tokens": 256,
                    "system_prompt": (
                        "You are an action planner. Reply with ONLY valid JSON. "
                        'Format: {"action":"write_result|verify_only","goal":"<goal>","reason":"<short>"}'
                    ),
                    "user_template": f"User intent: {goal}\nContext: {{{{input}}}}",
                },
            )
        )
        nodes.append(
            _node("plan", "code", "plan_parse", x=560, category="代码", config={"code": PLAN_PARSE_JS})
        )
        links.extend([_link("e1", "observe", "plan_llm"), _link("e2", "plan_llm", "plan")])
        act_x, verify_x, out_x = 740, 920, 1100
    else:
        nodes.append(_node("plan", "code", "plan", x=380, category="代码", config={"code": PLAN_JS}))
        links.append(_link("e1", "observe", "plan"))
        act_x, verify_x, out_x = 560, 740, 920

    nodes.extend([
        _node("act", "code", "act", x=act_x, category="代码", config={"code": ACT_JS}),
        _node("verify", "code", "verify", x=verify_x, category="代码", config={"code": VERIFY_JS}),
        _node("o", "output", "输出", x=out_x),
    ])
    links.extend([
        _link("e3", "plan", "act"),
        _link("e4", "act", "verify"),
        _link("e5", "verify", "o"),
    ])
    return _export(f"意图·行动·{title}", nodes, links)


def build_flow_for_template(
    intent: str,
    template: TemplateId,
    *,
    use_llm_plan: bool = False,
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    if template == "doc_assistant":
        return build_doc_assistant_flow(intent, model=model)
    if template == "action_loop":
        return build_action_loop_flow(intent, use_llm_plan=use_llm_plan, model=model)
    return build_simple_io_flow(intent)


def export_nodes_to_scan_payload(nodes: list[dict]) -> list[dict]:
    """ExportFormat nodes → constitution scan payload。"""
    out: list[dict] = []
    for n in nodes or []:
        if not isinstance(n, dict):
            continue
        out.append({
            "id": n.get("id", ""),
            "data": {
                "originType": n.get("type") or n.get("originType") or "",
                "label": n.get("name") or n.get("label") or "",
                "config": n.get("config") or {},
            },
        })
    return out


def _rationale(template: TemplateId, use_llm_plan: bool) -> str:
    if template == "doc_assistant":
        return "识别为文档/问答类意图 → 生成 input → llm → output"
    if template == "action_loop":
        plan = "LLM plan" if use_llm_plan else "规则 plan"
        return f"识别为行动类意图 → 生成 observe → plan({plan}) → act → verify"
    return "短意图或未匹配关键词 → 生成简单 input → output"


def intent_to_flow(
    intent: str,
    *,
    template: TemplateId | None = None,
    use_llm_plan: bool = False,
    model: str = "deepseek-chat",
    context: str = "intent",
) -> dict[str, Any]:
    """生成 Flow + 宪法扫描结果。"""
    text = (intent or "").strip()
    if not text:
        raise ValueError("intent 不能为空")

    chosen: TemplateId = template or classify_intent(text)
    effective_llm = bool(use_llm_plan and chosen == "action_loop")
    flow = build_flow_for_template(
        text,
        chosen,
        use_llm_plan=effective_llm,
        model=model,
    )
    scan_nodes = export_nodes_to_scan_payload(flow["nodes"])
    gov = apply_flow_governance(scan_nodes, context=context)
    return {
        "intent": text,
        "template": chosen,
        "mode": "template",
        "use_llm_plan": effective_llm,
        "flow": flow,
        "scan": {
            "deny": gov["deny"],
            "warn": gov["warn"],
            "all": gov["all"],
            "blocked": len(gov["deny"]) > 0,
        },
        "rationale": _rationale(chosen, effective_llm),
    }
