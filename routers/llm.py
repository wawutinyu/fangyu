from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models.database import get_session
from ..models.setting import Setting
from ..core.config import settings as env_settings
from fangyu.engine.llm import chat_completion, chat_completion_stream, get_provider, PROVIDER_BASE_URL

router = APIRouter(prefix="/api/v1/llm", tags=["LLM 代理"])


class ChatRequest(BaseModel):
    model: str = 'gpt-4o'
    messages: list = []
    temperature: float = 0.7
    max_tokens: int = 2048
    thinking_mode: bool = False
    reasoning_effort: str = 'medium'


async def _resolve_credentials(provider_id: str, db: AsyncSession) -> tuple[str, str]:
    provider_prefix = provider_id.lower()

    api_key_from_db = ''
    base_url_from_db = ''
    result = await db.execute(
        select(Setting).where(Setting.key.in_([f'{provider_prefix}_api_key', f'{provider_prefix}_base_url']))
    )
    for row in result.scalars().all():
        if row.key.endswith('_api_key'):
            api_key_from_db = row.value
        elif row.key.endswith('_base_url'):
            base_url_from_db = row.value

    api_key = api_key_from_db or getattr(env_settings, f'{provider_prefix.upper()}_API_KEY', '')
    base_url = base_url_from_db or PROVIDER_BASE_URL.get(provider_id, '')

    return api_key, base_url


@router.post("/chat")
async def llm_chat(req: ChatRequest, db: AsyncSession = Depends(get_session)):
    provider_id = get_provider(req.model)
    api_key, base_url = await _resolve_credentials(provider_id, db)

    result = await chat_completion(
        model=req.model,
        messages=req.messages,
        api_key=api_key,
        base_url=base_url,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        thinking_mode=req.thinking_mode,
        reasoning_effort=req.reasoning_effort,
    )
    return result


@router.post("/chat/stream")
async def llm_chat_stream(req: ChatRequest, db: AsyncSession = Depends(get_session)):
    provider_id = get_provider(req.model)
    api_key, base_url = await _resolve_credentials(provider_id, db)

    return StreamingResponse(
        chat_completion_stream(
            model=req.model,
            messages=req.messages,
            api_key=api_key,
            base_url=base_url,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            thinking_mode=req.thinking_mode,
            reasoning_effort=req.reasoning_effort,
        ),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    )


@router.get("/models")
async def list_models():
    return {
        "models": [
            {"id": "gpt-4o", "provider": "openai", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "provider": "openai", "name": "GPT-4o Mini"},
            {"id": "deepseek-v4-flash", "provider": "deepseek", "name": "DeepSeek V4 Flash"},
            {"id": "deepseek-v4-pro", "provider": "deepseek", "name": "DeepSeek V4 Pro"},
            {"id": "claude-3.5-sonnet", "provider": "anthropic", "name": "Claude 3.5 Sonnet"},
        ]
    }
