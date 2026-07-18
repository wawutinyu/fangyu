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
