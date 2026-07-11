"""OPC-UA 模拟 Adapter — 内存节点树，无需真实 OPC-UA 服务。"""
from __future__ import annotations

import time
from typing import Any

from fangyu.a2a.payload import CONTENT_INDUSTRIAL, Payload
from fangyu.adapters.base import BaseAdapter


class OpcUaSimAdapter(BaseAdapter):
    name = "opcua_sim"
    protocol = "opcua"
    content_types = [CONTENT_INDUSTRIAL, "application/json"]

    def __init__(self) -> None:
        self._nodes: dict[str, dict[str, Any]] = {}

    def write_node(self, node_id: str, value: Any, *, unit: str = "", quality: str = "good") -> dict[str, Any]:
        rec = {
            "node_id": node_id,
            "value": value,
            "unit": unit,
            "quality": quality,
            "timestamp": time.time(),
        }
        self._nodes[node_id] = rec
        return rec

    def read_node(self, node_id: str) -> dict[str, Any] | None:
        return self._nodes.get(node_id)

    def ingest(self, raw: dict[str, Any]) -> Payload:
        node_id = raw.get("node_id") or raw.get("nodeId") or ""
        if node_id and "value" in raw:
            self.write_node(node_id, raw["value"], unit=raw.get("unit", ""))
        rec = self.read_node(node_id) or raw
        return Payload(
            content_type=CONTENT_INDUSTRIAL,
            body={
                "protocol": "opcua",
                "node_id": node_id,
                "tag": raw.get("tag") or node_id.split(".")[-1],
                "value": rec.get("value"),
                "unit": rec.get("unit"),
                "quality": rec.get("quality", "good"),
                "device_id": raw.get("device_id") or "opcua_sim",
            },
            metadata={"adapter": self.name, "node_id": node_id},
        )

    def emit(self, payload: Payload, target: str = "") -> dict[str, Any]:
        node_id = target or (payload.body.get("node_id") if isinstance(payload.body, dict) else "") or "ns=1;s=Command"
        value = payload.body.get("value") if isinstance(payload.body, dict) else payload.body
        return self.write_node(node_id, value)

    def health(self) -> dict[str, Any]:
        return {**super().health(), "nodes": len(self._nodes)}
