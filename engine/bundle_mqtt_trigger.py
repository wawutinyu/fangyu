"""Bundle MQTT 事件触发 — subscribe topic → 自动执行 skill。"""
from __future__ import annotations

import threading
from typing import Any

from fangyu.a2a.payload import build_message_from_payload
from fangyu.engine.a2a_runtime import AgentBus
from fangyu.engine.bundle_daemon import record_task


class BundleMqttTrigger:
    """Bundle daemon MQTT 触发器。"""

    def __init__(self, bundle: dict[str, Any], agent_name: str, bus: AgentBus) -> None:
        self._bundle = bundle
        self._agent_name = agent_name
        self._bus = bus
        self._lock = threading.Lock()
        self._adapters: list[Any] = []
        self._triggers: list[dict[str, Any]] = []
        self._started = False

    def start(self) -> list[dict[str, Any]]:
        if self._started:
            return list(self._triggers)
        cfg = (self._bundle.get("interfaces") or {}).get("event_triggers") or {}
        for entry in cfg.get("mqtt") or []:
            self._bind(entry)
        self._started = True
        return list(self._triggers)

    def stop(self) -> None:
        for adapter in self._adapters:
            disconnect = getattr(adapter, "disconnect", None)
            if callable(disconnect):
                try:
                    disconnect()
                except Exception:
                    pass
        self._adapters.clear()
        self._started = False

    def status(self) -> dict[str, Any]:
        return {"started": self._started, "triggers": list(self._triggers)}

    def _bind(self, entry: dict[str, Any]) -> None:
        topic = entry.get("topic")
        if not topic:
            return
        skill_id = entry.get("skill_id", "default")
        use_sim = bool(entry.get("use_sim", True))
        adapter = self._create_adapter(entry, use_sim=use_sim)

        def handler(record: dict[str, Any]) -> None:
            with self._lock:
                self._dispatch(adapter, record, skill_id)

        adapter.subscribe(topic, handler)
        self._adapters.append(adapter)
        self._triggers.append({
            "topic": topic,
            "skill_id": skill_id,
            "adapter": adapter.name,
            "use_sim": use_sim,
        })

    def _create_adapter(self, entry: dict[str, Any], *, use_sim: bool):
        if use_sim:
            from fangyu.adapters.mqtt_sim import MqttSimAdapter
            return MqttSimAdapter()
        from fangyu.adapters.mqtt_client import MqttClientAdapter
        return MqttClientAdapter(
            host=entry.get("host"),
            port=entry.get("port"),
            username=entry.get("username"),
            password=entry.get("password"),
        )

    def _dispatch(self, adapter, record: dict[str, Any], skill_id: str) -> None:
        body = record.get("payload") or {}
        if isinstance(body, dict) and (body.get("message") or body.get("query")):
            text = str(body.get("message") or body.get("query"))
            message = {
                "role": "user",
                "parts": [{"type": "text", "text": text}],
                "metadata": {"skill_id": skill_id, "source": "mqtt"},
            }
        else:
            payload = adapter.ingest(record)
            message = build_message_from_payload(payload, skill_id=skill_id)
            message.setdefault("metadata", {})["source"] = "mqtt"
        self._bus.send_message(self._agent_name, message)
        record_task()

    def publish_sim(self, topic: str, payload: dict[str, Any]) -> None:
        """测试/helper：向已绑定的 mqtt_sim 发布事件。"""
        for adapter in self._adapters:
            if adapter.name == "mqtt_sim" and hasattr(adapter, "publish"):
                adapter.publish(topic, payload)
                return
        raise RuntimeError("no mqtt_sim adapter bound")


_trigger: BundleMqttTrigger | None = None


def start_bundle_mqtt_triggers(bundle: dict[str, Any], agent_name: str, bus: AgentBus) -> BundleMqttTrigger:
    global _trigger
    _trigger = BundleMqttTrigger(bundle, agent_name, bus)
    _trigger.start()
    return _trigger


def get_bundle_mqtt_trigger() -> BundleMqttTrigger | None:
    return _trigger


def reset_bundle_mqtt_trigger_for_tests() -> None:
    global _trigger
    if _trigger:
        _trigger.stop()
    _trigger = None
