"""MQTT 模拟 Adapter — 内存 topic 总线，无需真实 broker。"""
from __future__ import annotations

import time
from typing import Any

from fangyu.a2a.payload import CONTENT_INDUSTRIAL, Payload
from fangyu.adapters.base import BaseAdapter


class MqttSimAdapter(BaseAdapter):
    name = "mqtt_sim"
    protocol = "mqtt"
    content_types = [CONTENT_INDUSTRIAL, "application/json"]

    def __init__(self) -> None:
        self._topics: dict[str, list[dict]] = {}
        self._subscribers: dict[str, list] = {}

    def publish(self, topic: str, payload: dict[str, Any]) -> dict[str, Any]:
        msg = {"topic": topic, "payload": payload, "timestamp": time.time()}
        self._topics.setdefault(topic, []).append(msg)
        if len(self._topics[topic]) > 500:
            self._topics[topic] = self._topics[topic][-500:]
        for cb in list(self._subscribers.get(topic, [])):
            try:
                cb(msg)
            except Exception:
                pass
        return msg

    def subscribe(self, topic: str, callback) -> None:
        self._subscribers.setdefault(topic, []).append(callback)

    def last_message(self, topic: str) -> dict | None:
        msgs = self._topics.get(topic) or []
        return msgs[-1] if msgs else None

    def ingest(self, raw: dict[str, Any]) -> Payload:
        topic = raw.get("topic", "")
        body = raw.get("payload") or raw.get("body") or raw
        return Payload(
            content_type=CONTENT_INDUSTRIAL,
            body={
                "protocol": "mqtt",
                "topic": topic,
                "tag": raw.get("tag") or topic.split("/")[-1],
                "value": body.get("value") if isinstance(body, dict) else body,
                "unit": body.get("unit") if isinstance(body, dict) else raw.get("unit"),
                "device_id": raw.get("device_id") or "mqtt_sim",
                "raw": body,
            },
            metadata={"adapter": self.name, "topic": topic},
        )

    def emit(self, payload: Payload, target: str = "") -> dict[str, Any]:
        topic = target or payload.metadata.get("topic") or "fangyu/cmd/default"
        body = payload.body if isinstance(payload.body, dict) else {"value": payload.body}
        return self.publish(topic, body)

    def health(self) -> dict[str, Any]:
        return {**super().health(), "topics": len(self._topics), "messages": sum(len(v) for v in self._topics.values())}
