"""资产库启动维护 — 清理 demo 流程资产，种子官方 Agent 拓扑。"""



from __future__ import annotations



import json

import secrets

from sqlalchemy import delete, select

from sqlalchemy.ext.asyncio import AsyncSession



from fangyu.models.asset import Asset
from fangyu.core.config import DATA_DIR as _DATA_DIR

ASSETS_DIR = _DATA_DIR / "assets"
OFFICIAL_AGENTS_FILE = ASSETS_DIR / "official_agents.json"





def _gen_id(prefix: str = "ast") -> str:

    return f"{prefix}_{secrets.token_hex(8)}"





async def purge_demo_flow_assets(session: AsyncSession) -> int:

    """删除官方 flow_template（历史从 demo 用例种子导入的条目）。返回删除数量。"""

    result = await session.execute(

        delete(Asset).where(

            Asset.scope == "official",

            Asset.type == "flow_template",

        )

    )

    removed = result.rowcount or 0

    if removed:

        await session.commit()

    return removed





async def seed_official_agent_topologies(session: AsyncSession) -> int:
    """从 official_agents.json 导入种子 Agent。已存在的 id 跳过，缺失的补种。"""
    if not OFFICIAL_AGENTS_FILE.exists():
        return 0

    raw = json.loads(OFFICIAL_AGENTS_FILE.read_text(encoding="utf-8"))
    items = raw if isinstance(raw, list) else raw.get("assets", [])
    if not items:
        return 0

    existing = await session.execute(
        select(Asset.id).where(Asset.scope == "official", Asset.type == "agent_topology")
    )
    existing_ids = set(existing.scalars().all())

    count = 0
    for item in items:
        asset_id = item.get("id") or _gen_id("ast")
        if asset_id in existing_ids:
            continue

        payload = item.get("payload") or {}
        tags = item.get("tags") or []
        if isinstance(tags, str):
            tags = json.loads(tags) if tags.startswith("[") else [tags]

        session.add(Asset(
            id=asset_id,
            type="agent_topology",
            scope="official",
            name=item.get("name") or asset_id,
            description=item.get("description") or "",
            category=item.get("category") or "种子 Agent",
            tags=json.dumps(tags, ensure_ascii=False),
            source_ref=item.get("source_ref") or f"official:{asset_id}",
            payload=json.dumps(payload, ensure_ascii=False),
            version=item.get("version") or "1",
        ))
        count += 1

    if count:
        await session.commit()
    return count




async def maintain_asset_library(session: AsyncSession) -> dict[str, int]:

    """启动时资产库维护：清理 demo 流程 + 种子 Agent。"""

    removed = await purge_demo_flow_assets(session)

    seeded = await seed_official_agent_topologies(session)

    return {"removed_flow_templates": removed, "seeded_agents": seeded}

