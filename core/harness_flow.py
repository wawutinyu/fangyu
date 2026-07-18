"""OpenCode / harness 默认 skill：start → agent-loop → output。"""
from __future__ import annotations

from typing import Any


def get_opencode_harness_flow(
    skill_id: str = "default",
    *,
    max_turns: int = 12,
) -> dict[str, Any]:
    """可导出的 coding harness Flow（多轮 tool-loop + workspace 手脚）。"""
    return {
        "meta": {
            "kind": "harness",
            "name": skill_id,
            "description": "OpenCode-style agentic loop over workspace tools",
            "profile": "opencode",
        },
        "nodes": [
            {
                "id": "start",
                "originType": "start",
                "label": "开始",
                "config": {},
            },
            {
                "id": "loop",
                "originType": "agent-loop",
                "label": "Harness",
                "config": {
                    "max_turns": max_turns,
                    "toolbelt": "coding",
                    "temperature": 0.2,
                },
            },
            {
                "id": "out",
                "originType": "output",
                "label": "输出",
                "config": {},
            },
        ],
        "edges": [
            {"source": "start", "target": "loop", "linkType": "serial", "mappings": {}},
            {"source": "loop", "target": "out", "linkType": "serial", "mappings": {}},
        ],
    }


CODING_CONSTITUTION: dict[str, Any] = {
    "version": "opencode-1.0",
    "name": "fangyu coding harness 宪法",
    "enabled": True,
    "values": [
        "仅在声明工作区内读写",
        "危险系统命令拒绝执行",
        "必须为人类服务",
    ],
    # agent-loop 内工具不走 forbidden_actions 名单；保持空以免误伤
    "forbidden_actions": [],
    "forbidden_node_types": [],
    "require_audit": True,
    "policies": [],
}


OFFICE_SYSTEM = (
    "你是办公数字员工（WorkBuddy 风格）。每轮只输出一个 JSON 对象，不要 Markdown 围栏。\n"
    '调用工具: {"action":"tool","name":"<name>","args":{...}}\n'
    '结束任务: {"action":"done","result":"<给用户的结论>"}\n'
    "优先把成品写入 deliverables/（用 write_deliverable）。\n"
    "可用工具会在用户消息中列出。"
)


def get_workbuddy_harness_flow(
    skill_id: str = "default",
    *,
    max_turns: int = 16,
) -> dict[str, Any]:
    """办公数字员工 harness：任务拆解 → 多轮工具 → 成品落盘。"""
    return {
        "meta": {
            "kind": "harness",
            "name": skill_id,
            "description": "WorkBuddy-style office agent loop with deliverables",
            "profile": "workbuddy",
        },
        "nodes": [
            {
                "id": "start",
                "originType": "start",
                "label": "开始",
                "config": {},
            },
            {
                "id": "loop",
                "originType": "agent-loop",
                "label": "办公员工",
                "config": {
                    "max_turns": max_turns,
                    "toolbelt": "office",
                    "temperature": 0.3,
                    "system": OFFICE_SYSTEM,
                },
            },
            {
                "id": "out",
                "originType": "output",
                "label": "输出",
                "config": {},
            },
        ],
        "edges": [
            {"source": "start", "target": "loop", "linkType": "serial", "mappings": {}},
            {"source": "loop", "target": "out", "linkType": "serial", "mappings": {}},
        ],
    }


WORKBUDDY_CONSTITUTION: dict[str, Any] = {
    "version": "workbuddy-1.0",
    "name": "fangyu 办公数字员工 宪法",
    "enabled": True,
    "values": [
        "仅在声明工作区内读写",
        "成品优先落在 deliverables/",
        "不执行危险系统命令",
        "必须为人类服务",
    ],
    "forbidden_actions": [],
    "forbidden_node_types": [],
    "require_audit": True,
    "policies": [],
}
