"""engine.llm — provider 映射与无 key 时的 fail-soft（不打外网）"""
import asyncio

from fangyu.engine.llm import (
    PROVIDER_BASE_URL,
    _build_body,
    _build_headers,
    chat_completion,
    get_provider,
)


def test_get_provider_known_models():
    assert get_provider("deepseek-chat") == "deepseek"
    assert get_provider("gpt-4o") == "openai"
    assert get_provider("claude-3.5-sonnet") == "anthropic"
    assert get_provider("moonshot-v1-8k") == "moonshot"
    assert get_provider("unknown-model-xyz") == "openai"


def test_provider_base_urls_present():
    for name in ("openai", "deepseek", "anthropic", "moonshot"):
        assert name in PROVIDER_BASE_URL
        assert PROVIDER_BASE_URL[name].startswith("http")


def test_build_headers_openai_vs_anthropic():
    oa = _build_headers("sk-test", "openai")
    assert oa["Authorization"] == "Bearer sk-test"
    an = _build_headers("sk-ant", "anthropic")
    assert an["x-api-key"] == "sk-ant"
    assert "anthropic-version" in an


def test_build_body_openai_compat_and_deepseek_thinking():
    msgs = [{"role": "user", "content": "hi"}]
    body = _build_body("deepseek-chat", msgs, 0.5, 100, True, "high", "deepseek")
    assert body["thinking"] == {"type": "enabled"}
    assert body["reasoning_effort"] == "high"
    assert body["temperature"] == 0.5


def test_build_body_anthropic_extracts_system():
    msgs = [
        {"role": "system", "content": "be brief"},
        {"role": "user", "content": "hi"},
    ]
    body = _build_body("claude-3.5-sonnet", msgs, 0.2, 50, False, "", "anthropic")
    assert body["system"] == "be brief"
    assert body["messages"] == [{"role": "user", "content": "hi"}]
    assert "temperature" in body


def test_chat_completion_empty_api_key():
    async def _run():
        return await chat_completion(
            model="deepseek-chat",
            messages=[{"role": "user", "content": "hi"}],
            api_key="",
            base_url="https://api.deepseek.com",
        )

    out = asyncio.run(_run())
    assert "API Key" in out["result"]
    assert out["usage"] == {}
