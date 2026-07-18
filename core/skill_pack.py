"""工厂技能包加载 — SKILL.md frontmatter + 渐进披露。"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

_SKILLS_ROOT = Path(__file__).resolve().parent.parent / "skills" / "factory"

_FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


def skill_pack_path(skill_id: str) -> Path:
    return _SKILLS_ROOT / f"{skill_id}.md"


def _parse_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    """解析简易 YAML frontmatter（key: value 行）；返回 (meta, body)。"""
    text = (raw or "").strip()
    m = _FRONTMATTER.match(text)
    if not m:
        return {}, text
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip().strip("\"'")
    return meta, m.group(2).strip()


def load_skill_pack(skill_id: str) -> str | None:
    """返回完整 markdown（含 frontmatter）。"""
    path = skill_pack_path(skill_id)
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8").strip()


def load_skill_parsed(skill_id: str) -> dict[str, Any] | None:
    raw = load_skill_pack(skill_id)
    if raw is None:
        return None
    meta, body = _parse_frontmatter(raw)
    sid = meta.get("id") or skill_id
    return {
        "id": sid,
        "description": meta.get("description") or "",
        "when": meta.get("when") or meta.get("trigger") or "",
        "body": body,
        "meta": meta,
    }


def list_factory_skill_ids() -> list[str]:
    if not _SKILLS_ROOT.is_dir():
        return []
    return sorted(p.stem for p in _SKILLS_ROOT.glob("*.md"))


def active_skill_catalog(materials: dict | None) -> list[dict[str, str]]:
    """仅摘要（渐进披露第一层）。"""
    if not materials:
        return []
    out: list[dict[str, str]] = []
    for sk in materials.get("skills") or []:
        if str(sk.get("status") or "") != "active":
            continue
        sid = str(sk.get("id") or "").strip()
        if not sid:
            continue
        parsed = load_skill_parsed(sid)
        if not parsed:
            continue
        out.append({
            "id": parsed["id"],
            "description": parsed["description"] or sid,
            "when": parsed["when"],
        })
    return out


def active_skill_texts(materials: dict | None) -> list[tuple[str, str]]:
    """兼容旧接口：全文列表（一般改用 catalog + skill_load）。"""
    if not materials:
        return []
    out: list[tuple[str, str]] = []
    for sk in materials.get("skills") or []:
        if str(sk.get("status") or "") != "active":
            continue
        sid = str(sk.get("id") or "").strip()
        parsed = load_skill_parsed(sid) if sid else None
        if parsed and parsed.get("body"):
            out.append((sid, str(parsed["body"])))
    return out


def append_skills_to_system(system: str, materials: dict | None, *, full: bool = False) -> str:
    """默认只注入技能目录；full=True 时注入全文（不推荐，费 context）。"""
    catalog = active_skill_catalog(materials)
    if not catalog:
        return system
    parts = [
        system.rstrip(),
        "",
        "## 工厂技能目录（渐进披露）",
        "需要某技能的完整步骤时，调用工具 skill_load，args: {\"skill_id\":\"...\"}。",
    ]
    for c in catalog:
        when = f" 触发：{c['when']}" if c.get("when") else ""
        parts.append(f"- **{c['id']}**：{c['description']}{when}")
    if full:
        parts.append("")
        parts.append("## 工厂技能全文")
        for sid, body in active_skill_texts(materials):
            parts.append(f"### skill:{sid}\n{body}")
    return "\n".join(parts)


def tool_skill_load(skill_id: str = "") -> dict[str, Any]:
    """按需加载技能全文（progressive disclosure）。"""
    sid = (skill_id or "").strip()
    if not sid:
        return {"ok": False, "error": "skill_id 为空", "available": list_factory_skill_ids()}
    parsed = load_skill_parsed(sid)
    if not parsed:
        return {
            "ok": False,
            "error": f"未知技能: {sid}",
            "available": list_factory_skill_ids(),
        }
    return {
        "ok": True,
        "skill_id": parsed["id"],
        "description": parsed["description"],
        "when": parsed["when"],
        "body": parsed["body"],
    }
