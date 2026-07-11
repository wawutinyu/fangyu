from fastapi import APIRouter, Query
from pydantic import BaseModel

from fangyu.engine.search import index_message, search_messages

router = APIRouter(prefix="/api/v1/search", tags=["搜索"])


class IndexBody(BaseModel):
    session_id: str = "default"
    role: str
    content: str


@router.post("/index")
async def index_conversation(body: IndexBody):
    index_message(body.session_id, body.role, body.content)
    return {"success": True}


@router.get("/messages")
async def search_conversations(q: str = "", session_id: str | None = None, limit: int = 10):
    results = search_messages(q, session_id, limit)
    return {"results": results}
