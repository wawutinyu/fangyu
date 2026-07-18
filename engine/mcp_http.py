"""无状态 MCP Streamable HTTP — POST /mcp/v1/messages（JSON-RPC 2.0）。

无 session；Tasks 扩展靠 taskId 句柄。对齐外部客户端与
fangyu.engine.mcp.McpServerConnection 已使用的路径。
"""
from __future__ import annotations

import logging
from typing import Any

from fangyu.engine.mcp import (
    call_internal_tool,
    get_external_server,
    get_internal_resources,
    get_internal_tools,
    make_error,
    make_response,
)
from fangyu.engine.mcp_tasks import (
    EXTENSION_ID,
    cancel_task,
    client_supports_tasks,
    get_task,
    run_tool_as_task,
    tasks_extension_capability,
    to_get_task_result,
    update_task,
)

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "2025-11-25"  # 兼容声明；Tasks 走扩展


def _meta_from_params(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        return {}
    meta = params.get("_meta")
    return meta if isinstance(meta, dict) else {}


async def handle_jsonrpc(body: dict[str, Any]) -> dict[str, Any] | None:
    """处理单条 JSON-RPC；notification（无 id）返回 None。"""
    if not isinstance(body, dict) or body.get("jsonrpc") != "2.0":
        return make_error(-32600, "Invalid Request", body.get("id") if isinstance(body, dict) else None)

    msg_id = body.get("id")
    method = str(body.get("method") or "")
    params = body.get("params") if isinstance(body.get("params"), dict) else {}

    # notifications
    if msg_id is None and method.startswith("notifications/"):
        return None

    try:
        result = await _dispatch(method, params)
    except KeyError as exc:
        return make_error(-32601, f"Method not found: {method}", msg_id)
    except ValueError as exc:
        return make_error(-32602, str(exc), msg_id)
    except PermissionError as exc:
        # Missing Tasks capability
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {
                "code": -32003,
                "message": str(exc) or "Missing required client capability",
                "data": {
                    "requiredCapabilities": {
                        "extensions": tasks_extension_capability(),
                    }
                },
            },
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("mcp http method %s", method)
        return make_error(-32000, str(exc), msg_id)

    if msg_id is None:
        return None
    return make_response(result, msg_id)


async def _dispatch(method: str, params: dict[str, Any]) -> Any:
    if method in ("initialize", "server/discover"):
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": {"name": "fangyu", "version": "1.0.0"},
            "capabilities": {
                "extensions": tasks_extension_capability(),
                "tools": {"listChanged": False},
            },
        }

    if method == "ping":
        return {}

    if method == "tools/list":
        server = str(params.get("server") or "__internal__")
        if server == "__internal__":
            return {"tools": get_internal_tools(), "resources": get_internal_resources()}
        conn = get_external_server(server)
        if not conn:
            raise ValueError(f"MCP server '{server}' not found")
        tools = await conn.list_tools()
        return {"tools": tools}

    if method == "tools/call":
        return await _tools_call(params)

    if method == "tasks/get":
        tid = str(params.get("taskId") or "")
        task = get_task(tid)
        if not task:
            raise ValueError(f"unknown taskId: {tid}")
        return to_get_task_result(task)

    if method == "tasks/update":
        tid = str(params.get("taskId") or "")
        return update_task(
            tid,
            input_responses=params.get("inputResponses") if isinstance(params.get("inputResponses"), dict) else None,
            meta=params.get("_meta") if isinstance(params.get("_meta"), dict) else None,
        )

    if method == "tasks/cancel":
        tid = str(params.get("taskId") or "")
        return cancel_task(tid)

    raise KeyError(method)


async def _tools_call(params: dict[str, Any]) -> Any:
    name = str(params.get("name") or "").strip()
    if not name:
        raise ValueError("tools/call requires name")
    arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
    server = str(params.get("server") or "__internal__")
    meta = _meta_from_params(params)
    supports = client_supports_tasks(meta)
    # 可选：params.asTask / delaySec（方隅扩展，便于自测）
    as_task = bool(params.get("asTask") or params.get("as_task"))
    delay_sec = float(params.get("delaySec") or params.get("delay_sec") or 0)

    async def _run():
        if delay_sec > 0:
            import asyncio
            await asyncio.sleep(min(delay_sec, 30))
        if server == "__internal__":
            from fangyu.engine.mcp import _init_internal_tools
            await _init_internal_tools()
            return await call_internal_tool(name, arguments)
        conn = get_external_server(server)
        if not conn:
            raise ValueError(f"MCP server '{server}' not found")
        return await conn.call_tool(name, arguments)

    use_task = as_task or (supports and delay_sec > 0)
    if use_task:
        if not supports:
            raise PermissionError("Missing required client capability")
        return await run_tool_as_task(
            tool_name=name,
            arguments=arguments,
            server=server,
            runner=_run,
        )

    result = await _run()
    return {"content": [{"type": "text", "text": str(result)}], "isError": False, "result": result}
