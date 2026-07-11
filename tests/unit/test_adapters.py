"""Adapter 插件与 PLC 模拟测试"""
import pytest

from fangyu.adapters import AdapterRegistry, PlcSimAdapter, ensure_default_adapters
from fangyu.a2a.payload import Payload, message_to_inputs, build_message_from_payload


@pytest.fixture(autouse=True)
def _adapters():
    AdapterRegistry.clear()
    ensure_default_adapters()
    yield
    AdapterRegistry.clear()


def test_mqtt_sim_publish_ingest():
    mqtt = AdapterRegistry.get("mqtt_sim")
    mqtt.publish("plc/line1/temperature", {"value": 42.0, "unit": "C"})
    payload = mqtt.ingest({"topic": "plc/line1/temperature", "payload": {"value": 42.0, "unit": "C"}})
    assert payload.content_type == "application/industrial"
    assert payload.body["value"] == 42.0


def test_opcua_sim_read_write():
    opc = AdapterRegistry.get("opcua_sim")
    opc.write_node("ns=1;s=Temp", 30.5, unit="C")
    rec = opc.read_node("ns=1;s=Temp")
    assert rec["value"] == 30.5
    payload = opc.ingest({"node_id": "ns=1;s=Temp", "value": 30.5, "unit": "C"})
    assert payload.body["protocol"] == "opcua"


def test_plc_alarm_on_high_temperature():
    plc = PlcSimAdapter(line_id="line1")
    AdapterRegistry.register(plc)
    event = plc.write_register("temperature", 95.0)
    assert event["alarm"] is True
    assert plc.registers["alarm"]["value"] is True


def test_plc_worker_message():
    plc = PlcSimAdapter()
    event = plc.read_register("temperature")
    msg = plc.to_worker_message(event)
    inputs = message_to_inputs(msg)
    assert "industrial_event" in inputs
    assert inputs["industrial_event"]["tag"] == "temperature"


def test_plc_emit_slowdown_command():
    plc = PlcSimAdapter()
    result = plc.emit(Payload(content_type="application/industrial", body={"tag": "motor_speed", "command": "set:0"}))
    assert plc.registers["motor_speed"]["value"] == 0
    assert result["tag"] == "motor_speed"
