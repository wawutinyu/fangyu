"""Physical / industrial adapter plugin interface."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from fangyu.a2a.payload import Payload


class BaseAdapter(ABC):
    """第三方 Adapter 基类 — 实现 ingest/emit/health。"""

    name: str = "base"
    protocol: str = "custom"
    content_types: list[str] = []

    @abstractmethod
    def ingest(self, raw: dict[str, Any]) -> Payload:
        """外部事件 → fangyu Payload。"""

    @abstractmethod
    def emit(self, payload: Payload, target: str = "") -> dict[str, Any]:
        """fangyu Payload → 外部设备/总线。"""

    def health(self) -> dict[str, Any]:
        return {"name": self.name, "protocol": self.protocol, "status": "ok"}

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "protocol": self.protocol,
            "content_types": self.content_types,
            "status": self.health().get("status", "ok"),
        }
