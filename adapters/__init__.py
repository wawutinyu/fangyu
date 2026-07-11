"""fangyu physical / industrial adapters."""
from fangyu.adapters.base import BaseAdapter
from fangyu.adapters.registry import AdapterRegistry
from fangyu.adapters.mqtt_sim import MqttSimAdapter
from fangyu.adapters.opcua_sim import OpcUaSimAdapter
from fangyu.adapters.plc_sim import PlcSimAdapter

__all__ = [
    "BaseAdapter",
    "AdapterRegistry",
    "MqttSimAdapter",
    "OpcUaSimAdapter",
    "PlcSimAdapter",
    "ensure_default_adapters",
]


def ensure_default_adapters() -> None:
    """注册内置模拟 Adapter（幂等）。"""
    for cls in (MqttSimAdapter, OpcUaSimAdapter, PlcSimAdapter):
        inst = cls()
        if not AdapterRegistry.get(inst.name):
            AdapterRegistry.register(inst)
