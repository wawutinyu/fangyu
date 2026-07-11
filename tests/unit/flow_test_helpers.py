"""Flow 测试辅助 — 构建最小节点链并运行。"""
from __future__ import annotations

import asyncio
from typing import Any, Callable

from fangyu.engine.scheduler import run_flow


def run_flow_sync(
    nodes: list[dict],
    edges: list[dict],
    *,
    external_inputs: dict | None = None,
    global_vars: dict | None = None,
) -> dict:
    return asyncio.run(
        run_flow(
            nodes,
            edges,
            external_inputs=external_inputs or {},
            global_vars=global_vars or {},
        )
    )


def node(node_id: str, origin_type: str, *, label: str = "", config: dict | None = None, **extra) -> dict:
    data: dict[str, Any] = {
        "originType": origin_type,
        "label": label or origin_type,
        "config": config or {},
    }
    data.update(extra)
    return {"id": node_id, "data": data}


def edge(source: str, target: str, *, link_type: str = "serial", mappings: dict | None = None) -> dict:
    return {
        "source": source,
        "target": target,
        "data": {"linkType": link_type, "mappings": mappings or {}},
    }


def chain_flow(
    middle: dict,
    *,
    external_inputs: dict | None = None,
    global_vars: dict | None = None,
) -> dict:
    """start → middle → output 最小三段链。"""
    nodes = [
        node("s", "start"),
        node("n", middle["originType"], config=middle.get("config"), **{
            k: v for k, v in middle.items() if k not in ("originType", "config")
        }),
        node("o", "output"),
    ]
    edges = [edge("s", "n"), edge("n", "o")]
    return run_flow_sync(nodes, edges, external_inputs=external_inputs, global_vars=global_vars)


def result_for_type(result: dict, origin_type: str) -> dict | None:
    for r in result.get("results", []):
        if r.get("type") == origin_type:
            return r
    return None


def assert_flow_ok(
    result: dict,
    origin_type: str,
    predicate: Callable[[dict], bool] | None = None,
    *,
    allow_error: bool = False,
):
    assert result.get("success") is True, result.get("error")
    row = result_for_type(result, origin_type)
    assert row is not None, f"未找到节点类型 {origin_type}"
    outputs = row.get("outputs") or {}
    if not allow_error:
        assert "error" not in outputs or outputs.get("error") is None, outputs
    if predicate:
        assert predicate(outputs), outputs
    return outputs
