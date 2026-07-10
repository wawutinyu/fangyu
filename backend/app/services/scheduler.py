import asyncio
from typing import Any

from .context import NodeContext
from .registry import _EXECUTORS, _get_meta

_HTTP_CLIENT: Any | None = None


async def _get_http_client():
    global _HTTP_CLIENT
    if _HTTP_CLIENT is None:
        import httpx
        _HTTP_CLIENT = httpx.AsyncClient(timeout=30.0)
    return _HTTP_CLIENT


async def _close_http_client():
    global _HTTP_CLIENT
    if _HTTP_CLIENT is not None:
        await _HTTP_CLIENT.aclose()
        _HTTP_CLIENT = None


def _topo_sort(node_ids, edges):
    adj = {nid: [] for nid in node_ids}
    in_deg = {nid: 0 for nid in node_ids}
    for e in edges:
        s, t = e["source"], e["target"]
        if s in adj and t in adj:
            adj[s].append(t)
            in_deg[t] = in_deg.get(t, 0) + 1
    queue = [nid for nid, d in in_deg.items() if d == 0]
    order = []
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for nb in adj.get(nid, []):
            in_deg[nb] -= 1
            if in_deg[nb] == 0:
                queue.append(nb)
    return order


def _topo_depth(node_ids, edges):
    depth = {nid: 0 for nid in node_ids}
    adj = {nid: [] for nid in node_ids}
    in_deg = {nid: 0 for nid in node_ids}
    for e in edges:
        s, t = e["source"], e["target"]
        if s in adj and t in adj:
            adj[s].append(t)
            in_deg[t] = in_deg.get(t, 0) + 1
    queue = [nid for nid, d in in_deg.items() if d == 0]
    while queue:
        nid = queue.pop(0)
        for nb in adj.get(nid, []):
            in_deg[nb] -= 1
            depth[nb] = max(depth[nb], depth[nid] + 1)
            if in_deg[nb] == 0:
                queue.append(nb)
    return depth


def _is_parallel_edge(edge, edges):
    e_data = edge.get("data", {}) if isinstance(edge.get("data"), dict) else {}
    link_type = e_data.get("linkType", edge.get("linkType", "serial"))
    return link_type == "parallel"


def _resolve_mapping(source_expr, all_outputs):
    if not source_expr:
        return None
    parts = source_expr.split(".")
    if len(parts) >= 2:
        node_name_or_id = parts[0]
        output_key = ".".join(parts[1:])
        if node_name_or_id in all_outputs and output_key in all_outputs[node_name_or_id]:
            return all_outputs[node_name_or_id][output_key]
        for node_outputs in all_outputs.values():
            if isinstance(node_outputs, dict) and output_key in node_outputs:
                return node_outputs[output_key]
        return None
    for node_outputs in all_outputs.values():
        if isinstance(node_outputs, dict) and parts[0] in node_outputs:
            return node_outputs[parts[0]]
    return None


async def _exec_unknown(ctx: NodeContext) -> dict[str, Any]:
    await asyncio.sleep(0.2)
    output_names = [p["name"] for p in ctx.meta.get("outputSchema", [])]
    result = {}
    if not output_names:
        result["result"] = "[已执行]"
    else:
        for name in output_names:
            result[name] = ctx.inputs.get(name, ctx.config.get(name))
    return result


async def run_flow(nodes, edges, external_inputs=None, global_vars=None, on_event=None, db_session=None):
    if external_inputs is None:
        external_inputs = {}
    if global_vars is None:
        global_vars = {}
    if not nodes:
        return {"success": False, "error": "画布为空", "results": [], "logs": []}

    depth = global_vars.get("_flow_depth", 0)
    if depth > 10:
        return {"success": False, "error": f"递归过深 ({depth})", "results": [], "logs": []}
    global_vars["_flow_depth"] = depth + 1

    node_ids = [n["id"] for n in nodes]
    order = _topo_sort(node_ids, edges)
    if not order:
        return {"success": False, "error": "无法排序（可能包含环）", "results": [], "logs": []}

    depth_map = _topo_depth(node_ids, edges)
    max_depth = max(depth_map.values()) if depth_map else 0
    batches = {}
    for nid, d in depth_map.items():
        batches.setdefault(d, []).append(nid)

    node_map = {n["id"]: n for n in nodes}
    outputs = {}
    results = []
    logs = []
    aborted = False

    def _emit(evt_type, data):
        if on_event:
            asyncio.ensure_future(on_event(evt_type, data))

    def _add_log(node_id, node_name, log_type, data):
        logs.append({"nodeId": node_id, "nodeName": node_name, "type": log_type, "data": data, "time": _now()})

    def _now():
        import time
        return int(time.time() * 1000)

    async def _run_single_node(node_id):
        nonlocal aborted
        t0 = _now()
        if aborted:
            return
        node_data = node_map.get(node_id)
        if not node_data:
            return
        nd = node_data.get("data", {}) or {}
        origin_type = nd.get("originType") or node_data.get("type") or "atom-node"
        meta = _get_meta(origin_type)
        node_name = nd.get("label") or node_data.get("name") or meta.get("name") or origin_type
        if not isinstance(nd, dict) or nd == {}:
            nd = {}
        nd.setdefault("config", node_data.get("config", {}))
        nd.setdefault("mappings", node_data.get("mappings", {}) or {})

        upstream_edges = [e for e in edges if e["target"] == node_id]
        inputs = {}
        for port in meta.get("inputSchema", []):
            inputs[port["name"]] = None

        for edge in upstream_edges:
            edge_mappings = edge.get("data", {}).get("mappings", {}) if isinstance(edge.get("data"), dict) else {}
            for tgt_port, src_expr in edge_mappings.items():
                inputs[tgt_port] = _resolve_mapping(src_expr, outputs)

        node_mappings = nd.get("mappings", {}) if isinstance(nd, dict) else {}
        for tgt_port, src_expr in node_mappings.items():
            if inputs.get(tgt_port) is None:
                inputs[tgt_port] = _resolve_mapping(src_expr, outputs)

        if upstream_edges:
            all_up_outputs = {}
            for edge in upstream_edges:
                src_out = outputs.get(edge["source"], {})
                all_up_outputs.update(src_out)
            meta_keys = {"trigger", "usage", "error", "count", "success", "stdout", "token_usage", "approval_id", "status"}
            config_port_names = {"code", "expression", "prompt", "api_key", "model", "max_iterations", "loop_var", "branch_count", "temperature", "max_tokens", "top_p", "frequency_penalty", "presence_penalty"}
            data_port_names = {"input", "source", "text", "value", "data", "message", "query", "array", "body", "item", "key", "context"}
            for port in meta.get("inputSchema", []):
                if inputs.get(port["name"]) is not None:
                    continue
                pn = port["name"]
                if pn in all_up_outputs:
                    inputs[pn] = all_up_outputs[pn]
                    continue
                if pn in config_port_names:
                    continue
                if pn in data_port_names or port.get("required"):
                    for key in all_up_outputs:
                        if key not in meta_keys:
                            inputs[pn] = all_up_outputs[key]
                            break

        config = nd.get("config", {}) if isinstance(nd, dict) else {}
        _add_log(node_id, node_name, "start", {"inputs": inputs, "config": config})
        _emit("node_start", {"nodeId": node_id, "nodeName": node_name})
        if origin_type == "start":
            inputs.update(external_inputs)

        ctx = NodeContext(
            inputs=inputs, config=config, meta=meta,
            all_outputs=outputs, external_inputs=external_inputs,
            global_vars=global_vars, node_map=node_map, node_data=nd,
        )

        executor_fn = _EXECUTORS.get(origin_type, _exec_unknown)
        try:
            node_outputs = await executor_fn(ctx)
        except Exception as e:
            msg = str(e)
            if msg.startswith("APPROVAL_PENDING:"):
                parts = msg.split(":", 2)
                approval_id = parts[1] if len(parts) > 1 else ""
                approval_msg = parts[2] if len(parts) > 2 else ""
                approval_out = {"approval_id": approval_id, "message": approval_msg, "status": "pending"}
                outputs[node_id] = approval_out
                outputs[node_name] = approval_out
                _add_log(node_id, node_name, "approval_pending", approval_out)
                _emit("node_complete", {"nodeId": node_id, "nodeName": node_name, "outputs": approval_out})
                results.append({"nodeId": node_id, "nodeName": node_name, "type": origin_type, "outputs": approval_out, "pending": True})
                return
            node_outputs = {"error": f"[{origin_type}] {msg}"}
            _add_log(node_id, node_name, "error", {"error": msg})
            _emit("node_error", {"nodeId": node_id, "nodeName": node_name, "error": msg})

        if not isinstance(node_outputs, dict):
            node_outputs = {"result": node_outputs, "error": f"handler returned {type(node_outputs).__name__}"}
        outputs[node_id] = node_outputs
        outputs[node_name] = node_outputs
        is_error = "error" in node_outputs and node_outputs.get("error") is not None
        if is_error:
            _add_log(node_id, node_name, "complete_with_error", {"outputs": node_outputs})
        else:
            _add_log(node_id, node_name, "complete", {"outputs": node_outputs})
        _emit("node_complete", {"nodeId": node_id, "nodeName": node_name, "outputs": node_outputs})
        elapsed_ms = _now() - t0
        results.append({"nodeId": node_id, "nodeName": node_name, "type": origin_type, "outputs": node_outputs, "elapsed_ms": elapsed_ms})

    for depth in range(max_depth + 1):
        if aborted:
            return {"success": False, "error": "已中止", "results": results, "logs": logs}
        batch = batches.get(depth, [])
        if batch:
            await asyncio.gather(*[_run_single_node(nid) for nid in batch])
        await asyncio.sleep(0.2)

    _emit("flow_complete", {"success": True, "resultCount": len(results)})
    return {"success": True, "results": results, "logs": logs}
