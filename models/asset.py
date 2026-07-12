"""统一资产目录 — 元数据 + JSON payload，联邦索引 skills/tools/knowledge。"""

from sqlalchemy import Column, String, Text, DateTime, func

from .database import Base

ASSET_TYPES = frozenset({
    "flow_template",
    "subflow",
    "agent_topology",
    "skill_ref",
    "tool_ref",
    "knowledge_ref",
    "constitution_pack",
    "bundle_ref",
})

ASSET_SCOPES = frozenset({"official", "user"})


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(32), primary_key=True)
    type = Column(String(32), nullable=False, index=True)
    scope = Column(String(16), nullable=False, default="user", index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="")
    category = Column(String(64), nullable=False, default="")
    tags = Column(Text, nullable=False, default="[]")
    source_ref = Column(String(255), nullable=False, default="")
    payload = Column(Text, nullable=False, default="{}")
    version = Column(String(32), nullable=False, default="1")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
