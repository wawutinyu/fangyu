"""工厂原料注册表 — 工具 / 角色 / 技能 SKU，可进 Bundle 导出。

平台默认 + Bundle `config/materials.json` 合并（Bundle 覆盖同 id）。
"""
from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

# 平台内置原料目录（与 docs/FACTORY_MATERIALS.md 对齐）
DEFAULT_MATERIALS: dict[str, Any] = {
    "version": "1.0",
    "tools": [
        {"id": "read", "source": "builtin", "belts": ["coding", "office", "explore", "review", "scout"]},
        {"id": "write", "source": "builtin", "belts": ["coding", "office", "general"]},
        {"id": "list", "source": "builtin", "belts": ["coding", "office", "explore", "review", "scout"]},
        {"id": "search", "source": "builtin", "belts": ["coding", "explore", "review", "scout"]},
        {"id": "grep", "source": "builtin", "belts": ["coding", "explore", "review", "scout"]},
        {"id": "glob", "source": "builtin", "belts": ["coding", "explore", "review", "scout"]},
        {"id": "apply_patch", "source": "builtin", "belts": ["coding", "general"]},
        {"id": "shell", "source": "builtin", "belts": ["coding", "general"]},
        {"id": "webfetch", "source": "builtin", "belts": ["coding", "scout"]},
        {"id": "websearch", "source": "builtin", "belts": ["coding", "scout"]},
        {"id": "question", "source": "builtin", "belts": ["coding", "general"]},
        {"id": "skill_load", "source": "builtin", "belts": ["coding", "general", "plan"]},
        {"id": "task", "source": "runtime", "belts": ["coding"]},
        {"id": "write_deliverable", "source": "builtin", "belts": ["office"]},
        {"id": "list_deliverables", "source": "builtin", "belts": ["office"]},
    ],
    "roles": [
        {
            "id": "explore",
            "description": "只读探索代码库",
            "tools": ["read", "list", "glob", "grep", "search"],
        },
        {
            "id": "general",
            "description": "通用编码子任务",
            "tools": [
                "read", "write", "list", "glob", "grep", "search",
                "apply_patch", "shell", "question", "skill_load",
            ],
        },
        {
            "id": "review",
            "description": "只读代码审查",
            "tools": ["read", "list", "glob", "grep", "search"],
        },
        {
            "id": "scout",
            "description": "外网调研 + 只读仓内对照",
            "tools": [
                "read", "list", "glob", "grep", "search",
                "webfetch", "websearch",
            ],
        },
        {
            "id": "plan",
            "description": "只读规划主角色（禁写/禁 shell）",
            "mode": "primary",
            "tools": [
                "read", "list", "glob", "grep", "search",
                "webfetch", "websearch", "question", "skill_load",
            ],
        },
    ],
    "skills": [
        {"id": "plan-first", "status": "embedded", "note": "agent-loop require_plan"},
        {"id": "explore-codebase", "status": "role", "role": "explore"},
        {"id": "research-web", "status": "role", "role": "scout"},
        {"id": "code-review", "status": "role", "role": "review"},
        {"id": "implement-and-verify", "status": "active", "path": "skills/factory/implement-and-verify.md"},
    ],
    "mcp": [
        {"id": "__internal__", "tools": ["current_time"]},
    ],
    "policies": {
        "shell": "ask",
        "default_agent_mode": "build",
    },
}


def default_materials() -> dict[str, Any]:
    return deepcopy(DEFAULT_MATERIALS)


def _index_by_id(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for it in items:
        tid = str(it.get("id") or "").strip()
        if tid:
            out[tid] = dict(it)
    return out


def merge_materials(base: dict[str, Any], overlay: dict[str, Any] | None) -> dict[str, Any]:
    """Bundle 覆盖同 id；其余字段以 overlay 为准（version 等）。"""
    if not overlay:
        return deepcopy(base)
    merged = deepcopy(base)
    if overlay.get("version"):
        merged["version"] = overlay["version"]
    for key in ("tools", "roles", "skills"):
        if key not in overlay or not isinstance(overlay[key], list):
            continue
        by_id = _index_by_id(list(merged.get(key) or []))
        for it in overlay[key]:
            tid = str(it.get("id") or "").strip()
            if not tid:
                continue
            if tid in by_id:
                by_id[tid] = {**by_id[tid], **dict(it)}
            else:
                by_id[tid] = dict(it)
        merged[key] = list(by_id.values())
    return merged


def load_materials(bundle_root: str | Path | None = None) -> dict[str, Any]:
    """平台默认 ∪ Bundle config/materials.json。"""
    doc = default_materials()
    if bundle_root:
        path = Path(bundle_root) / "config" / "materials.json"
        if path.is_file():
            try:
                overlay = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(overlay, dict):
                    doc = merge_materials(doc, overlay)
            except (json.JSONDecodeError, OSError):
                pass
    return doc


def write_materials(bundle_root: str | Path, doc: dict[str, Any] | None = None) -> Path:
    root = Path(bundle_root)
    cfg = root / "config"
    cfg.mkdir(parents=True, exist_ok=True)
    path = cfg / "materials.json"
    payload = doc if doc is not None else default_materials()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def tool_ids_for_belt(belt: str, materials: dict[str, Any] | None = None) -> list[str]:
    mat = materials or default_materials()
    b = (belt or "coding").strip().lower()
    ids: list[str] = []
    for t in mat.get("tools") or []:
        belts = t.get("belts") or []
        if b in belts or "*" in belts:
            tid = str(t.get("id") or "")
            if tid and tid not in ids:
                ids.append(tid)
    return ids


def role_tool_ids(role_id: str, materials: dict[str, Any] | None = None) -> list[str]:
    mat = materials or default_materials()
    rid = (role_id or "").strip().lower()
    for r in mat.get("roles") or []:
        if str(r.get("id") or "").lower() == rid:
            return [str(x) for x in (r.get("tools") or [])]
    return []


def list_role_ids(materials: dict[str, Any] | None = None) -> list[str]:
    mat = materials or default_materials()
    return [str(r.get("id")) for r in (mat.get("roles") or []) if r.get("id")]
