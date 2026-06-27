from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..services.memory import (
    memory_read, memory_write, memory_delete, memory_replace, memory_list, memory_search, memory_extract_facts,
)

router = APIRouter(prefix="/api/v1/memory", tags=["记忆"])


class MemoryWriteBody(BaseModel):
    scope: str = "user"
    key: str
    value: str


class MemoryDeleteBody(BaseModel):
    scope: str = "user"
    key: str


class MemoryReplaceBody(BaseModel):
    scope: str = "user"
    old_fact: str
    new_fact: str


class MemoryExtractBody(BaseModel):
    text: str
    max_facts: int = 3
    scope: str = "user"


@router.get("/")
async def get_memories(scope: str = "user"):
    return {"scope": scope, "facts": memory_list(scope)}


@router.get("/read")
async def read_memory(scope: str = "user", key: str = ""):
    value = memory_read(scope, key)
    return {"key": key, "value": value, "found": value is not None}


@router.post("/write")
async def write_memory(body: MemoryWriteBody):
    memory_write(body.scope, body.key, body.value)
    return {"success": True}


@router.post("/delete")
async def delete_memory(body: MemoryDeleteBody):
    memory_delete(body.scope, body.key)
    return {"success": True}


@router.get("/search")
async def search_memory(scope: str = "user", q: str = "", limit: int = 10):
    results = memory_search(scope, q, limit)
    return {"results": results}


@router.post("/replace")
async def replace_memory(body: MemoryReplaceBody):
    ok = memory_replace(body.scope, body.old_fact, body.new_fact)
    return {"success": ok}


@router.post("/extract")
async def extract_memory(body: MemoryExtractBody):
    facts = memory_extract_facts(body.text, body.max_facts)
    written = []
    for fact in facts:
        key = f"fact_{hash(fact) % 1000000:06d}"
        memory_write(body.scope, key, fact)
        written.append({"key": key, "value": fact})
    return {"facts": written, "count": len(written)}
