import json
import re as _re
import hashlib
from typing import Any

from .executor import register_executor, _smart_template, _resolve_path, NodeContext
from .llm import chat_completion, PROVIDER_MAP, PROVIDER_BASE_URL
from .sandbox import run_code
from .knowledge import search_chunks
from .memory import memory_read, memory_write, memory_extract_facts, memory_list
from .skill import list_skills as get_skills
from .variable import variable_get as var_get, variable_set as var_set


async def _exec_llm(ctx: NodeContext) -> dict[str, Any]:
    prompt = _smart_template(ctx.config.get("prompt", ""), ctx.all_outputs, ctx.inputs, ctx.external_inputs, ctx.global_vars)
    system_prompt = _smart_template(ctx.config.get("system_prompt", ""), ctx.all_outputs, ctx.inputs, ctx.external_inputs, ctx.global_vars)
    model = ctx.config.get("model", "gpt-4o")
    user_content = prompt or ctx.inputs.get("input") or ""

    auto_inject = ctx.config.get("auto_inject_memory", False)
    if auto_inject:
        inject_parts = []
        if not system_prompt:
            facts = memory_list("user")
            if facts:
                lines = [f"- {f['key']}: {f['value']}" for f in facts]
                inject_parts.append("## 用户记忆\n" + "\n".join(lines))
        skills = get_skills()
        if skills:
            skill_lines = [f"- {s['name']}: {s.get('description', '')}" for s in skills[:20]]
            inject_parts.append("## 已注册技能\n" + "\n".join(skill_lines))
        session_notes = var_get("session_notes")
        if session_notes:
            inject_parts.append(f"## 会话上下文\n{session_notes}")
        if inject_parts:
            system_prompt = (system_prompt + "\n\n" if system_prompt else "") + "\n\n".join(inject_parts)

    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    history = ctx.global_vars.get("_chatHistory", [])
    messages.extend(history)
    messages.append({"role": "user", "content": str(user_content)})

    provider_id = PROVIDER_MAP.get(model, "openai")
    from ..core.config import settings as env_settings
    db_key = ctx.global_vars.get(f"{provider_id}_api_key", "")
    env_key = getattr(env_settings, f"{provider_id.upper()}_API_KEY", "")
    api_key = ctx.config.get("api_key") or db_key or env_key or ""
    db_base = ctx.global_vars.get(f"{provider_id}_base_url", "")
    base_url = db_base or PROVIDER_BASE_URL.get(provider_id, "")

    result = await chat_completion(
        model=model, messages=messages, api_key=api_key, base_url=base_url,
        temperature=ctx.config.get("temperature", 0.7), max_tokens=ctx.config.get("max_tokens", 2048),
        thinking_mode=ctx.config.get("thinking_mode", False), reasoning_effort=ctx.config.get("reasoning_effort", "medium"),
        top_p=ctx.config.get("top_p"), frequency_penalty=ctx.config.get("frequency_penalty"),
        presence_penalty=ctx.config.get("presence_penalty"),
    )

    content = result.get("result", "")
    ctx.global_vars["_lastLLMOutput"] = content
    if "_chatHistory" not in ctx.global_vars:
        ctx.global_vars["_chatHistory"] = []
    ctx.global_vars["_chatHistory"].append({"role": "user", "content": str(user_content)})
    ctx.global_vars["_chatHistory"].append({"role": "assistant", "content": content})

    if auto_inject and content:
        try:
            facts = memory_extract_facts(content, max_facts=3)
            for fact in facts:
                k = f"fact_{hashlib.md5(fact.encode()).hexdigest()[:6]}"
                memory_write("user", k, fact)
        except Exception:
            pass

    return {"result": content, "usage": result.get("usage", {})}


async def _exec_code(ctx: NodeContext) -> dict[str, Any]:
    code = ctx.config.get("code", "")
    timeout = ctx.config.get("timeout", 10000)
    input_val = ctx.inputs.get("input")
    if isinstance(input_val, str):
        input_data = input_val
    elif isinstance(input_val, dict):
        input_data = {**ctx.external_inputs, **input_val}
    else:
        input_data = {**ctx.external_inputs, **ctx.inputs}
    result = await run_code(
        code=code, input_data=input_data,
        params=ctx.inputs.get("params", {}), timeout=max(1, min(30, timeout // 1000)),
    )
    return {"result": result.get("result"), "error": result.get("error"), "logs": result.get("logs", [])}


async def _exec_knowledge(ctx: NodeContext) -> dict[str, Any]:
    query = ctx.inputs.get("query", "")
    top_k = int(ctx.config.get("top_k", 5))
    min_score = float(ctx.config.get("min_score", 0.0))
    chunks = ctx.global_vars.get("_knowledge_chunks") or ctx.config.get("chunks") or []
    if not isinstance(chunks, list):
        chunks = []
    try:
        results = await search_chunks(chunks, str(query), top_k)
        if min_score > 0:
            results = [r for r in results if r.get("score", 1.0) >= min_score]
        context = "\n\n".join(f'[{i + 1}] {m.get("content", "")}' for i, m in enumerate(results))
        return {"results": results, "context": context}
    except Exception:
        return {"results": [], "context": "[知识库检索失败]"}


async def _exec_search(ctx: NodeContext) -> dict[str, Any]:
    import httpx
    query = ctx.inputs.get("query", "")
    if not query:
        return {"results": [], "summary": ""}
    top_k = min(int(ctx.config.get("top_k", 5)), 10)
    source = ctx.config.get("source", "web")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    def _parse_bing_html(html: str, max_k: int) -> list[dict]:
        results = []
        for block in _re.finditer(r'<li class="b_algo"[^>]*>(.*?)</li>', html, _re.DOTALL):
            if len(results) >= max_k:
                break
            block_html = block.group(1)
            title_m = _re.search(r'<h2[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', block_html, _re.DOTALL)
            snippet_m = _re.search(r'<p[^>]*class="b_lineclamp[^"]*"[^>]*>(.*?)</p>', block_html, _re.DOTALL)
            if title_m:
                href = title_m.group(1)
                title = _re.sub(r'<[^>]+>', '', title_m.group(2)).strip()
                snippet = _re.sub(r'<[^>]+>', '', snippet_m.group(1)).strip() if snippet_m else ""
                results.append({"title": title, "snippet": snippet, "url": href})
        return results

    if source in ("web", "news"):
        params = {"q": query}
        if source == "news":
            params["freshness"] = "Day"
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get("https://www.bing.com/search", params=params, headers=headers)
                if resp.status_code == 200:
                    results = _parse_bing_html(resp.text, top_k)
                    if results:
                        return {"results": results, "summary": f'搜索 "{query}" 返回 {len(results)} 条结果。'}
        except Exception:
            pass

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get("https://www.bing.com/search", params={"q": query}, headers=headers)
            if resp.status_code == 200:
                results = _parse_bing_html(resp.text, top_k)
                if results:
                    return {"results": results, "summary": f'搜索 "{query}" 返回 {len(results)} 条结果。'}
    except Exception:
        pass

    return {"results": [], "summary": f'搜索 "{query}" 无结果。'}


async def _exec_prompt_assembly(ctx: NodeContext) -> dict[str, Any]:
    stable = ctx.config.get("stable", "")
    context = ctx.inputs.get("context", ctx.config.get("context", ""))
    volatile = ctx.inputs.get("volatile", ctx.config.get("volatile", ""))
    assembled = ""
    if stable:
        assembled += stable + "\n"
    if context:
        assembled += "\n---\n" + context + "\n"
    if volatile:
        assembled += "\n---\n" + volatile + "\n"
    return {"assembled": assembled.strip()}


def register():
    register_executor("llm", _exec_llm)
    register_executor("code", _exec_code)
    register_executor("knowledge", _exec_knowledge)
    register_executor("search", _exec_search)
    register_executor("prompt-assembly", _exec_prompt_assembly)
