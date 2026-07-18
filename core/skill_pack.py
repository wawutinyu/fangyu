"""工厂技能包加载 — skills/factory/*.md → 可注入 system。"""
from __future__ import annotations

from pathlib import Path

_SKILLS_ROOT = Path(__file__).resolve().parent.parent / "skills" / "factory"


def skill_pack_path(skill_id: str) -> Path:
    return _SKILLS_ROOT / f"{skill_id}.md"


def load_skill_pack(skill_id: str) -> str | None:
    path = skill_pack_path(skill_id)
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8").strip()


def active_skill_texts(materials: dict | None) -> list[tuple[str, str]]:
    """返回 (id, markdown) 列表，仅 status=active 且有文件的技能。"""
    if not materials:
        return []
    out: list[tuple[str, str]] = []
    for sk in materials.get("skills") or []:
        if str(sk.get("status") or "") != "active":
            continue
        sid = str(sk.get("id") or "").strip()
        if not sid:
            continue
        text = load_skill_pack(sid)
        if text:
            out.append((sid, text))
    return out


def append_skills_to_system(system: str, materials: dict | None) -> str:
    packs = active_skill_texts(materials)
    if not packs:
        return system
    parts = [system.rstrip(), "", "## 工厂技能包（必须遵守）"]
    for sid, text in packs:
        parts.append(f"### skill:{sid}\n{text}")
    return "\n".join(parts)
