"""产线 PLC 模拟 — MQTT + OPC-UA 双通道工业事件。"""
from __future__ import annotations

import time
from typing import Any

from fangyu.a2a.payload import CONTENT_INDUSTRIAL, Payload, build_message_from_payload
from fangyu.adapters.base import BaseAdapter
from fangyu.adapters.mqtt_sim import MqttSimAdapter
from fangyu.adapters.opcua_sim import OpcUaSimAdapter


class PlcSimAdapter(BaseAdapter):
    """模拟产线 PLC：寄存器 + 告警 + 向 Worker Agent 派发 industrial 事件。"""

    name = "plc_sim"
    protocol = "plc"
    content_types = [CONTENT_INDUSTRIAL]

    def __init__(self, line_id: str = "line1") -> None:
        self.line_id = line_id
        self.mqtt = MqttSimAdapter()
        self.opcua = OpcUaSimAdapter()
        self.registers: dict[str, dict[str, Any]] = {
            "temperature": {"value": 25.0, "unit": "C", "alarm_high": 80.0},
            "motor_speed": {"value": 1200, "unit": "rpm", "alarm_high": 3000},
            "alarm": {"value": False, "unit": "bool"},
        }
        self._history: list[dict] = []

    def read_register(self, tag: str) -> dict[str, Any]:
        reg = self.registers.get(tag)
        if not reg:
            raise KeyError(f"Unknown register: {tag}")
        return {"tag": tag, "value": reg["value"], "unit": reg.get("unit", ""), "line_id": self.line_id}

    def write_register(self, tag: str, value: Any) -> dict[str, Any]:
        if tag not in self.registers:
            raise KeyError(f"Unknown register: {tag}")
        self.registers[tag]["value"] = value
        event = self._build_event(tag, value, source="write")
        self._history.append(event)
        topic = f"plc/{self.line_id}/{tag}"
        self.mqtt.publish(topic, {"tag": tag, "value": value, "unit": self.registers[tag].get("unit")})
        self.opcua.write_node(f"ns=1;s=PLC.{self.line_id}.{tag}", value, unit=self.registers[tag].get("unit", ""))
        return event

    def tick(self) -> list[dict[str, Any]]:
        """模拟采样周期 — 温度微幅波动。"""
        temp = float(self.registers["temperature"]["value"]) + 0.5
        self.registers["temperature"]["value"] = round(temp, 2)
        event = self._build_event("temperature", temp, source="tick")
        self._history.append(event)
        self.mqtt.publish(f"plc/{self.line_id}/temperature", {"tag": "temperature", "value": temp, "unit": "C"})
        return [event]

    def _build_event(self, tag: str, value: Any, *, source: str) -> dict[str, Any]:
        reg = self.registers.get(tag, {})
        alarm = False
        if tag != "alarm" and reg.get("alarm_high") is not None:
            try:
                alarm = float(value) >= float(reg["alarm_high"])
            except (TypeError, ValueError):
                alarm = False
        if alarm:
            self.registers["alarm"]["value"] = True
        return {
            "line_id": self.line_id,
            "tag": tag,
            "value": value,
            "unit": reg.get("unit", ""),
            "alarm": alarm or bool(self.registers["alarm"]["value"]),
            "device_id": f"plc_{self.line_id}",
            "source": source,
            "timestamp": time.time(),
        }

    def ingest(self, raw: dict[str, Any]) -> Payload:
        tag = raw.get("tag") or "temperature"
        if "value" in raw:
            event = self.write_register(tag, raw["value"])
        else:
            event = self.read_register(tag)
        return Payload(content_type=CONTENT_INDUSTRIAL, body={**event, "protocol": "plc"}, metadata={"adapter": self.name})

    def emit(self, payload: Payload, target: str = "") -> dict[str, Any]:
        body = payload.body if isinstance(payload.body, dict) else {"value": payload.body}
        tag = target or body.get("tag") or "motor_speed"
        cmd = body.get("command") or body.get("value")
        if cmd is None:
            raise ValueError("PLC emit requires command or value")
        if isinstance(cmd, str) and cmd.startswith("set:"):
            _, val = cmd.split(":", 1)
            return self.write_register(tag, float(val) if tag != "alarm" else val.lower() == "true")
        return self.write_register(tag, cmd)

    def to_worker_message(self, event: dict[str, Any], skill_id: str = "industrial") -> dict:
        payload = Payload(content_type=CONTENT_INDUSTRIAL, body=event, metadata={"skill_id": skill_id})
        return build_message_from_payload(payload, role="user", skill_id=skill_id)

    def health(self) -> dict[str, Any]:
        return {
            **super().health(),
            "line_id": self.line_id,
            "registers": {k: v["value"] for k, v in self.registers.items()},
            "events": len(self._history),
        }
