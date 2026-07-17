"""统一节点类型 executor — branch / memory / execute / register / mcp。"""
import json
from typing import Any

from .executor import register_executor, NodeContext
from .safe_expr import safe_eval, safe_eval_bool, safe_eval_int


def _parse_json_field(raw: Any, default: dict | None = None) -> dict:
    if default is None:
        default = {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else default
        except json.JSONDecodeError:
            return default
    return default


async def _ensure_internal_mcp():
    from .mcp import _INTERNAL_TOOLS, _init_internal_tools
    if not _INTERNAL_TOOLS:
        await _init_internal_tools()


async def _exec_branch(ctx: NodeContext) -> dict[str, Any]:
    mode = str(ctx.config.get("mode", "bool"))
    expr = ctx.config.get("expression", "input")
    resolved = ctx.inputs.get("input")
    eval_ctx = {"input": resolved, "inputs": ctx.inputs, "_outputs": ctx.all_outputs}
    if mode == "multi":
        branch_count = int(ctx.config.get("branch_count", 3))
        try:
            idx = safe_eval_int(expr, eval_ctx, default=0)
        except Exception:
            idx = 0
        idx = max(0, min(idx, branch_count - 1))
        return {"result": idx, "branch": f"branch_{idx}"}
    try:
        result = safe_eval_bool(expr, eval_ctx, default=bool(resolved))
    except Exception:
        result = bool(resolved)
    return {"result": result, "branch": "true" if result else "false", "true": result, "false": not result}


async def _exec_memory(ctx: NodeContext) -> dict[str, Any]:
    from .exec_memory import (
        _exec_extract_memory,
        _exec_memory_read,
        _exec_memory_write,
        _exec_memory_vector_search,
    )

    op = str(ctx.config.get("operation", "read"))
    if op == "write":
        patched = dict(ctx.inputs)
        if patched.get("value") is None and patched.get("input") is not None:
            patched["value"] = patched["input"]
        ctx.inputs = patched
        out = await _exec_memory_write(ctx)
        return {"result": out, **out}
    if op == "extract":
        patched = dict(ctx.inputs)
        if not patched.get("text") and patched.get("input") is not None:
            patched["text"] = patched["input"]
        ctx.inputs = patched
        out = await _exec_extract_memory(ctx)
        return {"result": out, **out}
    if op == "search":
        patched = dict(ctx.inputs)
        if not patched.get("query") and patched.get("input") is not None:
            patched["query"] = patched["input"]
        ctx.inputs = patched
        out = await _exec_memory_vector_search(ctx)
        return {"result": out, **out}
    out = await _exec_memory_read(ctx)
    return {"result": out.get("value"), **out}


async def _exec_execute(ctx: NodeContext) -> dict[str, Any]:
    from .exec_tools import _exec_execute_skill, _exec_tool_call

    mode = str(ctx.config.get("mode", "tool"))
    if mode == "skill":
        return await _exec_execute_skill(ctx)
    return await _exec_tool_call(ctx)


async def _exec_register(ctx: NodeContext) -> dict[str, Any]:
    from .exec_tools import _exec_learn_skill, _exec_register_tool

    mode = str(ctx.config.get("mode", "tool"))
    if mode == "skill":
        out = await _exec_learn_skill(ctx)
        return {"result": out, **out}
    out = await _exec_register_tool(ctx)
    return {"result": out, **out}


async def _exec_mcp_tools(ctx: NodeContext) -> dict[str, Any]:
    from .mcp import get_external_server, get_internal_tools

    server = str(ctx.config.get("server", "__internal__"))
    if server == "__internal__":
        await _ensure_internal_mcp()
        tools = get_internal_tools()
        return {"tools": tools, "result": tools}
    conn = get_external_server(server)
    if not conn:
        return {"error": f"MCP server '{server}' not found", "tools": []}
    tools = await conn.list_tools()
    return {"tools": tools, "result": tools}


async def _exec_mcp_call(ctx: NodeContext) -> dict[str, Any]:
    from .mcp import call_internal_tool, get_external_server

    server = str(ctx.inputs.get("server") or ctx.config.get("server", "__internal__"))
    tool_name = str(ctx.inputs.get("tool_name") or ctx.config.get("tool_name", ""))
    args = ctx.inputs.get("args")
    if args is None:
        args = _parse_json_field(ctx.config.get("args", "{}"))
    if not tool_name:
        return {"error": "tool_name is required"}
    if server == "__internal__":
        await _ensure_internal_mcp()
        try:
            result = await call_internal_tool(tool_name, args if isinstance(args, dict) else {})
            return {"result": result, "success": True}
        except ValueError as e:
            return {"error": str(e), "success": False}
    conn = get_external_server(server)
    if not conn:
        return {"error": f"MCP server '{server}' not found", "success": False}
    try:
        result = await conn.call_tool(tool_name, args if isinstance(args, dict) else {})
        return {"result": result, "success": True}
    except ValueError as e:
        return {"error": str(e), "success": False}


async def _exec_mcp(ctx: NodeContext) -> dict[str, Any]:
    op = str(ctx.config.get("operation", "list"))
    if op == "call":
        return await _exec_mcp_call(ctx)
    return await _exec_mcp_tools(ctx)


def register():
    register_executor("branch", _exec_branch)
    register_executor("memory", _exec_memory)
    register_executor("execute", _exec_execute)
    register_executor("register", _exec_register)
    register_executor("mcp-tools", _exec_mcp_tools)
    register_executor("mcp-call", _exec_mcp_call)
    register_executor("mcp", _exec_mcp)
