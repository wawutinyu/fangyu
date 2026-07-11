"""MQTT 真实客户端 Adapter — 基于 paho-mqtt 连接外部 broker。"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Callable

from fangyu.a2a.payload import CONTENT_INDUSTRIAL, Payload
from fangyu.adapters.base import BaseAdapter

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover - optional dependency
    mqtt = None  # type: ignore


class MqttClientAdapter(BaseAdapter):
    """连接真实 MQTT broker；未安装 paho-mqtt 时 health 返回 unavailable。"""

    name = "mqtt"
    protocol = "mqtt"
    content_types = [CONTENT_INDUSTRIAL, "application/json"]

    def __init__(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        client_id: str | None = None,
        username: str | None = None,
        password: str | None = None,
        keepalive: int = 60,
    ) -> None:
        self.host = host or os.getenv("MQTT_BROKER_HOST", "127.0.0.1")
        self.port = int(port if port is not None else os.getenv("MQTT_BROKER_PORT", "1883"))
        self.client_id = client_id or os.getenv("MQTT_CLIENT_ID", f"fangyu-{int(time.time())}")
        self.username = username if username is not None else os.getenv("MQTT_USERNAME") or None
        self.password = password if password is not None else os.getenv("MQTT_PASSWORD") or None
        self.keepalive = keepalive
        self._client: Any = None
        self._connected = False
        self._lock = threading.Lock()
        self._last_messages: dict[str, dict] = {}
        self._callbacks: dict[str, list[Callable[[dict], None]]] = {}
        self._error: str | None = None

    @property
    def available(self) -> bool:
        return mqtt is not None

    def connect(self) -> None:
        if not self.available:
            raise RuntimeError("paho-mqtt 未安装：py -m pip install 'fangyu[mqtt]'")
        if self._connected:
            return
        with self._lock:
            if self._connected:
                return
            client = mqtt.Client(client_id=self.client_id, protocol=mqtt.MQTTv311)
            if self.username:
                client.username_pw_set(self.username, self.password)
            client.on_connect = self._on_connect
            client.on_message = self._on_message
            try:
                client.connect(self.host, self.port, self.keepalive)
                client.loop_start()
                self._client = client
                deadline = time.time() + 5.0
                while time.time() < deadline and not self._connected:
                    time.sleep(0.05)
                if not self._connected:
                    raise TimeoutError(f"MQTT connect timeout: {self.host}:{self.port}")
            except Exception as e:
                self._error = str(e)
                raise

    def disconnect(self) -> None:
        with self._lock:
            if self._client:
                self._client.loop_stop()
                self._client.disconnect()
            self._client = None
            self._connected = False

    def _on_connect(self, client, userdata, flags, rc):  # noqa: ARG002
        self._connected = rc == 0
        if rc != 0:
            self._error = f"MQTT connect rc={rc}"

    def _on_message(self, client, userdata, msg):  # noqa: ARG002
        topic = msg.topic
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = {"value": msg.payload.decode("utf-8", errors="replace")}
        record = {"topic": topic, "payload": payload, "timestamp": time.time()}
        self._last_messages[topic] = record
        for cb in list(self._callbacks.get(topic, [])):
            try:
                cb(record)
            except Exception:
                pass

    def subscribe(self, topic: str, callback: Callable[[dict], None] | None = None) -> None:
        self.connect()
        assert self._client is not None
        self._client.subscribe(topic)
        if callback:
            self._callbacks.setdefault(topic, []).append(callback)

    def publish(self, topic: str, payload: dict[str, Any], *, qos: int = 0) -> dict[str, Any]:
        self.connect()
        assert self._client is not None
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        info = self._client.publish(topic, data, qos=qos)
        if qos > 0:
            info.wait_for_publish(timeout=5.0)
        msg = {"topic": topic, "payload": payload, "timestamp": time.time(), "qos": qos}
        self._last_messages[topic] = msg
        return msg

    def last_message(self, topic: str) -> dict | None:
        return self._last_messages.get(topic)

    def ingest(self, raw: dict[str, Any]) -> Payload:
        topic = raw.get("topic", "")
        body = raw.get("payload") or raw.get("body") or raw
        return Payload(
            content_type=CONTENT_INDUSTRIAL,
            body={
                "protocol": "mqtt",
                "topic": topic,
                "tag": raw.get("tag") or (topic.split("/")[-1] if topic else "unknown"),
                "value": body.get("value") if isinstance(body, dict) else body,
                "unit": body.get("unit") if isinstance(body, dict) else raw.get("unit"),
                "alarm": body.get("alarm") if isinstance(body, dict) else raw.get("alarm", False),
                "device_id": raw.get("device_id") or os.getenv("MQTT_DEVICE_ID", "mqtt"),
                "raw": body,
            },
            metadata={"adapter": self.name, "topic": topic},
        )

    def emit(self, payload: Payload, target: str = "") -> dict[str, Any]:
        topic = target or payload.metadata.get("topic") or "fangyu/cmd/default"
        body = payload.body if isinstance(payload.body, dict) else {"value": payload.body}
        return self.publish(topic, body)

    def health(self) -> dict[str, Any]:
        base = super().health()
        base.update({
            "broker": f"{self.host}:{self.port}",
            "connected": self._connected,
            "paho_available": self.available,
            "topics_seen": len(self._last_messages),
            "error": self._error,
        })
        if not self.available:
            base["status"] = "unavailable"
            base["hint"] = "pip install 'fangyu[mqtt]'"
        elif not self._connected:
            base["status"] = "disconnected"
        return base
