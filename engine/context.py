from dataclasses import dataclass, field
from typing import Any


@dataclass
class NodeContext:
    inputs: dict[str, Any]
    config: dict[str, Any]
    meta: dict[str, Any]
    all_outputs: dict[str, dict[str, Any]]
    external_inputs: dict[str, Any]
    global_vars: dict[str, Any]
    node_map: dict[str, dict]
    node_data: dict[str, Any] = field(default_factory=dict)
