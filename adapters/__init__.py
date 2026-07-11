"""fangyu physical / industrial adapters."""
from fangyu.adapters.base import BaseAdapter
from fangyu.adapters.registry import AdapterRegistry
from fangyu.adapters.mqtt_sim import MqttSimAdapter
from fangyu.adapters.mqtt_client import MqttClientAdapter
from fangyu.adapters.opcua_sim import OpcUaSimAdapter
from fangyu.adapters.plc_sim import PlcSimAdapter

__all__ = [
    "BaseAdapter",
    "AdapterRegistry",
    "MqttSimAdapter",
    "MqttClientAdapter",
    "OpcUaSimAdapter",
    "PlcSimAdapter",
    "ensure_default_adapters",
]


def ensure_default_adapters() -> None:
    """注册内置 Adapter（幂等）。mqtt 需 paho-mqtt 可选依赖。"""
    for cls in (MqttSimAdapter, OpcUaSimAdapter, PlcSimAdapter):
        inst = cls()
        if not AdapterRegistry.get(inst.name):
            AdapterRegistry.register(inst)
    mqtt_client = MqttClientAdapter()
    if mqtt_client.available and not AdapterRegistry.get("mqtt"):
        AdapterRegistry.register(mqtt_client)
