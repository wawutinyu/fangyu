"""MCP 协议路由 — tools + Tasks 扩展（SEP-2663 最小子集）。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from fangyu.engine.mcp import (
    call_internal_tool,
    connect_external_server,
    disconnect_external_server,
    get_external_server,
    get_internal_resources,
    get_internal_tools,
    list_external_servers,
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

router = APIRouter(prefix="/api/v1/mcp", tags=["MCP 协议"])


class ConnectBody(BaseModel):
    name: str
    base_url: str
    api_key: str = ""


class CallToolBody(BaseModel):
    server: str = "__internal__"
    name: str
    arguments: dict = Field(default_factory=dict)
    # 客户端声明支持 Tasks 扩展（也可放在 meta 里）
    supports_tasks: bool = False
    meta: dict = Field(default_factory=dict)
    # 服务端策略：强制以 task 返回（需客户端支持扩展）
    as_task: bool = False
    # 模拟耗时（秒），仅用于演示 Tasks 轮询
    delay_sec: float = 0


class TaskUpdateBody(BaseModel):
    input_responses: dict = Field(default_factory=dict)
    meta: dict = Field(default_factory=dict)


@router.get("/discover")
async def server_discover():
    """对齐 server/discover：声明 capabilities.extensions.tasks。"""
    return {
        "protocol": "mcp",
        "server": "fangyu-internal",
        "capabilities": {
            "extensions": tasks_extension_capability(),
            "tools": {"listChanged": False},
        },
        "extension": EXTENSION_ID,
    }


@router.get("/tools")
async def list_tools(server: str = "__internal__"):
    if server == "__internal__":
        return {"tools": get_internal_tools(), "resources": get_internal_resources()}
    conn = get_external_server(server)
    if not conn:
        raise HTTPException(404, f"MCP server '{server}' not found")
    tools = await conn.list_tools()
    return {"tools": tools, "resources": []}


@router.post("/call")
async def call_tool(body: CallToolBody):
    supports = body.supports_tasks or client_supports_tasks(body.meta)
    if body.as_task and not supports:
        raise HTTPException(
            status_code=400,
            detail={
                "code": -32003,
                "message": "Missing required client capability",
                "data": {
                    "requiredCapabilities": {
                        "extensions": tasks_extension_capability(),
                    }
                },
            },
        )

    async def _run():
        delay = float(body.delay_sec or 0)
        if delay > 0:
            import asyncio
            await asyncio.sleep(min(delay, 30))
        if body.server == "__internal__":
            return await call_internal_tool(body.name, body.arguments)
        conn = get_external_server(body.server)
        if not conn:
            raise ValueError(f"MCP server '{body.server}' not found")
        return await conn.call_tool(body.name, body.arguments)

    # 服务端决定是否返回 task：as_task 或（支持扩展且 delay>0）
    use_task = body.as_task or (supports and body.delay_sec > 0)
    if use_task:
        if not supports:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": -32003,
                    "message": "Missing required client capability",
                    "data": {
                        "requiredCapabilities": {
                            "extensions": tasks_extension_capability(),
                        }
                    },
                },
            )
        try:
            create = await run_tool_as_task(
                tool_name=body.name,
                arguments=body.arguments,
                server=body.server,
                runner=_run,
            )
            return {"success": True, **create}
        except Exception as e:
            raise HTTPException(400, str(e)) from e

    try:
        result = await _run()
        return {"success": True, "resultType": "call_tool", "result": result}
    except ValueError as e:
        raise HTTPException(404 if "not found" in str(e).lower() else 400, str(e)) from e


@router.get("/tasks/{task_id}")
async def tasks_get(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, f"unknown taskId: {task_id}")
    return to_get_task_result(task)


@router.post("/tasks/{task_id}/update")
async def tasks_update(task_id: str, body: TaskUpdateBody):
    try:
        return update_task(
            task_id,
            input_responses=body.input_responses or None,
            meta=body.meta or None,
        )
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/tasks/{task_id}/cancel")
async def tasks_cancel(task_id: str):
    try:
        return cancel_task(task_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/servers")
async def list_servers():
    return {"servers": list_external_servers()}


@router.post("/servers/connect")
async def connect_server(body: ConnectBody):
    result = await connect_external_server(body.name, body.base_url, body.api_key)
    if not result.get("success"):
        raise HTTPException(400, result.get("error", "connect failed"))
    return result


@router.post("/servers/{name}/disconnect")
async def disconnect_server(name: str):
    result = disconnect_external_server(name)
    if not result.get("success"):
        raise HTTPException(404, result.get("error", "not found"))
    return result
