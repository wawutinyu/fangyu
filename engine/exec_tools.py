import json
import re as _re
from typing import Any

from .executor import register_executor, _smart_template, NodeContext
from .tool_registry import execute_tool, register_from_llm_output as parse_tools
from .skill import get_skill_content, learn_from_llm as learn_skills
from .sandbox import run_code


async def _exec_http(ctx: NodeContext) -> dict[str, Any]:
    import httpx
    url = ctx.inputs.get("url") or ctx.config.get("url", "")
    if not url:
        raise ValueError("URL 为空")
    url = _smart_template(url, ctx.all_outputs, ctx.inputs, ctx.external_inputs, ctx.global_vars)
    method = ctx.config.get("method", "GET")
    headers = ctx.config.get("headers", {})
    body = ctx.config.get("body", ctx.inputs.get("body"))
    if isinstance(body, str):
        body = _smart_template(body, ctx.all_outputs, ctx.inputs, ctx.external_inputs, ctx.global_vars)
        try:
            body = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            pass
    timeout = ctx.config.get("timeout", 10000)

    async with httpx.AsyncClient(timeout=timeout / 1000) as client:
        try:
            resp = await client.request(
                method=method, url=url,
                headers={**headers, "Content-Type": "application/json"} if isinstance(headers, dict) else {"Content-Type": "application/json"},
                json=body if method != "GET" and body else None,
            )
            try:
                data = resp.json()
            except Exception:
                data = resp.text
            return {"status": resp.status_code, "data": data, "headers": dict(resp.headers)}
        except httpx.RequestError as e:
            raise ValueError(f"HTTP 请求失败: {e}")


async def _exec_tool_call(ctx: NodeContext) -> dict[str, Any]:
    tool_name = ctx.inputs.get("tool_name") or ctx.config.get("tool_name", "")
    args = ctx.inputs.get("args", ctx.config.get("args", {}))
    if not tool_name:
        candidates = [v for v in ctx.inputs.values() if isinstance(v, str)]
        llm_out = ctx.global_vars.get("_lastLLMOutput", "")
        if llm_out:
            candidates.append(llm_out)
        for v in candidates:
            m = _re.search(r'```(?:json)?\s*\n?(\{.*?"(?:tool|tool_name|function)".*?\})\s*\n?```', v, _re.DOTALL)
            if not m:
                m = _re.search(r'\{[\s\n]*"(?:tool|tool_name)"[\s\n]*:[\s\n]*"([^"]+)"[\s\n]*,[\s\n]*"args"[\s\n]*:[\s\n]*(\{.*?\})[\s\n]*\}', v, _re.DOTALL)
            if m:
                try:
                    parsed = json.loads(m.group(1))
                    tool_name = parsed.get("tool", parsed.get("tool_name", ""))
                    args = parsed.get("args", {})
                    if not tool_name:
                        func = parsed.get("function", {})
                        if func.get("name"):
                            tool_name = func["name"]
                            raw_args = func.get("arguments", "{}")
                            if isinstance(raw_args, str):
                                try:
                                    args = json.loads(raw_args) if raw_args.strip() else {}
                                except json.JSONDecodeError:
                                    args = {}
                            elif isinstance(raw_args, dict):
                                args = raw_args
                except json.JSONDecodeError:
                    pass
                break
    try:
        result = await execute_tool(str(tool_name), args, ctx.global_vars)
        return {"result": result, "success": True}
    except ValueError as e:
        return {"result": None, "error": str(e), "success": False}


async def _exec_register_tool(ctx: NodeContext) -> dict[str, Any]:
    llm_output = ctx.inputs.get("llm_output", ctx.config.get("llm_output", ""))
    if not llm_output:
        llm_output = ctx.global_vars.get("_lastLLMOutput", "")
    warnings: list[str] = []
    try:
        from fangyu.core.llm_validator import validate_tool_registration_payload

        vr = validate_tool_registration_payload(str(llm_output))
        if vr.warned and vr.error:
            warnings.append(vr.error)
        if not vr.passed:
            return {
                "tools": [],
                "count": 0,
                "error": vr.error,
                "validator_warnings": warnings,
                "success": False,
            }
    except Exception:
        pass
    results = parse_tools(str(llm_output))
    out = {"tools": results, "count": len(results)}
    if warnings:
        out["validator_warnings"] = warnings
    return out


async def _exec_execute_skill(ctx: NodeContext) -> dict[str, Any]:
    skill_name = ctx.inputs.get("skill_name") or ctx.config.get("skill_name", "")
    params = ctx.inputs.get("params", ctx.config.get("params", {}))
    content = get_skill_content(str(skill_name))
    if content is None:
        return {"result": None, "error": f"技能 '{skill_name}' 不存在", "success": False}
    skill_code = content
    if "```python" in content:
        m = _re.search(r"```python\n(.*?)\n```", content, _re.DOTALL)
        if m:
            skill_code = m.group(1)
    try:
        result = await run_code(skill_code, input_data=params if isinstance(params, dict) else {}, params=params if isinstance(params, dict) else {})
        if result.get("error"):
            return {"result": None, "error": result["error"], "success": False}
        return {"result": result.get("result"), "success": True, "logs": result.get("logs", [])}
    except Exception as e:
        return {"result": None, "error": str(e), "success": False}


async def _exec_learn_skill(ctx: NodeContext) -> dict[str, Any]:
    llm_output = ctx.inputs.get("llm_output", ctx.config.get("llm_output", ""))
    if not llm_output:
        llm_output = ctx.global_vars.get("_lastLLMOutput", "")
    results = learn_skills(str(llm_output))
    return {"skills": results, "count": len(results)}


def register():
    register_executor("http", _exec_http)
    register_executor("tool-call", _exec_tool_call)
    register_executor("register-tool", _exec_register_tool)
    register_executor("execute-skill", _exec_execute_skill)
    register_executor("learn-skill", _exec_learn_skill)
