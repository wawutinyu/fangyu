"""MQTT 事件 → 方隅·行 Worker 任务自动派发（序侧桥接）。"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from fangyu.core.config import DATA_DIR
from fangyu.core.worker_registry import enqueue_task

DEFAULT_CONFIG = DATA_DIR / "worker-mqtt-triggers.json"


class WorkerMqttBridge:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._adapter: Any = None
        self._triggers: list[dict[str, Any]] = []
        self._started = False
        self._config_path = DEFAULT_CONFIG

    def load_config(self, path: Path | None = None) -> dict[str, Any]:
        cfg_path = path or self._config_path
        if not cfg_path.exists():
            return {"enabled": False, "triggers": []}
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
        self._triggers = list(data.get("triggers") or [])
        return data

    def start(self, path: Path | None = None) -> dict[str, Any]:
        cfg = self.load_config(path)
        if not cfg.get("enabled"):
            return self.status()
        if self._started:
            return self.status()

        from fangyu.adapters.mqtt_sim import MqttSimAdapter

        self._adapter = MqttSimAdapter()
        for entry in self._triggers:
            topic = entry.get("topic")
            if not topic:
                continue

            def handler(record: dict[str, Any], trigger: dict[str, Any] = entry) -> None:
                with self._lock:
                    self._dispatch(trigger, record)

            self._adapter.subscribe(topic, handler)

        self._started = True
        return self.status()

    def stop(self) -> None:
        if self._adapter and hasattr(self._adapter, "disconnect"):
            try:
                self._adapter.disconnect()
            except Exception:
                pass
        self._adapter = None
        self._started = False

    def status(self) -> dict[str, Any]:
        return {
            "started": self._started,
            "config": str(self._config_path),
            "triggers": [
                {
                    "topic": t.get("topic"),
                    "task_type": t.get("task_type", "adapter_invoke"),
                    "worker_name": t.get("worker_name"),
                }
                for t in self._triggers
            ],
        }

    def fire_sim(self, topic: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        """模拟 MQTT 事件；若桥未启动则直接入队任务。"""
        record = {"topic": topic, "payload": payload or {"value": 42.0, "unit": "C"}}
        trigger = self._match_trigger(topic)
        if trigger:
            task = self._dispatch(trigger, record)
            if self._adapter and self._started:
                self._adapter.publish(topic, record["payload"])
            return {"mode": "trigger", "task": task}

        if not self._adapter:
            from fangyu.adapters.mqtt_sim import MqttSimAdapter
            self._adapter = MqttSimAdapter()

        if self._started:
            self._adapter.publish(topic, record["payload"])
            return {"mode": "publish_only", "topic": topic}

        task = enqueue_task(
            task_type="adapter_invoke",
            payload={
                "action": "ingest",
                "adapter": "mqtt_sim",
                "raw": record,
            },
            worker_name=None,
        )
        if self._adapter:
            self._adapter.publish(topic, record["payload"])
        return {"mode": "default_enqueue", "task": task}

    def _match_trigger(self, topic: str) -> dict[str, Any] | None:
        for t in self._triggers:
            if t.get("topic") == topic:
                return t
        return None

    def _dispatch(self, trigger: dict[str, Any], record: dict[str, Any]) -> dict[str, Any]:
        task_type = trigger.get("task_type", "adapter_invoke")
        worker_name = trigger.get("worker_name")

        if task_type == "run_flow":
            payload = dict(trigger.get("run_flow_payload") or {"nodes": [], "edges": []})
            payload.setdefault("snapshot_name", f"mqtt:{record.get('topic')}")
            payload.setdefault("external_inputs", {"mqtt": record})
        else:
            payload = {
                "action": trigger.get("action", "ingest"),
                "adapter": trigger.get("adapter", "mqtt_sim"),
                "raw": record,
            }

        return enqueue_task(
            task_type=task_type,
            payload=payload,
            worker_name=worker_name,
        )


_bridge: WorkerMqttBridge | None = None


def get_worker_mqtt_bridge() -> WorkerMqttBridge:
    global _bridge
    if _bridge is None:
        _bridge = WorkerMqttBridge()
    return _bridge


def reset_worker_mqtt_bridge_for_tests() -> None:
    global _bridge
    if _bridge:
        _bridge.stop()
    _bridge = None
