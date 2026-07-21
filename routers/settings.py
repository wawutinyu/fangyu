from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from ..models.database import get_session
from ..models.setting import Setting

router = APIRouter(prefix="/api/v1/settings", tags=["系统设置"])


@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_session)):
    from fangyu.core.auth_gate import redact_mapping
    result = await db.execute(select(Setting))
    rows = result.scalars().all()
    raw = {row.key: row.value for row in rows}
    return {"settings": redact_mapping(raw)}


class SettingsUpdate(BaseModel):
    settings: dict[str, str]


@router.put("/")
async def update_settings(body: SettingsUpdate, db: AsyncSession = Depends(get_session)):
    from fangyu.core.auth_gate import redact_mapping
    for key, value in body.settings.items():
        await db.execute(
            text("INSERT INTO settings (key, value) VALUES (:key, :value) "
                 "ON CONFLICT(key) DO UPDATE SET value = :value"),
            {"key": key, "value": value},
        )
    await db.commit()

    result = await db.execute(select(Setting))
    rows = result.scalars().all()
    raw = {row.key: row.value for row in rows}
    return {"settings": redact_mapping(raw)}
