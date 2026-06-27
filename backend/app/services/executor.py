import json
import asyncio
import re
from typing import Any

import httpx

from .llm import chat_completion, PROVIDER_MAP, PROVIDER_BASE_URL
from .sandbox import run_code
from .memory import memory_read, memory_write, memory_extract_facts, memory_list
from .search import index_message, search_messages
from .tool_registry import execute_tool, register_from_llm_output as parse_tools, list_tools
from .skill import get_skill_content, learn_from_llm as learn_skills, list_skills
from .variable import variable_get as var_get, variable_set as var_set
from ..models.database import get_session


NODE_REGISTRY: dict[str, dict[str, Any]] = {}


def _register_node_type(type_name: str, name: str, category: str, input_schema: list[dict], output_schema: list[dict]):
    NODE_REGISTRY[type_name] = {
        "name": name,
        "category": category,
        "inputSchema": input_schema,
        "outputSchema": output_schema,
    }


def _init_registry():
    schemas = {
        "start": ("开始", "流程控制",
            [], [{"name": "trigger", "type": "any"}]),
        "end": ("结束", "流程控制",
            [{"name": "input", "type": "any", "required": True}], []),
        "condition": ("条件分支", "流程控制",
            [{"name": "input", "type": "any", "required": True}],
            [{"name": "true", "type": "any"}, {"name": "false", "type": "any"}]),
        "switch": ("多路分支", "流程控制",
            [{"name": "input", "type": "any", "required": True}],
            [{"name": "default", "type": "any"}]),
        "loop": ("循环", "流程控制",
            [{"name": "array", "type": "array", "required": True}, {"name": "body", "type": "any"}],
            [{"name": "result", "type": "array"}]),
        "trigger": ("触发器", "流程控制",
            [{"name": "message", "type": "string"}],
            [{"name": "message", "type": "string"}, {"name": "triggered", "type": "boolean"}]),
        "llm": ("大模型调用", "AI 能力",
            [{"name": "input", "type": "string"}, {"name": "system_prompt", "type": "string"}, {"name": "context", "type": "array"}],
            [{"name": "result", "type": "string"}, {"name": "usage", "type": "object"}]),
        "code": ("代码执行", "AI 能力",
            [{"name": "input", "type": "any"}, {"name": "params", "type": "object"}],
            [{"name": "result", "type": "any"}, {"name": "error", "type": "string"}]),
        "knowledge": ("知识库检索", "AI 能力",
            [{"name": "query", "type": "string", "required": True}],
            [{"name": "results", "type": "array"}, {"name": "context", "type": "string"}]),
        "prompt-assembly": ("提示词组装", "AI 能力",
            [{"name": "context", "type": "string"}, {"name": "volatile", "type": "string"}],
            [{"name": "assembled", "type": "string"}]),
        "http": ("HTTP 请求", "工具集成",
            [{"name": "url", "type": "string"}, {"name": "body", "type": "any"}, {"name": "headers", "type": "object"}],
            [{"name": "status", "type": "number"}, {"name": "data", "type": "any"}, {"name": "headers", "type": "object"}]),
        "search": ("搜索引擎", "工具集成",
            [{"name": "query", "type": "string", "required": True}],
            [{"name": "results", "type": "array"}, {"name": "summary", "type": "string"}]),
        "json-parse": ("JSON 解析", "工具集成",
            [{"name": "source", "type": "string", "required": True}],
            [{"name": "result", "type": "object"}, {"name": "error", "type": "string"}]),
        "tool-call": ("工具调用", "工具集成",
            [{"name": "tool_name", "type": "string"}, {"name": "args", "type": "object"}],
            [{"name": "result", "type": "any"}, {"name": "success", "type": "boolean"}]),
        "register-tool": ("工具注册", "工具集成",
            [{"name": "llm_output", "type": "string"}],
            [{"name": "tools", "type": "array"}, {"name": "count", "type": "number"}]),
        "execute-skill": ("技能执行", "工具集成",
            [{"name": "skill_name", "type": "string"}, {"name": "params", "type": "object"}],
            [{"name": "result", "type": "any"}, {"name": "success", "type": "boolean"}]),
        "learn-skill": ("技能学习", "工具集成",
            [{"name": "llm_output", "type": "string"}],
            [{"name": "skills", "type": "array"}, {"name": "count", "type": "number"}]),
        "variable-set": ("设置变量", "数据操作",
            [{"name": "value", "type": "any", "required": True}],
            [{"name": "result", "type": "any"}]),
        "variable-get": ("读取变量", "数据操作",
            [], [{"name": "value", "type": "any"}]),
        "transform": ("数据转换", "数据操作",
            [{"name": "source", "type": "any", "required": True}],
            [{"name": "result", "type": "any"}]),
        "text-process": ("文本处理", "数据操作",
            [{"name": "text", "type": "string", "required": True}],
            [{"name": "result", "type": "string"}]),
        "memory-read": ("记忆读取", "记忆存储",
            [{"name": "key", "type": "string"}],
            [{"name": "value", "type": "any"}]),
        "memory-write": ("记忆写入", "记忆存储",
            [{"name": "key", "type": "string"}, {"name": "value", "type": "any", "required": True}],
            [{"name": "success", "type": "boolean"}]),
        "extract-memory": ("事实提取", "记忆存储",
            [{"name": "text", "type": "string", "required": True}],
            [{"name": "facts", "type": "array"}, {"name": "count", "type": "number"}]),
        "search-sessions": ("会话搜索", "记忆存储",
            [{"name": "query", "type": "string", "required": True}, {"name": "session_id", "type": "string"}],
            [{"name": "results", "type": "array"}, {"name": "count", "type": "number"}]),
        "input": ("输入", "流程控制",
            [], [{"name": "input", "type": "any"}]),
        "output": ("输出", "流程控制",
            [{"name": "input", "type": "any", "required": True}], []),
    }
    for type_name, (name, category, input_schema, output_schema) in schemas.items():
        _register_node_type(type_name, name, category, input_schema, output_schema)


_init_registry()


def _get_meta(node_type: str) -> dict[str, Any]:
    if node_type in NODE_REGISTRY:
        return NODE_REGISTRY[node_type]
    return {
        "name": node_type,
        "category": "其他",
        "inputSchema": [{"name": "input", "type": "any", "required": False}],
        "outputSchema": [{"name": "result", "type": "any"}],
    }


def _topo_sort(node_ids: list[str], edges: list[dict]) -> list[str]:
    adj: dict[str, list[str]] = {nid: [] for nid in node_ids}
    in_deg: dict[str, int] = {nid: 0 for nid in node_ids}
    for e in edges:
        s, t = e["source"], e["target"]
        if s in adj and t in adj:
            adj[s].append(t)
            in_deg[t] = in_deg.get(t, 0) + 1
    queue = [nid for nid, d in in_deg.items() if d == 0]
    order: list[str] = []
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for nb in adj.get(nid, []):
            in_deg[nb] -= 1
            if in_deg[nb] == 0:
                queue.append(nb)
    return order


def _topo_depth(node_ids: list[str], edges: list[dict]) -> dict[str, int]:
    depth: dict[str, int] = {nid: 0 for nid in node_ids}
    adj: dict[str, list[str]] = {nid: [] for nid in node_ids}
    in_deg: dict[str, int] = {nid: 0 for nid in node_ids}
    for e in edges:
        s, t = e["source"], e["target"]
        if s in adj and t in adj:
            adj[s].append(t)
            in_deg[t] = in_deg.get(t, 0) + 1
    queue = [nid for nid, d in in_deg.items() if d == 0]
    while queue:
        nid = queue.pop(0)
        for nb in adj.get(nid, []):
            in_deg[nb] -= 1
            depth[nb] = max(depth[nb], depth[nid] + 1)
            if in_deg[nb] == 0:
                queue.append(nb)
    return depth


def _is_parallel_edge(edge: dict, edges: list[dict]) -> bool:
    e_data = edge.get("data", {}) if isinstance(edge.get("data"), dict) else {}
    link_type = e_data.get("linkType", edge.get("linkType", "serial"))
    return link_type == "parallel"


def _resolve_path(obj: Any, path: str) -> Any:
    if not obj or not path:
        return None
    parts = path.split(".")
    cur = obj
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
    return cur


def _smart_template(
    template: str,
    all_outputs: dict[str, dict[str, Any]],
    inputs: dict[str, Any],
    external_inputs: dict[str, Any],
    global_vars: dict[str, Any],
) -> str:
    if not template:
        return ""
    ctx: dict[str, Any] = {}
    ctx.update(external_inputs)
    ctx.update(inputs)
    ctx.update(global_vars)
    for node_outputs in all_outputs.values():
        if isinstance(node_outputs, dict):
            ctx.update(node_outputs)

    def replacer(m: re.Match) -> str:
        key = m.group(1).strip()
        val = _resolve_path(ctx, key)
        return str(val) if val is not None else f"{{{{{key}}}}}"

    return re.sub(r"\{\{([^}]+)\}\}", replacer, template)


async def run_flow(
    nodes: list[dict],
    edges: list[dict],
    external_inputs: dict[str, Any] | None = None,
    global_vars: dict[str, Any] | None = None,
    on_event=None,
    db_session=None,
) -> dict[str, Any]:
    if external_inputs is None:
        external_inputs = {}
    if global_vars is None:
        global_vars = {}

    if not nodes:
        return {"success": False, "error": "画布为空", "results": [], "logs": []}

    node_ids = [n["id"] for n in nodes]
    order = _topo_sort(node_ids, edges)
    if not order:
        return {"success": False, "error": "无法排序（可能包含环）", "results": [], "logs": []}

    depth_map = _topo_depth(node_ids, edges)
    max_depth = max(depth_map.values()) if depth_map else 0
    batches: dict[int, list[str]] = {}
    for nid, d in depth_map.items():
        batches.setdefault(d, []).append(nid)

    node_map: dict[str, dict] = {n["id"]: n for n in nodes}
    outputs: dict[str, dict[str, Any]] = {}
    results: list[dict] = []
    logs: list[dict] = []
    aborted = False

    def _emit(evt_type: str, data: dict):
        if on_event:
            asyncio.ensure_future(on_event(evt_type, data))

    def _add_log(node_id: str, node_name: str, log_type: str, data: dict):
        logs.append({"nodeId": node_id, "nodeName": node_name, "type": log_type, "data": data, "time": _now()})

    def _now() -> int:
        import time
        return int(time.time() * 1000)

    async def _run_single_node(node_id: str):
        nonlocal aborted
        if aborted:
            return

        node_data = node_map.get(node_id)
        if not node_data:
            return

        nd = node_data.get("data", {}) or {}
        origin_type = nd.get("originType") or node_data.get("type") or "atom-node"
        meta = _get_meta(origin_type)
        node_name = nd.get("label") or node_data.get("name") or meta.get("name") or origin_type

        if not isinstance(nd, dict) or nd == {}:
            nd = {}
        nd.setdefault("config", node_data.get("config", {}))
        nd.setdefault("mappings", node_data.get("mappings", {}) or {})

        upstream_edges = [e for e in edges if e["target"] == node_id]
        inputs: dict[str, Any] = {}
        for port in meta.get("inputSchema", []):
            inputs[port["name"]] = None

        for edge in upstream_edges:
            edge_mappings = edge.get("data", {}).get("mappings", {}) if isinstance(edge.get("data"), dict) else {}
            for tgt_port, src_expr in edge_mappings.items():
                inputs[tgt_port] = _resolve_mapping(src_expr, outputs)

        node_mappings = nd.get("mappings", {}) if isinstance(nd, dict) else {}
        for tgt_port, src_expr in node_mappings.items():
            if inputs.get(tgt_port) is None:
                inputs[tgt_port] = _resolve_mapping(src_expr, outputs)

        if upstream_edges:
            up_outputs = outputs.get(upstream_edges[0]["source"], {})
            for port in meta.get("inputSchema", []):
                if inputs.get(port["name"]) is None:
                    pn = port["name"]
                    if pn in up_outputs:
                        inputs[pn] = up_outputs[pn]
                    elif port.get("required"):
                        keys = list(up_outputs.keys())
                        if keys:
                            inputs[pn] = up_outputs[keys[0]]

        config = nd.get("config", {}) if isinstance(nd, dict) else {}

        _add_log(node_id, node_name, "start", {"inputs": inputs, "config": config})
        _emit("node_start", {"nodeId": node_id, "nodeName": node_name})

        if origin_type == "start":
            inputs.update(external_inputs)

        try:
            node_outputs = await _execute_node(
                origin_type, inputs, config, meta, outputs,
                external_inputs, global_vars, node_map,
            )
            outputs[node_id] = node_outputs
            outputs[node_name] = node_outputs
            _add_log(node_id, node_name, "complete", {"outputs": node_outputs})
            _emit("node_complete", {"nodeId": node_id, "nodeName": node_name, "outputs": node_outputs})
            results.append({"nodeId": node_id, "nodeName": node_name, "type": origin_type, "outputs": node_outputs})
        except Exception as e:
            msg = str(e)
            _add_log(node_id, node_name, "error", {"error": msg})
            _emit("node_error", {"nodeId": node_id, "nodeName": node_name, "error": msg})
            results.append({"nodeId": node_id, "nodeName": node_name, "type": origin_type, "error": msg})

    for depth in range(max_depth + 1):
        if aborted:
            return {"success": False, "error": "已中止", "results": results, "logs": logs}
        batch = batches.get(depth, [])
        if batch:
            await asyncio.gather(*[_run_single_node(nid) for nid in batch])
        await asyncio.sleep(0.2)

    _emit("flow_complete", {"success": True, "resultCount": len(results)})
    return {"success": True, "results": results, "logs": logs}


def _resolve_mapping(source_expr: str, all_outputs: dict[str, dict[str, Any]]) -> Any:
    if not source_expr:
        return None
    parts = source_expr.split(".")
    if len(parts) >= 2:
        node_name_or_id = parts[0]
        output_key = ".".join(parts[1:])
        if node_name_or_id in all_outputs and output_key in all_outputs[node_name_or_id]:
            return all_outputs[node_name_or_id][output_key]
        for node_outputs in all_outputs.values():
            if isinstance(node_outputs, dict) and output_key in node_outputs:
                return node_outputs[output_key]
        return None
    for node_outputs in all_outputs.values():
        if isinstance(node_outputs, dict) and parts[0] in node_outputs:
            return node_outputs[parts[0]]
    return None


async def _exec_loop(
    inputs: dict[str, Any],
    config: dict[str, Any],
    all_outputs: dict[str, dict[str, Any]],
    external_inputs: dict[str, Any],
    global_vars: dict[str, Any],
    node_map: dict[str, dict],
) -> dict[str, Any]:
    arr = inputs.get("array", [])
    if not isinstance(arr, list):
        arr = [arr]
    max_iter = int(config.get("max_iterations", 100))
    loop_var = config.get("loop_var", "item")
    results = []
    for i, item in enumerate(arr):
        if i >= max_iter:
            break
        global_vars[loop_var] = item
        global_vars["_loop_index"] = i
        results.append({"index": i, loop_var: item})
    return {"result": results, "count": len(results)}


async def _execute_node(
    origin_type: str,
    inputs: dict[str, Any],
    config: dict[str, Any],
    meta: dict[str, Any],
    all_outputs: dict[str, dict[str, Any]],
    external_inputs: dict[str, Any],
    global_vars: dict[str, Any],
    node_map: dict[str, dict],
) -> dict[str, Any]:
    if origin_type == "start":
        return {**external_inputs, "trigger": True}
    elif origin_type == "end":
        return {"result": inputs.get("input")}
    elif origin_type == "llm":
        return await _exec_llm(inputs, config, all_outputs, external_inputs, global_vars)
    elif origin_type == "code":
        return await _exec_code(inputs, config)
    elif origin_type == "http":
        return await _exec_http(inputs, config)
    elif origin_type == "condition":
        expr = config.get("expression", "true")
        try:
            result = bool(eval(expr, {"__builtins__": {}}, {"input": inputs.get("input")}))
        except Exception:
            result = True
        return {"result": result, "branch": "true" if result else "false"}
    elif origin_type == "switch":
        expr = config.get("expression", "input")
        try:
            value = eval(expr, {"__builtins__": {}}, {"input": inputs})
        except Exception:
            value = inputs.get("input")
        return {"result": value}
    elif origin_type == "loop":
        return await _exec_loop(inputs, config, all_outputs, external_inputs, global_vars, node_map)
    elif origin_type == "knowledge":
        return await _exec_knowledge(inputs, config)
    elif origin_type == "search":
        await asyncio.sleep(0.4)
        query = inputs.get("query", "")
        top_k = config.get("top_k", 5)
        return {
            "results": [{"title": f"结果 {i+1}: {query}", "snippet": f'这是关于 "{query}" 的第 {i+1} 条搜索结果。', "url": f"https://example.com/result/{i}"} for i in range(top_k)],
            "summary": f'搜索 "{query}" 返回 {top_k} 条结果。',
        }
    elif origin_type == "json-parse":
        source = inputs.get("source", config.get("source", ""))
        try:
            return {"result": json.loads(source) if isinstance(source, str) else source, "error": None}
        except (json.JSONDecodeError, TypeError) as e:
            return {"result": None, "error": str(e)}
    elif origin_type == "variable-set":
        var_name = config.get("var_name", "var")
        value = inputs.get("value")
        var_set(var_name, value)
        global_vars[var_name] = value
        return {"result": value, f"var_{var_name}": value}
    elif origin_type == "variable-get":
        var_name = config.get("var_name", "var")
        value = global_vars.get(var_name) or var_get(var_name)
        return {"value": value}
    elif origin_type == "transform":
        mapping = config.get("mapping", {})
        source = inputs.get("source", {})
        if not isinstance(source, dict):
            source = {}
        result: dict[str, Any] = {}
        for key, val in mapping.items():
            result[key] = _resolve_path(source, val)
        return {"result": result}
    elif origin_type == "text-process":
        op = config.get("operation", "concat")
        text = inputs.get("text", "")
        if op == "concat":
            return {"result": text + config.get("separator", "")}
        elif op == "split":
            return {"result": text.split(config.get("separator", ","))}
        elif op == "replace":
            pattern = config.get("pattern", "")
            replacement = config.get("replacement", "")
            return {"result": re.sub(pattern, replacement, text)}
        elif op == "trim":
            return {"result": text.strip()}
        elif op == "uppercase":
            return {"result": text.upper()}
        elif op == "lowercase":
            return {"result": text.lower()}
        return {"result": text}
    elif origin_type == "memory-read":
        scope = config.get("scope", "user")
        key = inputs.get("key") or config.get("memory_key", "")
        val = memory_read(scope, key) if key else None
        return {"value": val}
    elif origin_type == "memory-write":
        scope = config.get("scope", "user")
        key = inputs.get("key") or config.get("memory_key", "")
        val = inputs.get("value") or config.get("memory_value", "")
        if key and val is not None:
            memory_write(scope, key, str(val))
        return {"success": bool(key)}
    elif origin_type == "extract-memory":
        text = inputs.get("text", config.get("text", ""))
        max_facts = config.get("max_facts", 3)
        scope = config.get("scope", "user")
        facts = memory_extract_facts(str(text), max_facts)
        written = []
        for fact in facts:
            k = f"fact_{hash(fact) % 1000000:06d}"
            memory_write(scope, k, fact)
            written.append({"key": k, "value": fact})
        return {"facts": written, "count": len(written)}
    elif origin_type == "search-sessions":
        query = inputs.get("query", config.get("query", ""))
        limit = config.get("limit", 10)
        session_id = inputs.get("session_id") or None
        results = search_messages(str(query), session_id, int(limit))
        return {"results": results, "count": len(results)}
    elif origin_type == "tool-call":
        tool_name = inputs.get("tool_name", config.get("tool_name", ""))
        args = inputs.get("args", config.get("args", {}))
        try:
            result = await execute_tool(str(tool_name), args, global_vars)
            return {"result": result, "success": True}
        except ValueError as e:
            return {"result": None, "error": str(e), "success": False}
    elif origin_type == "register-tool":
        llm_output = inputs.get("llm_output", config.get("llm_output", ""))
        if not llm_output:
            llm_output = global_vars.get("_lastLLMOutput", "")
        results = parse_tools(str(llm_output))
        return {"tools": results, "count": len(results)}
    elif origin_type == "execute-skill":
        skill_name = inputs.get("skill_name", config.get("skill_name", ""))
        params = inputs.get("params", config.get("params", {}))
        content = get_skill_content(str(skill_name))
        if content is None:
            return {"result": None, "error": f"技能 '{skill_name}' 不存在", "success": False}
        skill_code = content
        if "```python" in content:
            import re as _re
            m = _re.search(r"```python\n(.*?)\n```", content, _re.DOTALL)
            if m:
                skill_code = m.group(1)
        try:
            safe_globals = {"__builtins__": {}, "inputs": params, "result": None}
            exec(skill_code, safe_globals)
            return {"result": safe_globals.get("result"), "success": True}
        except Exception as e:
            return {"result": None, "error": str(e), "success": False}
    elif origin_type == "learn-skill":
        llm_output = inputs.get("llm_output", config.get("llm_output", ""))
        if not llm_output:
            llm_output = global_vars.get("_lastLLMOutput", "")
        results = learn_skills(str(llm_output))
        return {"skills": results, "count": len(results)}
    elif origin_type == "prompt-assembly":
        stable = config.get("stable", "")
        context = inputs.get("context", config.get("context", ""))
        volatile = inputs.get("volatile", config.get("volatile", ""))
        assembled = ""
        if stable:
            assembled += stable + "\n"
        if context:
            assembled += "\n---\n" + context + "\n"
        if volatile:
            assembled += "\n---\n" + volatile + "\n"
        return {"assembled": assembled.strip()}
    elif origin_type == "trigger":
        user_message = external_inputs.get("message", inputs.get("message", ""))
        return {"message": user_message, "triggered": True}
    elif origin_type == "composite-node":
        return {"output": inputs.get("input")}
    elif origin_type == "input":
        return {**external_inputs, **inputs}
    elif origin_type == "output":
        return {"result": inputs.get("input")}
    else:
        await asyncio.sleep(0.2)
        output_names = [p["name"] for p in meta.get("outputSchema", [])]
        result: dict[str, Any] = {}
        if not output_names:
            result["result"] = "[已执行]"
        else:
            for name in output_names:
                result[name] = inputs.get(name, config.get(name))
        return result


async def _exec_llm(
    inputs: dict[str, Any],
    config: dict[str, Any],
    all_outputs: dict[str, dict[str, Any]],
    external_inputs: dict[str, Any],
    global_vars: dict[str, Any],
) -> dict[str, Any]:
    prompt = _smart_template(config.get("prompt", ""), all_outputs, inputs, external_inputs, global_vars)
    system_prompt = _smart_template(config.get("system_prompt", ""), all_outputs, inputs, external_inputs, global_vars)
    model = config.get("model", "gpt-4o")
    user_content = prompt or inputs.get("input") or external_inputs.get("query", "")

    # ── Hermes pre_llm: auto-inject memory ──
    auto_inject = config.get("auto_inject_memory", True)
    if auto_inject and not system_prompt:
        facts = memory_list("user")
        if facts:
            lines = [f"- {f['key']}: {f['value']}" for f in facts]
            system_prompt = f"## 用户记忆\n以下是你已知的用户信息：\n" + "\n".join(lines)

    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    history = global_vars.get("_chatHistory", [])
    messages.extend(history)
    messages.append({"role": "user", "content": str(user_content)})

    provider_id = PROVIDER_MAP.get(model, "openai")

    from ..core.config import settings as env_settings
    db_key = global_vars.get(f"{provider_id}_api_key", "")
    env_key = getattr(env_settings, f"{provider_id.upper()}_API_KEY", "")
    api_key = config.get("api_key") or db_key or env_key or ""
    db_base = global_vars.get(f"{provider_id}_base_url", "")
    base_url = db_base or PROVIDER_BASE_URL.get(provider_id, "")

    result = await chat_completion(
        model=model,
        messages=messages,
        api_key=api_key,
        base_url=base_url,
        temperature=config.get("temperature", 0.7),
        max_tokens=config.get("max_tokens", 2048),
        thinking_mode=config.get("thinking_mode", False),
        reasoning_effort=config.get("reasoning_effort", "medium"),
    )

    content = result.get("result", "")
    global_vars["_lastLLMOutput"] = content
    if "_chatHistory" not in global_vars:
        global_vars["_chatHistory"] = []
    global_vars["_chatHistory"].append({"role": "user", "content": str(user_content)})
    global_vars["_chatHistory"].append({"role": "assistant", "content": content})

    # ── Hermes post_llm: auto-extract facts + index ──
    if auto_inject and content:
        try:
            facts = memory_extract_facts(content, max_facts=3)
            for fact in facts:
                k = f"fact_{hash(fact) % 1000000:06d}"
                memory_write("user", k, fact)
            index_message("default", "user", str(user_content))
            index_message("default", "assistant", content)
        except Exception:
            pass

    return {"result": content, "usage": result.get("usage", {})}


async def _exec_code(inputs: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    code = config.get("code", "")
    timeout = config.get("timeout", 10000)
    result = await run_code(
        code=code,
        input_data=inputs,
        params=inputs.get("params", {}),
        timeout=max(1, min(30, timeout // 1000)),
    )
    return {
        "result": result.get("result"),
        "error": result.get("error"),
        "logs": result.get("logs", []),
    }


async def _exec_http(inputs: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    url = inputs.get("url", config.get("url", ""))
    if not url:
        raise ValueError("URL 为空")
    method = config.get("method", "GET")
    headers = config.get("headers", {})
    body = config.get("body", inputs.get("body"))
    timeout = config.get("timeout", 10000)

    async with httpx.AsyncClient(timeout=timeout / 1000) as client:
        try:
            resp = await client.request(
                method=method,
                url=url,
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


async def _exec_knowledge(inputs: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    query = inputs.get("query", "")
    top_k = config.get("top_k", 5)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "http://localhost:8000/api/v1/knowledge/search",
                json={"query": query, "top_k": top_k, "knowledge_base": config.get("knowledge_base", "")},
            )
            if resp.status_code == 200:
                json_data = resp.json()
                return {"results": json_data.get("results", []), "context": json_data.get("context", "")}
    except Exception:
        pass
    return {"results": [], "context": "[知识库检索失败]"}
