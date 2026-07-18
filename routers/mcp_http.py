"""无状态 MCP HTTP 传输 — /mcp/v1/messages。"""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from fangyu.engine.mcp_http import handle_jsonrpc
from fangyu.engine.mcp_tasks import EXTENSION_ID, tasks_extension_capability

router = APIRouter(tags=["MCP HTTP"])


@router.get("/mcp/v1/messages")
async def mcp_messages_info():
    """无状态发现：能力声明（非 SSE；POST 走 JSON-RPC）。"""
    return {
        "transport": "streamable-http-jsonrpc",
        "endpoint": "/mcp/v1/messages",
        "protocol": "json-rpc-2.0",
        "stateless": True,
        "extension": EXTENSION_ID,
        "capabilities": {"extensions": tasks_extension_capability()},
        "methods": [
            "initialize",
            "server/discover",
            "ping",
            "tools/list",
            "tools/call",
            "tasks/get",
            "tasks/update",
            "tasks/cancel",
        ],
    }


@router.post("/mcp/v1/messages")
async def mcp_messages(request: Request):
    """JSON-RPC 2.0：单对象或批量数组。无 session header。"""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
            status_code=400,
        )

    if isinstance(body, list):
        out = []
        for item in body:
            if not isinstance(item, dict):
                out.append({"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request"}})
                continue
            resp = await handle_jsonrpc(item)
            if resp is not None:
                out.append(resp)
        if not out:
            return Response(status_code=204)
        return JSONResponse(out)

    if not isinstance(body, dict):
        return JSONResponse(
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request"}},
            status_code=400,
        )

    resp = await handle_jsonrpc(body)
    if resp is None:
        return Response(status_code=204)
    return JSONResponse(resp)
