import json
import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# JSON-RPC 2.0 message helpers
# ---------------------------------------------------------------------------

def make_request(method: str, params: dict | None = None, msg_id: str | None = None) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": msg_id or str(uuid.uuid4()),
        "method": method,
        "params": params or {},
    }

def make_response(result: Any, msg_id: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}

def make_error(code: int, message: str, msg_id: str | None = None) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}

# ---------------------------------------------------------------------------
# Internal MCP server wrappers around our own tools / resources
# ---------------------------------------------------------------------------

class McpTool:
    def __init__(self, name: str, description: str, input_schema: dict, handler: callable):
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.handler = handler

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
        }


class McpResource:
    def __init__(self, uri: str, name: str, description: str, mime_type: str = "text/plain"):
        self.uri = uri
        self.name = name
        self.description = description
        self.mime_type = mime_type

    def to_dict(self) -> dict:
        return {
            "uri": self.uri,
            "name": self.name,
            "description": self.description,
            "mimeType": self.mime_type,
        }


_INTERNAL_TOOLS: dict[str, McpTool] = {}
_INTERNAL_RESOURCES: dict[str, McpResource] = {}


def register_internal_tool(tool: McpTool):
    _INTERNAL_TOOLS[tool.name] = tool


def register_internal_resource(resource: McpResource):
    _INTERNAL_RESOURCES[resource.uri] = resource


def get_internal_tools() -> list[dict]:
    return [t.to_dict() for t in _INTERNAL_TOOLS.values()]


def get_internal_resources() -> list[dict]:
    return [r.to_dict() for r in _INTERNAL_RESOURCES.values()]


async def call_internal_tool(name: str, arguments: dict) -> Any:
    tool = _INTERNAL_TOOLS.get(name)
    if not tool:
        raise ValueError(f"MCP tool '{name}' not found")
    return await tool.handler(arguments)


# ---------------------------------------------------------------------------
# External MCP server connection management
# ---------------------------------------------------------------------------

class McpServerConnection:
    def __init__(self, name: str, base_url: str, api_key: str = ""):
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._tools_cache: list[dict] | None = None

    async def _request(self, method: str, params: dict | None = None) -> dict:
        import httpx
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        body = make_request(method, params)
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{self.base_url}/mcp/v1/messages", json=body, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def list_tools(self) -> list[dict]:
        if self._tools_cache is not None:
            return self._tools_cache
        result = await self._request("tools/list")
        if "error" in result:
            logger.warning(f"MCP server '{self.name}' list_tools error: {result['error']}")
            return []
        self._tools_cache = result.get("result", {}).get("tools", [])
        return self._tools_cache

    async def call_tool(self, name: str, arguments: dict) -> Any:
        self._tools_cache = None
        result = await self._request("tools/call", {"name": name, "arguments": arguments})
        if "error" in result:
            raise ValueError(f"MCP tool call '{name}' failed: {result['error']}")
        return result.get("result")

    def invalidate_cache(self):
        self._tools_cache = None

    def to_dict(self) -> dict:
        return {"name": self.name, "base_url": self.base_url, "connected": True}


_EXTERNAL_SERVERS: dict[str, McpServerConnection] = {}


def list_external_servers() -> list[dict]:
    return [s.to_dict() for s in _EXTERNAL_SERVERS.values()]


def get_external_server(name: str) -> McpServerConnection | None:
    return _EXTERNAL_SERVERS.get(name)


async def connect_external_server(name: str, base_url: str, api_key: str = "") -> dict:
    if name in _EXTERNAL_SERVERS:
        return {"success": False, "error": f"MCP server '{name}' already connected"}
    conn = McpServerConnection(name, base_url, api_key)
    try:
        tools = await conn.list_tools()
    except Exception as e:
        return {"success": False, "error": f"Failed to connect: {e}"}
    _EXTERNAL_SERVERS[name] = conn
    return {"success": True, "server": conn.to_dict(), "tools": tools}


def disconnect_external_server(name: str) -> dict:
    if name not in _EXTERNAL_SERVERS:
        return {"success": False, "error": f"MCP server '{name}' not found"}
    del _EXTERNAL_SERVERS[name]
    return {"success": True}


# ---------------------------------------------------------------------------
# Bootstrap: register internal tools from ToolRegistry
# ---------------------------------------------------------------------------

async def _init_internal_tools():
    from .tool_registry import list_tools
    from .tool_registry import execute_tool as registry_execute

    for t in list_tools():
        if not t.get("enabled", True):
            continue
        mcp_tool = McpTool(
            name=t["name"],
            description=t.get("description", ""),
            input_schema=t.get("parameters", {"type": "object", "properties": {}}),
            handler=lambda args, _t=t: registry_execute(_t["name"], args, {}),
        )
        if mcp_tool.name not in _INTERNAL_TOOLS:
            register_internal_tool(mcp_tool)
