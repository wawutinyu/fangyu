"""工厂原料 API — 货架目录 / 草稿 / Bundle materials。"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/materials", tags=["工厂原料"])


def _draft_path() -> Path:
    from fangyu.core import config as cfg
    return Path(cfg.DATA_DIR) / "materials_draft.json"


class SaveDraftBody(BaseModel):
    materials: dict = Field(default_factory=dict)


class SaveBundleBody(BaseModel):
    bundle_dir: str
    materials: dict = Field(default_factory=dict)


class PatchSelectionBody(BaseModel):
    """按勾选更新 coding 带工具 / 技能状态 / mcp 列表。"""
    coding_tools: list[str] | None = None
    active_skills: list[str] | None = None
    mcp_internal_tools: list[str] | None = None
    shell_policy: str | None = None
    default_agent_mode: str | None = None
    target: str = "draft"  # draft | bundle
    bundle_dir: str = ""


@router.get("/catalog")
def materials_catalog():
    """货架只读视图：默认 SKU + 技能摘要 + 可展开 MCP 名。"""
    from fangyu.core.materials import default_materials
    from fangyu.core.skill_pack import active_skill_catalog, list_factory_skill_ids, load_skill_parsed
    from fangyu.engine.bundle_tools import _expand_mcp_tool_names

    mat = default_materials()
    skills_detail = []
    for sid in list_factory_skill_ids():
        parsed = load_skill_parsed(sid)
        if parsed:
            skills_detail.append({
                "id": parsed["id"],
                "description": parsed["description"],
                "when": parsed["when"],
                "has_body": bool(parsed.get("body")),
            })
    return {
        "materials": mat,
        "skill_files": skills_detail,
        "active_skill_catalog": active_skill_catalog(mat),
        "mcp_internal_tools": _expand_mcp_tool_names("__internal__"),
    }


@router.get("/skills/{skill_id}")
def get_skill_detail(skill_id: str):
    """渐进披露第二层：技能全文（对应 skill_load）。"""
    from fangyu.core.skill_pack import list_factory_skill_ids, load_skill_parsed

    parsed = load_skill_parsed(skill_id)
    if not parsed:
        raise HTTPException(404, f"未知技能: {skill_id}")
    return {
        "ok": True,
        "skill_id": parsed["id"],
        "description": parsed["description"],
        "when": parsed["when"],
        "body": parsed["body"],
        "available": list_factory_skill_ids(),
    }


@router.get("/draft")
def get_draft():
    from fangyu.core.materials import default_materials, merge_materials

    path = _draft_path()
    if path.is_file():
        try:
            overlay = json.loads(path.read_text(encoding="utf-8"))
            return {"source": "draft", "materials": merge_materials(default_materials(), overlay)}
        except (json.JSONDecodeError, OSError):
            pass
    return {"source": "default", "materials": default_materials()}


@router.put("/draft")
def put_draft(body: SaveDraftBody):
    from fangyu.core.materials import default_materials, merge_materials

    path = _draft_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    merged = merge_materials(default_materials(), body.materials)
    path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "path": str(path), "materials": merged}


@router.get("/bundle")
def get_bundle_materials(bundle_dir: str):
    from fangyu.core.materials import load_materials

    root = Path(bundle_dir).expanduser()
    if not root.is_dir():
        raise HTTPException(404, f"Bundle 不存在: {bundle_dir}")
    return {"bundle_dir": str(root), "materials": load_materials(root)}


@router.put("/bundle")
def put_bundle_materials(body: SaveBundleBody):
    from fangyu.core.materials import (
        default_materials,
        list_role_ids,
        merge_materials,
        tool_ids_for_belt,
        write_materials,
    )

    root = Path(body.bundle_dir).expanduser()
    if not root.is_dir():
        raise HTTPException(404, f"Bundle 不存在: {body.bundle_dir}")
    merged = merge_materials(default_materials(), body.materials)
    write_materials(root, merged)
    tools = tool_ids_for_belt("coding", merged)
    tb = {
        "id": "coding",
        "tools": tools,
        "scope": "bundle/workspace",
        "materials_version": merged.get("version"),
        "subagents": list_role_ids(merged),
    }
    (root / "config").mkdir(parents=True, exist_ok=True)
    (root / "config" / "toolbelt.json").write_text(
        json.dumps(tb, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    return {"ok": True, "bundle_dir": str(root), "materials": merged}


@router.post("/selection")
def apply_selection(body: PatchSelectionBody):
    """勾选结果写回 draft 或 Bundle。"""
    from fangyu.core.materials import (
        default_materials,
        list_role_ids,
        load_materials,
        merge_materials,
        tool_ids_for_belt,
        write_materials,
    )

    if body.target == "bundle":
        root = Path(body.bundle_dir).expanduser()
        if not root.is_dir():
            raise HTTPException(404, f"Bundle 不存在: {body.bundle_dir}")
        base = load_materials(root)
    else:
        draft = get_draft()
        base = draft["materials"]

    mat = merge_materials(default_materials(), base)

    if body.coding_tools is not None:
        selected = set(body.coding_tools)
        # 始终保留 task 为 runtime
        selected.add("task")
        new_tools = []
        for t in mat.get("tools") or []:
            tid = str(t.get("id") or "")
            belts = list(t.get("belts") or [])
            if "coding" in belts or tid == "task":
                if tid in selected:
                    if "coding" not in belts:
                        belts.append("coding")
                    new_tools.append({**t, "belts": belts})
                else:
                    belts = [b for b in belts if b != "coding"]
                    if belts or tid == "task":
                        new_tools.append({**t, "belts": belts if belts else ["runtime"]})
            else:
                new_tools.append(t)
        # 补全新勾选但默认表里有的
        by_id = {str(t.get("id")): t for t in new_tools}
        for tid in selected:
            if tid not in by_id:
                by_id[tid] = {"id": tid, "source": "builtin", "belts": ["coding"]}
        mat["tools"] = list(by_id.values())

    if body.active_skills is not None:
        active = set(body.active_skills)
        skills = []
        for sk in mat.get("skills") or []:
            sid = str(sk.get("id") or "")
            if sid in active:
                skills.append({**sk, "status": "active"})
            elif sk.get("status") == "active":
                skills.append({**sk, "status": "planned"})
            else:
                skills.append(sk)
        mat["skills"] = skills

    if body.mcp_internal_tools is not None:
        mat["mcp"] = [{"id": "__internal__", "tools": list(body.mcp_internal_tools)}]

    policies = dict(mat.get("policies") or {})
    if body.shell_policy:
        policies["shell"] = body.shell_policy
    if body.default_agent_mode:
        policies["default_agent_mode"] = body.default_agent_mode
    mat["policies"] = policies

    if body.target == "bundle":
        root = Path(body.bundle_dir).expanduser()
        write_materials(root, mat)
        tools = tool_ids_for_belt("coding", mat)
        tb = {
            "id": "coding",
            "tools": tools,
            "scope": "bundle/workspace",
            "materials_version": mat.get("version"),
            "subagents": list_role_ids(mat),
        }
        (root / "config").mkdir(parents=True, exist_ok=True)
        (root / "config" / "toolbelt.json").write_text(
            json.dumps(tb, ensure_ascii=False, indent=2), encoding="utf-8",
        )
        return {"ok": True, "target": "bundle", "materials": mat}

    path = _draft_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(mat, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "target": "draft", "materials": mat}


@router.get("/traces")
def list_traces(bundle_dir: str = "", workspace: str = "", limit: int = 50):
    """读取 harness_trace.jsonl。"""
    from fangyu.engine.harness_trace import (
        read_traces,
        resolve_trace_path,
        summarize_trace_rows,
    )

    path = resolve_trace_path(bundle_dir=bundle_dir or None, workspace=workspace or None)
    if not path or not path.is_file():
        return {
            "path": str(path) if path else None,
            "traces": [],
            "summary": summarize_trace_rows([]),
        }
    rows = read_traces(path, limit=limit)
    return {
        "path": str(path),
        "traces": rows,
        "summary": summarize_trace_rows(rows),
    }
