import json
import asyncio
import hashlib
from typing import Any

from .executor import register_executor, NodeContext
from .scheduler import run_flow
from .safe_expr import safe_eval, safe_eval_bool, safe_eval_int


def _non_null_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in inputs.items() if v is not None}


async def _exec_loop(ctx: NodeContext) -> dict[str, Any]:
    arr = ctx.inputs.get("array", [])
    if not isinstance(arr, list):
        arr = [arr]
    max_iter = int(ctx.config.get("max_iterations", 100))
    loop_var = ctx.config.get("loop_var", "item")
    inner_nodes_raw = (ctx.node_data or {}).get("inner_nodes", [])
    inner_links_raw = (ctx.node_data or {}).get("inner_links", [])

    results = []
    for i, item in enumerate(arr):
        if i >= max_iter:
            break
        ctx.global_vars[loop_var] = item
        ctx.global_vars["_loop_index"] = i
        if inner_nodes_raw:
            inner_nodes = [
                {
                    "id": n["id"],
                    "data": {
                        "originType": n.get("originType", "start"),
                        "config": n.get("config", {}),
                        "mappings": n.get("mappings", {}),
                    },
                }
                for n in inner_nodes_raw
            ]
            inner_edges = [
                {
                    "source": e["sourceNodeId"],
                    "target": e["targetNodeId"],
                    "data": {
                        "linkType": e.get("linkType", "serial"),
                        "mappings": e.get("mappings", {}),
                    },
                }
                for e in inner_links_raw
            ]
            inner_result = await run_flow(
                nodes=inner_nodes,
                edges=inner_edges,
                external_inputs=_non_null_inputs({**ctx.external_inputs, **ctx.inputs, "item": item, "index": i}),
                global_vars=ctx.global_vars,
            )
            inner_outputs = {}
            for r in inner_result.get("results", []):
                inner_outputs[r["nodeId"]] = r.get("outputs", {})
            results.append({"index": i, loop_var: item, "body_outputs": inner_outputs})
        else:
            results.append({"index": i, loop_var: item})
    return {"result": results, "count": len(results)}


async def _exec_start(ctx: NodeContext) -> dict[str, Any]:
    return {**ctx.external_inputs, "trigger": True}


async def _exec_end(ctx: NodeContext) -> dict[str, Any]:
    return {"result": ctx.inputs.get("input")}


async def _exec_condition(ctx: NodeContext) -> dict[str, Any]:
    expr = ctx.config.get("expression", "true")
    branch_count = int(ctx.config.get("branch_count", 2))
    resolved = ctx.inputs.get("input")
    eval_ctx = {"input": resolved, "inputs": ctx.inputs, "_outputs": ctx.all_outputs}
    if branch_count > 2:
        idx = safe_eval_int(expr, eval_ctx, default=0)
        idx = max(0, min(idx, branch_count - 1))
        return {"result": idx, "branch": f"branch_{idx}"}
    result = safe_eval_bool(expr, eval_ctx, default=bool(resolved))
    return {"result": result, "branch": "true" if result else "false", "true": result, "false": not result}


async def _exec_switch(ctx: NodeContext) -> dict[str, Any]:
    expr = ctx.config.get("expression", "input")
    resolved = ctx.inputs.get("input")
    try:
        value = safe_eval(expr, {
            "input": resolved, "inputs": ctx.inputs, "_outputs": ctx.all_outputs,
        })
    except Exception:
        value = resolved
    return {"result": value}


async def _exec_loop_wrapper(ctx: NodeContext) -> dict[str, Any]:
    return await _exec_loop(ctx)


async def _exec_composite(ctx: NodeContext) -> dict[str, Any]:
    inner_nodes_raw = (ctx.node_data or {}).get("inner_nodes", [])
    inner_links_raw = (ctx.node_data or {}).get("inner_links", [])

    if not inner_nodes_raw:
        return {"output": ctx.inputs.get("input"), "success": True}
    inner_nodes = [
        {"id": n["id"], "data": {"originType": n.get("originType", "start"), "config": n.get("config", {}), "mappings": n.get("mappings", {})}}
        for n in inner_nodes_raw
    ]
    inner_edges = [
        {"source": e["sourceNodeId"], "target": e["targetNodeId"], "data": {"linkType": e.get("linkType", "serial"), "mappings": e.get("mappings", {})}}
        for e in inner_links_raw
    ]
    inner_result = await run_flow(
        nodes=inner_nodes,
        edges=inner_edges,
        external_inputs=_non_null_inputs({**ctx.external_inputs, **ctx.inputs}),
        global_vars=ctx.global_vars,
    )
    inner_outputs = {}
    for r in inner_result.get("results", []):
        inner_outputs[r["nodeId"]] = r.get("outputs", {})
    return {"outputs": inner_outputs, "success": inner_result.get("success", False)}


async def _exec_approval(ctx: NodeContext) -> dict[str, Any]:
    message = ctx.inputs.get("input", ctx.config.get("message", ""))
    approval_id = f"apr_{hashlib.md5(str(ctx.config).encode()).hexdigest()[:6]}"
    ctx.global_vars["_pending_approval"] = {"approval_id": approval_id, "message": message, "status": "pending"}
    return {"_pending": True, "approval_id": approval_id, "message": message, "status": "pending"}


async def _exec_trigger(ctx: NodeContext) -> dict[str, Any]:
    user_message = ctx.external_inputs.get("message", ctx.inputs.get("message", ""))
    return {"message": user_message, "triggered": True}


async def _exec_input(ctx: NodeContext) -> dict[str, Any]:
    """输入节点：上游 → default_value → external（聊天预览覆盖默认值）。"""
    merged: dict[str, Any] = {}
    for k, v in ctx.inputs.items():
        if v is not None:
            merged[k] = v
    if "input" not in merged and ctx.config.get("default_value") is not None:
        merged["input"] = ctx.config["default_value"]
    ext = ctx.external_inputs or {}
    for k, v in ext.items():
        if v is not None:
            merged[k] = v
    # 底部预览常只传 query/message，提升为 input，覆盖 default_value
    chat = ext.get("input")
    if chat is None:
        chat = ext.get("query")
    if chat is None:
        chat = ext.get("message")
    if chat is not None:
        merged["input"] = chat
    return merged


async def _exec_output(ctx: NodeContext) -> dict[str, Any]:
    return {"result": ctx.inputs.get("input")}


def register():
    register_executor("start", _exec_start)
    register_executor("end", _exec_end)
    register_executor("condition", _exec_condition)
    register_executor("switch", _exec_switch)
    register_executor("loop", _exec_loop_wrapper)
    register_executor("composite", _exec_composite)
    register_executor("composite-node", _exec_composite)
    register_executor("approval", _exec_approval)
    register_executor("trigger", _exec_trigger)
    register_executor("input", _exec_input)
    register_executor("output", _exec_output)
