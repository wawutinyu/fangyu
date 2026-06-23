"""
fangyu LLM API 代理模块
========================
功能：前端 LLM 调用不直接请求 OpenAI/DeepSeek 等外部 API，
       而是通过此代理转发，避免 API Key 在浏览器端暴露。

安全设计：
- 浏览器 → 后端（携带会话 cookie/token）
- 后端 → LLM API（携带 API Key，Key 仅存在于后端内存/数据库中）
- 前端永远拿不到原始的 API Key

当前状态：骨架代码，后续实现完整转发逻辑。

支持的流式响应：
使用 Server-Sent Events (SSE) 实现逐 token 返回。
前端通过 EventSource 或 fetch + ReadableStream 接收。
SSE 格式：
  data: {"token": "你好"}\n\n
  data: {"token": "世界"}\n\n
  data: [DONE]\n\n

注意事项：
- 所有 LLM 提供商使用 /v1/chat/completions 兼容接口。
- DeepSeek 额外支持 thinking 和 reasoning_effort 参数。
- Anthropic 使用 /v1/messages 接口（不兼容 OpenAI 格式）。
"""

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/llm", tags=["LLM 代理"])


@router.post("/chat")
async def llm_chat():
    """
    LLM 聊天接口（非流式）
    ======================
    代理前端请求到 LLM API，返回完整响应。

    请求体格式：
    {
        "provider": "openai|deepseek|anthropic|custom",
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "你好"}],
        "temperature": 0.7,
        "max_tokens": 2048,
        "thinking_mode": false,
        "reasoning_effort": "medium"
    }

    响应格式：
    {
        "result": "生成的文本内容",
        "usage": {"prompt_tokens": 50, "completion_tokens": 100}
    }

    后续实现流程：
    1. 解析请求体，获取 provider/model/messages 等参数。
    2. 根据 provider 从数据库或环境变量获取 API Key 和 Base URL。
    3. 调用对应的 API（OpenAI 兼容 / Anthropic 原生）。
    4. 返回结果和 token 用量。

    错误处理：
    - API Key 不存在：返回 400 "请先设置 API Key"。
    - API 返回 401：提示 "API Key 无效"。
    - API 超时：返回 504 "请求超时"。
    """
    return {"result": "", "usage": {}}


@router.get("/models")
async def list_models():
    """
    获取模型列表
    =============
    返回所有已知的模型名称及其所属提供商。
    前端用于 LLM 节点的模型选择下拉框。

    当前返回静态列表（硬编码），
    后续可改为从各提供商 API 动态获取可用模型列表。

    响应格式：
    {
        "models": [
            {"id": "gpt-4o", "provider": "openai", "name": "GPT-4o"},
            {"id": "deepseek-chat", "provider": "deepseek", "name": "DeepSeek Chat"}
        ]
    }

    模型更新方式：
    修改此函数中的静态列表即可。
    新增提供商时，同步更新 models 列表和 PROVIDER_MAP（executor.js）。
    """
    return {
        "models": [
            # OpenAI
            {"id": "gpt-4o", "provider": "openai", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "provider": "openai", "name": "GPT-4o Mini"},
            # DeepSeek
            {"id": "deepseek-v4-flash", "provider": "deepseek", "name": "DeepSeek V4 Flash"},
            {"id": "deepseek-v4-pro", "provider": "deepseek", "name": "DeepSeek V4 Pro"},
            # Claude
            {"id": "claude-3.5-sonnet", "provider": "anthropic", "name": "Claude 3.5 Sonnet"},
        ]
    }
