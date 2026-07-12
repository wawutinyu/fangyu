import hashlib
from typing import Any

from .executor import register_executor, NodeContext
from .memory import memory_read, memory_write, memory_extract_facts, memory_list
from .search import index_message, search_messages


async def _exec_memory_read(ctx: NodeContext) -> dict[str, Any]:
    scope = ctx.config.get("scope", "user")
    key = ctx.inputs.get("key") or ctx.config.get("memory_key", "")
    val = memory_read(scope, key) if key else None
    return {"value": val}


async def _exec_memory_write(ctx: NodeContext) -> dict[str, Any]:
    scope = ctx.config.get("scope", "user")
    key = ctx.inputs.get("key") or ctx.config.get("memory_key", "")
    val = ctx.inputs.get("value") or ctx.inputs.get("input") or ctx.config.get("memory_value", "")
    if key and val is not None:
        memory_write(scope, key, str(val))
    return {"success": bool(key)}


async def _exec_extract_memory(ctx: NodeContext) -> dict[str, Any]:
    text = ctx.inputs.get("text") or ctx.inputs.get("input") or ctx.config.get("text", "")
    max_facts = ctx.config.get("max_facts", 3)
    scope = ctx.config.get("scope", "user")
    facts = memory_extract_facts(str(text), max_facts)
    written = []
    for fact in facts:
        k = f"fact_{hashlib.md5(fact.encode()).hexdigest()[:6]}"
        memory_write(scope, k, fact)
        written.append({"key": k, "value": fact})
    return {"facts": written, "count": len(written)}


async def _exec_search_sessions(ctx: NodeContext) -> dict[str, Any]:
    query = ctx.inputs.get("query", ctx.config.get("query", ""))
    limit = ctx.config.get("limit", 10)
    session_id = ctx.inputs.get("session_id") or None
    results = search_messages(str(query), session_id, int(limit))
    return {"results": results, "count": len(results)}


def register():
    register_executor("memory-read", _exec_memory_read)
    register_executor("memory-write", _exec_memory_write)
    register_executor("extract-memory", _exec_extract_memory)
    register_executor("search-sessions", _exec_search_sessions)
