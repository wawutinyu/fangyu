"""资产 API — CRUD + payload + 联邦索引（skill/tool/knowledge）。"""

from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_session
from ..models.asset import Asset, ASSET_TYPES, ASSET_SCOPES

router = APIRouter(prefix="/api/v1/assets", tags=["资产库"])


class CreateAssetBody(BaseModel):
    id: str = ""
    type: str = "flow_template"
    scope: str = "user"
    name: str
    description: str = ""
    category: str = ""
    tags: list[str] = Field(default_factory=list)
    source_ref: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    version: str = "1"


class UpdateAssetBody(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    payload: dict[str, Any] | None = None
    version: str | None = None


class PromoteSaveBody(BaseModel):
    save_id: str = ""
    project_id: str = ""
    name: str = ""
    description: str = ""
    category: str = "流程控制"
    tags: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


def _gen_id(prefix: str = "ast") -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _asset_row(a: Asset) -> dict[str, Any]:
    try:
        tags = json.loads(a.tags or "[]")
    except json.JSONDecodeError:
        tags = []
    return {
        "id": a.id,
        "type": a.type,
        "scope": a.scope,
        "name": a.name,
        "description": a.description,
        "category": a.category,
        "tags": tags,
        "source_ref": a.source_ref,
        "version": a.version,
        "has_payload": bool(a.payload and a.payload not in ("", "{}")),
        "created_at": str(a.created_at) if a.created_at else "",
        "updated_at": str(a.updated_at) if a.updated_at else "",
    }


async def _federated_assets(types: set[str] | None = None) -> list[dict[str, Any]]:
    """只读联邦条目 — 不写入 DB。"""
    out: list[dict[str, Any]] = []
    want = types or set()

    if not types or "skill_ref" in want:
        from fangyu.engine.skill import list_skills
        for s in list_skills():
            name = s.get("name") or s.get("id") or ""
            if not name:
                continue
            out.append({
                "id": f"fed_skill_{name}",
                "type": "skill_ref",
                "scope": "official",
                "name": name,
                "description": s.get("description") or "",
                "category": "技能",
                "tags": s.get("tags") or [],
                "source_ref": f"skill:{name}",
                "version": "1",
                "has_payload": True,
                "federated": True,
                "created_at": "",
                "updated_at": "",
            })

    if not types or "tool_ref" in want:
        from fangyu.engine.tool_registry import list_tools
        for t in list_tools():
            name = t.get("name") or ""
            if not name:
                continue
            out.append({
                "id": f"fed_tool_{name}",
                "type": "tool_ref",
                "scope": "official",
                "name": name,
                "description": t.get("description") or "",
                "category": "工具集成",
                "tags": [],
                "source_ref": f"tool:{name}",
                "version": "1",
                "has_payload": True,
                "federated": True,
                "created_at": "",
                "updated_at": "",
            })

    if not types or "knowledge_ref" in want:
        from ..models.database import async_session
        from ..models.knowledge import KnowledgeDoc
        async with async_session() as session:
            result = await session.execute(select(KnowledgeDoc).order_by(KnowledgeDoc.created_at.desc()))
            docs = result.scalars().all()
        for d in docs:
            out.append({
                "id": f"fed_kdoc_{d.id}",
                "type": "knowledge_ref",
                "scope": "user",
                "name": d.name,
                "description": f"{d.chunk_count or 0} chunks",
                "category": "知识库",
                "tags": [],
                "source_ref": f"knowledge:{d.id}",
                "version": "1",
                "has_payload": True,
                "federated": True,
                "created_at": str(d.created_at) if d.created_at else "",
                "updated_at": "",
            })

    return out


async def _resolve_payload(asset: Asset | None, meta: dict[str, Any]) -> dict[str, Any]:
    if asset and asset.payload and asset.payload not in ("", "{}"):
        try:
            return json.loads(asset.payload)
        except json.JSONDecodeError:
            return {}

    ref = (asset.source_ref if asset else meta.get("source_ref")) or ""
    if ref.startswith("skill:"):
        from fangyu.engine.skill import get_skill_content
        name = ref.split(":", 1)[1]
        content = get_skill_content(name)
        return {"skill_name": name, "content": content or ""}

    if ref.startswith("tool:"):
        from fangyu.engine.tool_registry import list_tools
        name = ref.split(":", 1)[1]
        for t in list_tools():
            if t.get("name") == name:
                return {"tool": t}
        return {"tool_name": name}

    if ref.startswith("knowledge:"):
        return {"doc_id": ref.split(":", 1)[1]}

    if ref.startswith("save:"):
        from ..models.project import Save
        save_id = ref.split(":", 1)[1]
        from ..models.database import async_session
        async with async_session() as session:
            result = await session.execute(select(Save).where(Save.id == save_id))
            save = result.scalar_one_or_none()
            if save and save.flow_data:
                try:
                    return json.loads(save.flow_data)
                except json.JSONDecodeError:
                    return {}
        return {}

    return {}


@router.get("/types")
async def list_asset_types():
    return {
        "types": sorted(ASSET_TYPES),
        "scopes": sorted(ASSET_SCOPES),
    }


@router.get("/")
async def list_assets(
    type: str | None = Query(None),
    scope: str | None = Query(None),
    category: str | None = Query(None),
    q: str | None = Query(None),
    include_federated: bool = Query(True),
    db: AsyncSession = Depends(get_session),
):
    stmt = select(Asset).order_by(Asset.scope.asc(), Asset.updated_at.desc())
    if type:
        stmt = stmt.where(Asset.type == type)
    if scope:
        stmt = stmt.where(Asset.scope == scope)
    if category:
        stmt = stmt.where(Asset.category == category)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Asset.name.like(like), Asset.description.like(like)))

    result = await db.execute(stmt)
    rows = [_asset_row(a) for a in result.scalars().all()]

    if include_federated:
        fed_types = {type} if type else None
        if not type or type in ("skill_ref", "tool_ref", "knowledge_ref"):
            fed = await _federated_assets(fed_types)
            if scope:
                fed = [x for x in fed if x["scope"] == scope]
            if category:
                fed = [x for x in fed if x.get("category") == category]
            if q:
                ql = q.lower()
                fed = [x for x in fed if ql in x["name"].lower() or ql in (x.get("description") or "").lower()]
            rows.extend(fed)

    return {"assets": rows, "count": len(rows)}


@router.get("/{asset_id}")
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_session)):
    if asset_id.startswith("fed_"):
        assets = await list_assets(include_federated=True, db=db)
        for a in assets["assets"]:
            if a["id"] == asset_id:
                return a
        raise HTTPException(404, "资产不存在")

    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "资产不存在")
    return _asset_row(asset)


@router.get("/{asset_id}/payload")
async def get_asset_payload(asset_id: str, db: AsyncSession = Depends(get_session)):
    if asset_id.startswith("fed_"):
        assets_resp = await list_assets(include_federated=True, db=db)
        meta = next((a for a in assets_resp["assets"] if a["id"] == asset_id), None)
        if not meta:
            raise HTTPException(404, "资产不存在")
        payload = await _resolve_payload(None, meta)
        return {"id": asset_id, "type": meta["type"], "payload": payload}

    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "资产不存在")

    payload = await _resolve_payload(asset, _asset_row(asset))
    return {"id": asset.id, "type": asset.type, "payload": payload}


@router.get("/{asset_id}/skill-flow")
async def get_asset_skill_flow(asset_id: str, db: AsyncSession = Depends(get_session)):
    """将 flow_template / subflow 转为 Agent skillFlows 格式。"""
    resp = await get_asset_payload(asset_id, db)
    payload = resp.get("payload") or {}
    if resp["type"] not in ("flow_template", "subflow") and "nodes" not in payload:
        raise HTTPException(400, "该资产不是可绑定的流程模板")

    nodes_raw = payload.get("nodes") or []
    links_raw = payload.get("links") or payload.get("edges") or []

    nodes = []
    for n in nodes_raw:
        if isinstance(n, dict) and "data" in n:
            nodes.append(n)
            continue
        nodes.append({
            "id": n.get("id"),
            "data": {
                "originType": n.get("type") or n.get("originType"),
                "label": n.get("name") or n.get("label") or "",
                "config": n.get("config") or {},
                "inner_nodes": n.get("inner_nodes") or [],
                "inner_links": n.get("inner_links") or [],
                "mappings": n.get("mappings") or {},
            },
        })

    edges = []
    for l in links_raw:
        if isinstance(l, dict) and "source" in l:
            edges.append(l)
            continue
        edges.append({
            "id": l.get("id"),
            "source": l.get("sourceNodeId") or l.get("source"),
            "target": l.get("targetNodeId") or l.get("target"),
            "sourceHandle": l.get("sourceHandle"),
            "targetHandle": l.get("targetHandle"),
            "data": {
                "linkType": l.get("linkType") or "serial",
                "mappings": l.get("mappings") or {},
            },
        })

    return {"nodes": nodes, "edges": edges}


@router.post("/")
async def create_asset(body: CreateAssetBody, db: AsyncSession = Depends(get_session)):
    if body.type not in ASSET_TYPES:
        raise HTTPException(400, f"不支持的资产类型: {body.type}")
    if body.scope not in ASSET_SCOPES:
        raise HTTPException(400, f"不支持的 scope: {body.scope}")

    asset_id = body.id or _gen_id()
    asset = Asset(
        id=asset_id,
        type=body.type,
        scope=body.scope,
        name=body.name,
        description=body.description,
        category=body.category,
        tags=json.dumps(body.tags, ensure_ascii=False),
        source_ref=body.source_ref or f"asset:{asset_id}",
        payload=json.dumps(body.payload, ensure_ascii=False),
        version=body.version,
    )
    db.add(asset)
    await db.commit()
    return _asset_row(asset)


@router.post("/from-save")
async def promote_save_to_asset(body: PromoteSaveBody, db: AsyncSession = Depends(get_session)):
    payload = body.payload
    if not payload and body.save_id:
        from ..models.project import Save
        result = await db.execute(select(Save).where(Save.id == body.save_id))
        save = result.scalar_one_or_none()
        if not save:
            raise HTTPException(404, "保存记录不存在")
        try:
            payload = json.loads(save.flow_data)
        except json.JSONDecodeError:
            payload = {}
        name = body.name or save.name
    else:
        name = body.name or "未命名流程"

    if not payload:
        raise HTTPException(400, "流程 payload 为空")

    asset_id = _gen_id()
    asset = Asset(
        id=asset_id,
        type="flow_template",
        scope="user",
        name=name,
        description=body.description,
        category=body.category,
        tags=json.dumps(body.tags, ensure_ascii=False),
        source_ref=f"save:{body.save_id}" if body.save_id else f"asset:{asset_id}",
        payload=json.dumps(payload, ensure_ascii=False),
        version="1",
    )
    db.add(asset)
    await db.commit()
    return _asset_row(asset)


@router.put("/{asset_id}")
async def update_asset(asset_id: str, body: UpdateAssetBody, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "资产不存在")
    if asset.scope == "official":
        raise HTTPException(403, "官方资产不可修改")

    if body.name is not None:
        asset.name = body.name
    if body.description is not None:
        asset.description = body.description
    if body.category is not None:
        asset.category = body.category
    if body.tags is not None:
        asset.tags = json.dumps(body.tags, ensure_ascii=False)
    if body.payload is not None:
        asset.payload = json.dumps(body.payload, ensure_ascii=False)
    if body.version is not None:
        asset.version = body.version

    await db.commit()
    return _asset_row(asset)


@router.delete("/{asset_id}")
async def delete_asset(asset_id: str, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "资产不存在")
    if asset.scope == "official":
        raise HTTPException(403, "官方资产不可删除")

    await db.execute(delete(Asset).where(Asset.id == asset_id))
    await db.commit()
    return {"success": True}
