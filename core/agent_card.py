"""Agent Card 校验与 well-known 导出（A2A 公民面）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def validate_agent_card(card: dict[str, Any] | None) -> list[str]:
    """返回问题列表；空列表 = 通过。"""
    issues: list[str] = []
    if not isinstance(card, dict):
        return ["agent card 不是对象"]
    if not str(card.get("name") or "").strip():
        issues.append("缺少 name")
    if not str(card.get("version") or "").strip():
        issues.append("缺少 version")
    skills = card.get("skills")
    if not isinstance(skills, list) or not skills:
        issues.append("skills 必须为非空数组")
    else:
        for i, sk in enumerate(skills):
            if not isinstance(sk, dict) or not str(sk.get("id") or "").strip():
                issues.append(f"skills[{i}] 缺少 id")
                break
    ifaces = card.get("interfaces")
    if not isinstance(ifaces, dict):
        issues.append("缺少 interfaces 对象")
    else:
        a2a = ifaces.get("a2a")
        if not isinstance(a2a, dict) or not a2a.get("enabled"):
            issues.append("interfaces.a2a.enabled 应为 true")
        elif not str(a2a.get("url") or "").strip():
            issues.append("interfaces.a2a.url 为空")
    default = card.get("defaultInterface")
    if isinstance(default, dict):
        if str(default.get("type") or "") == "a2a" and not str(default.get("url") or "").strip():
            issues.append("defaultInterface.url 为空")
    return issues


def write_well_known_agent_card(bundle_root: str | Path, card: dict[str, Any]) -> Path:
    """写入 `.well-known/agent-card.json`（A2A 发现约定）。"""
    root = Path(bundle_root)
    well = root / ".well-known"
    well.mkdir(parents=True, exist_ok=True)
    path = well / "agent-card.json"
    path.write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def assert_agent_card(card: dict[str, Any]) -> None:
    issues = validate_agent_card(card)
    if issues:
        from fangyu.core.agent_bundle import BundleError
        raise BundleError("Agent Card 无效: " + "; ".join(issues))
