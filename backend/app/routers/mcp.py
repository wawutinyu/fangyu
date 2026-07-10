from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.mcp import (
    get_internal_tools, get_internal_resources, call_internal_tool,
    list_external_servers, get_external_server, connect_external_server,
    disconnect_external_server,
)

router = APIRouter(prefix="/api/v1/mcp", tags=["MCP 协议"])


class ConnectBody(BaseModel):
    name: str
    base_url: str
    api_key: str = ""


class CallToolBody(BaseModel):
    server: str = "__internal__"
    name: str
    arguments: dict = {}


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
    if body.server == "__internal__":
        try:
            result = await call_internal_tool(body.name, body.arguments)
            return {"success": True, "result": result}
        except ValueError as e:
            raise HTTPException(404, str(e))
    conn = get_external_server(body.server)
    if not conn:
        raise HTTPException(404, f"MCP server '{body.server}' not found")
    try:
        result = await conn.call_tool(body.name, body.arguments)
        return {"success": True, "result": result}
    except ValueError as e:
        raise HTTPException(400, str(e))


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
