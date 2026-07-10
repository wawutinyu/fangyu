import json
import re
from typing import Any

from .executor import register_executor, _resolve_path, NodeContext
from .variable import variable_get as var_get, variable_set as var_set


async def _exec_json_parse(ctx: NodeContext) -> dict[str, Any]:
    source = ctx.inputs.get("source", ctx.config.get("source", ""))
    strict = ctx.config.get("strict", True)
    try:
        return {"result": json.loads(source) if isinstance(source, str) else source, "error": None}
    except (json.JSONDecodeError, TypeError) as e:
        if strict:
            return {"result": None, "error": str(e)}
        import ast
        try:
            return {"result": ast.literal_eval(source) if isinstance(source, str) else source, "error": None}
        except Exception:
            return {"result": None, "error": str(e)}


async def _exec_variable_set(ctx: NodeContext) -> dict[str, Any]:
    var_name = ctx.config.get("var_name", "var")
    if ctx.config.get("var_value") and (ctx.inputs.get("value") is None or ctx.inputs.get("value") is True):
        value = ctx.config.get("var_value")
    else:
        value = ctx.inputs.get("value")
    var_set(var_name, value)
    ctx.global_vars[var_name] = value
    return {"result": value, f"var_{var_name}": value}


async def _exec_variable_get(ctx: NodeContext) -> dict[str, Any]:
    var_name = ctx.config.get("var_name", "var")
    value = ctx.global_vars.get(var_name) or var_get(var_name)
    return {"value": value}


async def _exec_transform(ctx: NodeContext) -> dict[str, Any]:
    mapping = ctx.config.get("mapping", {})
    expr = ctx.config.get("expression", "")
    if expr:
        upstream_data = ctx.inputs.get("source", ctx.inputs.get("input", {}))
        if not isinstance(upstream_data, dict):
            upstream_data = {"result": upstream_data}
        try:
            result = eval(expr, {"__builtins__": {"len": len, "str": str, "int": int, "float": float, "list": list, "dict": dict, "range": range, "enumerate": enumerate, "zip": zip, "map": map, "filter": filter, "min": min, "max": max, "sum": sum, "sorted": sorted, "reversed": reversed, "True": True, "False": False, "None": None}}, {
                "data": upstream_data, "input": ctx.inputs.get("source", ctx.inputs), "_outputs": ctx.all_outputs,
            })
            if not isinstance(result, dict):
                result = {"result": result}
            return result
        except Exception as e:
            return {"result": None, "error": str(e)}
    source = ctx.inputs.get("source", {})
    if not isinstance(source, dict):
        source = {}
    result: dict[str, Any] = {}
    for key, val in mapping.items():
        result[key] = _resolve_path(source, val)
    return {"result": result}


async def _exec_text_process(ctx: NodeContext) -> dict[str, Any]:
    op = ctx.config.get("operation", "concat")
    text = ctx.inputs.get("text", "")
    if op == "concat":
        return {"result": text + ctx.config.get("separator", "")}
    elif op == "split":
        return {"result": text.split(config.get("separator", ","))}
    elif op == "replace":
        pattern = config.get("pattern", "")
        replacement = config.get("replacement", "")
        return {"result": re.sub(pattern, replacement, text)}
    elif op == "trim":
        return {"result": text.strip()}
    elif op in ("uppercase", "upper"):
        return {"result": text.upper()}
    elif op in ("lowercase", "lower"):
        return {"result": text.lower()}
    return {"result": text}


def register():
    register_executor("json-parse", _exec_json_parse)
    register_executor("variable-set", _exec_variable_set)
    register_executor("variable-get", _exec_variable_get)
    register_executor("transform", _exec_transform)
    register_executor("text-process", _exec_text_process)
