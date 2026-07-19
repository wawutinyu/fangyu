"""Intent → Flow — 自然语言目标生成 action-first 画布 Flow（ExportFormat）+ 宪法扫描。

Phase 6 MVP：模板路由为主（可测、无 API Key 也能用）；可选 LLM plan 节点。
"""
from __future__ import annotations

import re
from typing import Any, Literal

from .constitution import apply_flow_governance

TemplateId = Literal["action_loop", "doc_assistant", "simple_io", "opencode_harness"]

# 意图生成必须用 Python：底部「预览」聊天与后端沙箱只跑 Python。
# 兼容上游 result 嵌套，以及无 workspace 时的内存 files（序内预览 / 聊天）。
_UNWRAP = """\
src = _input if isinstance(_input, dict) else {'input': _input}
if isinstance(src.get('result'), dict):
    src = {**src, **src['result']}
"""

OBSERVE_PY = _UNWRAP + """\
goal = src.get('input') or src.get('query') or src.get('message') or src.get('goal') or 'demo task'
if not isinstance(goal, str):
    goal = str(goal)
files = list(src.get('files') or [])
result = {'phase': 'observe', 'goal': goal, 'files': files}
"""

PLAN_PY = _UNWRAP + """\
goal = src.get('goal') or 'task'
files = list(src.get('files') or [])
action = 'verify_only' if 'result.txt' in files else 'write_result'
result = {'phase': 'plan', 'goal': goal, 'action': action, 'files': files}
"""

ACT_PY = _UNWRAP + """\
action = src.get('action') or ''
goal = src.get('goal') or ''
files = list(src.get('files') or [])
if action == 'write_result':
    if 'result.txt' not in files:
        files = files + ['result.txt']
    result = {'phase': 'act', 'acted': True, 'goal': goal, 'files': files}
else:
    result = {'phase': 'act', 'acted': False, 'goal': goal, 'files': files}
"""

VERIFY_PY = _UNWRAP + """\
files = list(src.get('files') or [])
ok = 'result.txt' in files
result = {'phase': 'verify', 'verified': ok, 'status': 'completed' if ok else 'pending', 'files': files}
"""

PLAN_PARSE_PY = _UNWRAP + """\
raw = src.get('result') or src.get('input') or ''
text = raw if isinstance(raw, str) else str(raw)
action = 'write_result'
goal = src.get('goal') or 'task'
if '{' in text:
    try:
        chunk = text[text.index('{'): text.rindex('}') + 1]
        j = json.loads(chunk)
        action = j.get('action', action)
        goal = j.get('goal', goal)
    except Exception:
        pass
result = {'phase': 'plan', 'goal': goal, 'action': action, 'files': list(src.get('files') or []), 'mode': 'llm'}
"""


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

    harness_keys = (
        "改代码", "写代码", "编码", "仓库", "repo", "harness", "opencode",
        "refactor", "coding", "patch", "读改跑", "工具环", "agent-loop",
        "多轮工具",
    )
    doc_keys = (
        "文档", "总结", "摘要", "问答", "知识", "阅读", "说明", "写邮件",
        "document", "summary", "qa", "knowledge", "readme",
    )
    action_keys = (
        "任务", "执行", "完成", "工作", "worker", "巡检", "监控", "写入",
        "验证", "observe", "action", "loop", "干活", "处理文件", "workspace",
    )

    if any(k.lower() in text for k in harness_keys):
        return "opencode_harness"
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
        _node("observe", "code", "observe", x=200, category="代码", config={"code": OBSERVE_PY}),
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
            _node("plan", "code", "plan_parse", x=560, category="代码", config={"code": PLAN_PARSE_PY})
        )
        links.extend([_link("e1", "observe", "plan_llm"), _link("e2", "plan_llm", "plan")])
        act_x, verify_x, out_x = 740, 920, 1100
    else:
        nodes.append(_node("plan", "code", "plan", x=380, category="代码", config={"code": PLAN_PY}))
        links.append(_link("e1", "observe", "plan"))
        act_x, verify_x, out_x = 560, 740, 920

    nodes.extend([
        _node("act", "code", "act", x=act_x, category="代码", config={"code": ACT_PY}),
        _node("verify", "code", "verify", x=verify_x, category="代码", config={"code": VERIFY_PY}),
        _node("o", "output", "输出", x=out_x),
    ])
    links.extend([
        _link("e3", "plan", "act"),
        _link("e4", "act", "verify"),
        _link("e5", "verify", "o"),
    ])
    return _export(f"意图·行动·{title}", nodes, links)


# Harness 编排骨架里的 code 节点：无 workspace 时也能预览；有 files 列表可模拟落盘。
HARNESS_ACT_PY = _UNWRAP + """\
goal = src.get('input') or src.get('goal') or src.get('result') or 'task'
if not isinstance(goal, str):
    goal = str(goal)
plan = src.get('result') if isinstance(src.get('result'), str) else str(src.get('result') or '')
files = list(src.get('files') or [])
if 'hello.md' not in files:
    files = files + ['hello.md']
result = {
    'phase': 'act',
    'goal': goal,
    'plan_excerpt': plan[:200],
    'files': files,
    'acted': True,
    'note': '可在此后插入 tool-call / MCP / 更多 code；或改成真实 workspace 写文件',
}
"""

HARNESS_VERIFY_HINT = (
    "你是验收员。根据上游的 plan/act 结果，用简短中文说明：是否达成任务、"
    "还缺哪一步、建议在画布上再加哪个节点（记忆/工具/分支）。"
)


def build_opencode_harness_flow(
    intent: str,
    *,
    max_turns: int = 24,
    model: str = "deepseek-chat",
) -> dict[str, Any]:
    """用节点编排搭出的 Harness 骨架（非单点 agent-loop）。

    任务 → 记忆 → 计划(LLM) → 执行(code) → 记忆 → 验收(LLM) → 输出
    可在画布上继续插入工具/分支/MCP。
    """
    del max_turns  # 编排图轮次由节点与环决定；保留参数兼容调用方
    title = _short_title(intent)
    goal = intent.strip() or "complete the coding task"
    nodes = [
        _node("n1", "input", "任务", x=40, config={"default_value": goal}),
        _node(
            "mem_in",
            "memory",
            "记目标",
            x=220,
            category="记忆存储",
            config={"operation": "write", "memory_key": "harness_goal", "scope": "session"},
        ),
        _node(
            "plan",
            "llm",
            "计划",
            x=420,
            category="AI 能力",
            config={
                "model": model,
                "temperature": 0.2,
                "max_tokens": 1024,
                "system_prompt": (
                    "你是编码 harness 的规划节点。根据任务拆成 2～5 步可执行计划，"
                    "说明要用哪些工具（读/写/搜/shell）。不要假装已改文件。"
                ),
                "prompt": "任务：{{input}}\n请输出分步计划。",
            },
        ),
        _node(
            "act",
            "code",
            "执行",
            x=620,
            category="AI 能力",
            config={"code": HARNESS_ACT_PY},
        ),
        _node(
            "mem_out",
            "memory",
            "记结果",
            x=820,
            category="记忆存储",
            config={"operation": "write", "memory_key": "harness_last_act", "scope": "session"},
        ),
        _node(
            "verify",
            "llm",
            "验收",
            x=1020,
            category="AI 能力",
            config={
                "model": model,
                "temperature": 0.2,
                "max_tokens": 512,
                "system_prompt": HARNESS_VERIFY_HINT,
                "prompt": "上游结果：{{input}}\n请验收并给出下一步画布改造建议。",
            },
        ),
        _node("o", "output", "输出", x=1220),
    ]
    links = [
        _link("e1", "n1", "mem_in"),
        _link("e2", "mem_in", "plan"),
        _link("e3", "plan", "act"),
        _link("e4", "act", "mem_out"),
        _link("e5", "mem_out", "verify"),
        _link("e6", "verify", "o"),
    ]
    return _export(f"意图·编排Harness·{title}", nodes, links)


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
    if template == "opencode_harness":
        return build_opencode_harness_flow(intent, model=model)
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
    if template == "opencode_harness":
        return "识别为编码/Harness 类意图 → 生成节点编排骨架：记忆→计划→执行→记忆→验收"
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
