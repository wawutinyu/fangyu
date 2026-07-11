"""AdapterRegistry — 注册与路由物理层 Adapter。"""
from __future__ import annotations

from typing import Any

from fangyu.a2a.payload import Payload
from fangyu.adapters.base import BaseAdapter


class AdapterRegistry:
    _adapters: dict[str, BaseAdapter] = {}

    @classmethod
    def register(cls, adapter: BaseAdapter) -> None:
        cls._adapters[adapter.name] = adapter

    @classmethod
    def unregister(cls, name: str) -> None:
        cls._adapters.pop(name, None)

    @classmethod
    def get(cls, name: str) -> BaseAdapter | None:
        return cls._adapters.get(name)

    @classmethod
    def list(cls) -> list[dict[str, Any]]:
        return [a.to_dict() for a in cls._adapters.values()]

    @classmethod
    def ingest(cls, name: str, raw: dict[str, Any]) -> Payload:
        adapter = cls.get(name)
        if not adapter:
            raise KeyError(f"Adapter not found: {name}")
        return adapter.ingest(raw)

    @classmethod
    def emit(cls, name: str, payload: Payload, target: str = "") -> dict[str, Any]:
        adapter = cls.get(name)
        if not adapter:
            raise KeyError(f"Adapter not found: {name}")
        return adapter.emit(payload, target)

    @classmethod
    def clear(cls) -> None:
        cls._adapters.clear()
