import json
import re
from pathlib import Path
from typing import Any

REGISTRY_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "tools"
REGISTRY_FILE = REGISTRY_DIR / "registry.json"

DANGEROUS_TOOL_NAMES = frozenset({"shell_execution", "file_operations"})

# 普通 code 工具可用的 builtins（无 import / open / getattr）
_SAFE_CODE_BUILTINS = {
    "True": True, "False": False, "None": None,
    "abs": abs, "all": all, "any": any, "bool": bool, "bytes": bytes,
    "dict": dict, "enumerate": enumerate, "filter": filter,
    "float": float, "hash": hash, "hex": hex, "int": int,
    "isinstance": isinstance, "len": len, "list": list,
    "map": map, "max": max, "min": min, "object": object,
    "oct": oct, "ord": ord, "range": range, "repr": repr,
    "reversed": reversed, "round": round, "set": set,
    "slice": slice, "sorted": sorted, "str": str, "sum": sum,
    "tuple": tuple, "zip": zip,
    "Exception": Exception, "ValueError": ValueError, "KeyError": KeyError,
    "TypeError": TypeError, "StopIteration": StopIteration,
}


def _tool_enabled(name: str) -> bool:
    from ..core.config import settings
    if name in DANGEROUS_TOOL_NAMES:
        return settings.ALLOW_DANGEROUS_TOOLS
    return True


def _impl_looks_dangerous(implementation: dict) -> bool:
    blob = json.dumps(implementation or {}, ensure_ascii=False).lower()
    needles = ("subprocess", "shell=true", "__import__", "os.system", "pty.", "multiprocessing")
    return any(n in blob for n in needles)


def _run_shell_execution(args: dict) -> Any:
    """仅 ALLOW_DANGEROUS_TOOLS 时可用；禁止 shell=True。"""
    from ..core.config import settings
    if not settings.ALLOW_DANGEROUS_TOOLS:
        raise ValueError("工具 'shell_execution' 已禁用（设置 ALLOW_DANGEROUS_TOOLS=true 可启用）")
    import os
    import shlex
    import subprocess
    cmd = str(args.get("command") or "").strip()
    if not cmd:
        raise ValueError("command 为空")
    argv = shlex.split(cmd, posix=(os.name != "nt"))
    if not argv:
        raise ValueError("无法解析 command")
    result = subprocess.run(argv, shell=False, capture_output=True, text=True, timeout=60)
    return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}


def _run_file_operations(args: dict) -> Any:
    """仅 ALLOW_DANGEROUS_TOOLS 时可用；路径限制在 cwd 下。"""
    from ..core.config import settings
    if not settings.ALLOW_DANGEROUS_TOOLS:
        raise ValueError("工具 'file_operations' 已禁用（设置 ALLOW_DANGEROUS_TOOLS=true 可启用）")
    import fnmatch
    import os
    from pathlib import Path

    cwd = Path(os.getcwd()).resolve()
    action = args.get("action")
    raw_path = str(args.get("path") or "")
    target = Path(raw_path)
    full = (target if target.is_absolute() else (cwd / target)).resolve()
    if not full.is_relative_to(cwd):
        raise ValueError("path escape rejected")
    if action == "read":
        return full.read_text(encoding="utf-8")
    if action == "write":
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(str(args.get("content", "")), encoding="utf-8")
        return "ok"
    if action == "list":
        return os.listdir(full)
    if action == "search":
        pattern = args.get("pattern", "*")
        return [
            str(Path(dp) / f)
            for dp, _dn, fn in os.walk(full)
            for f in fn
            if fnmatch.fnmatch(f, pattern)
        ]
    if action == "delete":
        full.unlink()
        return "ok"
    return "unknown"


def _ensure():
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    if not REGISTRY_FILE.exists():
        REGISTRY_FILE.write_text("{}", encoding="utf-8")


def _load() -> dict[str, Any]:
    _ensure()
    try:
        return json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save(data: dict[str, Any]):
    _ensure()
    REGISTRY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def register_tool(name: str, description: str, parameters: dict, implementation: dict) -> dict:
    from ..core.config import settings

    registry = _load()
    if name in registry:
        return {"success": False, "error": f"工具 '{name}' 已存在"}
    if name in DANGEROUS_TOOL_NAMES and not settings.ALLOW_DANGEROUS_TOOLS:
        return {"success": False, "error": f"工具 '{name}' 已禁用（设置 ALLOW_DANGEROUS_TOOLS=true 可启用）"}
    if _impl_looks_dangerous(implementation) and not settings.ALLOW_DANGEROUS_TOOLS:
        return {
            "success": False,
            "error": "实现含危险调用（subprocess/shell/__import__/os.system 等），已拒绝注册",
        }
    registry[name] = {
        "name": name,
        "description": description,
        "parameters": parameters,
        "implementation": implementation,
        "enabled": True,
    }
    _save(registry)
    return {"success": True, "tool": registry[name]}


def unregister_tool(name: str) -> dict:
    registry = _load()
    if name not in registry:
        return {"success": False, "error": f"工具 '{name}' 不存在"}
    del registry[name]
    _save(registry)
    return {"success": True}


def list_tools() -> list[dict]:
    registry = _load()
    return list(registry.values())


def get_tool(name: str) -> dict | None:
    registry = _load()
    return registry.get(name)


async def execute_tool(name: str, args: dict, global_vars: dict) -> Any:
    from ..core.constitution import check_tool_allowed
    check_tool_allowed(name)
    # G2-C：组织 ACL 工具闸（principal 来自 contextvar 或 global_vars）
    from fangyu.core.org_acl import assert_org_allowed, get_principal, set_principal, reset_principal
    principal = get_principal() or global_vars.get("_principal_id") or None
    token = None
    if principal and not get_principal():
        token = set_principal(str(principal))
    try:
        assert_org_allowed(get_principal(), tool=name)
    finally:
        if token is not None:
            reset_principal(token)
    tool = get_tool(name)
    if not tool:
        raise ValueError(f"工具 '{name}' 未注册")
    if not tool.get("enabled", True):
        raise ValueError(f"工具 '{name}' 已禁用（设置 ALLOW_DANGEROUS_TOOLS=true 可启用 shell/文件类工具）")

    # 用户代码必须走沙箱，禁止 subprocess / 任意 open
    if name == "code_execution":
        from .sandbox import run_code
        out = await run_code(str(args.get("code", "")), input_data=args, timeout=30)
        if out.get("error"):
            return {"error": out["error"], "logs": out.get("logs", [])}
        return out.get("result")

    # S0-B1：危险工具走原生实现，禁止 shell=True / 裸 open 的 exec 串
    if name == "shell_execution":
        return _run_shell_execution(args)
    if name == "file_operations":
        return _run_file_operations(args)

    impl = tool.get("implementation", {})
    impl_type = impl.get("type", "prompt")

    if impl_type == "native":
        raise ValueError(f"工具 '{name}' 无原生处理器")

    if impl_type == "code":
        if _impl_looks_dangerous(impl):
            from ..core.config import settings
            if not settings.ALLOW_DANGEROUS_TOOLS:
                raise ValueError("工具实现含危险调用，已拒绝执行（ALLOW_DANGEROUS_TOOLS=false）")
        code = impl.get("code", "")
        full_code = code
        after = impl.get("after", "")
        if after:
            full_code += "\n" + after
        suffix = impl.get("suffix", "")
        if suffix:
            full_code += "\n" + suffix
        # 无 open / getattr / setattr；内置 memory/skill 仍需 __import__
        builtins = {
            **_SAFE_CODE_BUILTINS,
            "__import__": __import__,
            "type": type,
            "hasattr": hasattr,
            "ImportError": ImportError,
            "AttributeError": AttributeError,
            "ModuleNotFoundError": ModuleNotFoundError,
            "OSError": OSError,
            "FileNotFoundError": FileNotFoundError,
        }
        safe_globals = {"__builtins__": builtins}
        safe_locals = {"args": args, "result": None}
        try:
            exec(full_code, safe_globals, safe_locals)
        except Exception as e:
            return {"error": str(e)}
        return safe_locals.get("result")

    if impl_type == "prompt":
        template = impl.get("template", "")
        result = template
        for k, v in args.items():
            result = result.replace(f"{{{{{k}}}}}", str(v))
        return {"result": result}

    if impl_type == "http":
        import httpx
        url = impl.get("url", "")
        method = impl.get("method", "POST").upper()
        body = {k: args.get(k) for k in impl.get("mapping", [])}
        async with httpx.AsyncClient(timeout=15) as client:
            if method == "GET":
                resp = await client.get(url, params=body)
            else:
                resp = await client.post(url, json=body)
            return resp.json()

    if impl_type == "prompt_chain":
        steps = impl.get("steps", [])
        chain_vars = dict(args)
        for step in steps:
            template = step.get("prompt", "")
            result = template
            for k, v in chain_vars.items():
                result = result.replace(f"{{{{{k}}}}}", str(v))
            chain_vars["_step_result"] = result
        return {"result": chain_vars["_step_result"], "chain_vars": chain_vars}

    raise ValueError(f"不支持的实现类型: {impl_type}")


def register_from_llm_output(llm_content: str) -> list[dict]:
    results = []
    pattern = re.compile(
        r'```(?:tool|json)\s*\n\{\s*"name"\s*:\s*"([^"]+)".*?\n\}',
        re.DOTALL,
    )

    for match in pattern.finditer(llm_content):
        try:
            parsed = json.loads(match.group(0).removeprefix("```").removesuffix("```"))
            name = parsed.get("name", "")
            desc = parsed.get("description", "")
            params = parsed.get("parameters", {})
            impl = parsed.get("implementation", {"type": "prompt", "template": ""})
            if name:
                result = register_tool(name, desc, params, impl)
                results.append(result)
        except (json.JSONDecodeError, AttributeError):
            continue

    alt_pattern = re.compile(r'##\s*工具注册\s*\n```(?:tool|json)\s*\n(.*?)\n```', re.DOTALL)
    for match in alt_pattern.finditer(llm_content):
        try:
            parsed = json.loads(match.group(1))
            name = parsed.get("name", "")
            desc = parsed.get("description", "")
            params = parsed.get("parameters", {})
            impl = parsed.get("implementation", {"type": "prompt", "template": ""})
            if name:
                result = register_tool(name, desc, params, impl)
                results.append(result)
        except (json.JSONDecodeError, AttributeError):
            continue

    return results


BUILTIN_TOOLS: list[dict] = [
    {
        "name": "web_search",
        "description": "搜索互联网获取最新信息",
        "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "搜索关键词"}}, "required": ["query"]},
        "implementation": {"type": "prompt", "template": "搜索: {{query}}"},
    },
    {
        "name": "current_time",
        "description": "获取当前日期和时间",
        "parameters": {"type": "object", "properties": {"timezone": {"type": "string", "description": "时区，如 Asia/Shanghai", "default": "Asia/Shanghai"}}},
        "implementation": {"type": "code", "code": "import datetime; result = datetime.datetime.now().isoformat()"},
    },
    {
        "name": "code_execution",
        "description": "在沙箱中执行 Python 代码",
        "parameters": {"type": "object", "properties": {"code": {"type": "string", "description": "Python 代码"}}, "required": ["code"]},
        # 实际执行由 execute_tool 走 engine.sandbox.run_code，此处仅作注册占位
        "implementation": {"type": "sandbox", "timeout": 30},
    },
    {
        "name": "read_url",
        "description": "获取网页内容并转为文本",
        "parameters": {"type": "object", "properties": {"url": {"type": "string", "description": "网页 URL"}}, "required": ["url"]},
        "implementation": {"type": "http", "url": "", "method": "GET", "mapping": []},
    },
    {
        "name": "memory_add",
        "description": "添加一条新事实到用户记忆",
        "parameters": {"type": "object", "properties": {"fact": {"type": "string", "description": "陈述式事实"}}, "required": ["fact"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.memory import memory_write; import hashlib; key = f'fact_{hashlib.md5(args[\"fact\"].encode()).hexdigest()[:8]}'; memory_write('user', key, args['fact']); result = {'key': key, 'value': args['fact']}"},
    },
    {
        "name": "memory_replace",
        "description": "替换用户记忆中的一条事实",
        "parameters": {"type": "object", "properties": {"old_fact": {"type": "string", "description": "原事实内容"}, "new_fact": {"type": "string", "description": "新事实内容"}}, "required": ["old_fact", "new_fact"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.memory import memory_replace; ok = memory_replace('user', args['old_fact'], args['new_fact']); result = {'replaced': ok}"},
    },
    {
        "name": "memory_remove",
        "description": "删除用户记忆中的一条事实",
        "parameters": {"type": "object", "properties": {"fact": {"type": "string", "description": "要删除的事实内容"}}, "required": ["fact"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.memory import memory_delete, memory_list; items = memory_list('user'); found = [it for it in items if it['value'] == args['fact']]; key = found[0]['key'] if found else None; ok = bool(key);", "after": "if key: memory_delete('user', key); result = {'removed': ok}"},
    },
    {
        "name": "memory_search",
        "description": "搜索用户记忆中的事实",
        "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "搜索关键词"}}, "required": ["query"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.memory import memory_search; results = memory_search('user', args['query']); result = {'results': results}"},
    },
    {
        "name": "file_operations",
        "description": "读写、搜索、列出文件（限制在工作目录内）",
        "parameters": {"type": "object", "properties": {"action": {"type": "string", "enum": ["read", "write", "list", "search", "delete"], "description": "操作类型"}, "path": {"type": "string", "description": "文件路径（绝对路径或相对于工作目录）"}, "content": {"type": "string", "description": "写入内容（write 时必填）"}, "pattern": {"type": "string", "description": "搜索模式（search 时必填）"}}, "required": ["action", "path"]},
        "implementation": {"type": "native"},
    },
    {
        "name": "shell_execution",
        "description": "执行命令（argv 列表，无 shell=True；需 ALLOW_DANGEROUS_TOOLS）",
        "parameters": {"type": "object", "properties": {"command": {"type": "string", "description": "要执行的命令"}}, "required": ["command"]},
        "implementation": {"type": "native"},
    },
    {
        "name": "skill_write_file",
        "description": "写入技能附属文件（如模板、配置）",
        "parameters": {"type": "object", "properties": {"skill_name": {"type": "string", "description": "技能名称"}, "filename": {"type": "string", "description": "文件名"}, "content": {"type": "string", "description": "文件内容"}}, "required": ["skill_name", "filename", "content"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.skill import skill_write_file; r = skill_write_file(args['skill_name'], args['filename'], args['content']); result = r"},
    },
    {
        "name": "skill_remove_file",
        "description": "删除技能附属文件",
        "parameters": {"type": "object", "properties": {"skill_name": {"type": "string", "description": "技能名称"}, "filename": {"type": "string", "description": "文件名"}}, "required": ["skill_name", "filename"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.skill import skill_remove_file; r = skill_remove_file(args['skill_name'], args['filename']); result = r"},
    },
    {
        "name": "skill_create",
        "description": "创建一个新技能文件",
        "parameters": {"type": "object", "properties": {"name": {"type": "string", "description": "技能名称"}, "description": {"type": "string", "description": "技能描述"}, "content": {"type": "string", "description": "Markdown 正文内容"}}, "required": ["name", "description", "content"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.skill import create_skill; r = create_skill(args['name'], args['description'], args['content']); result = r"},
    },
    {
        "name": "skill_edit",
        "description": "编辑已有技能文件（完整覆盖）",
        "parameters": {"type": "object", "properties": {"name": {"type": "string", "description": "技能名称"}, "content": {"type": "string", "description": "新内容"}}, "required": ["name", "content"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.skill import edit_skill; r = edit_skill(args['name'], args['content']); result = r"},
    },
    {
        "name": "skill_delete",
        "description": "删除一个技能文件",
        "parameters": {"type": "object", "properties": {"name": {"type": "string", "description": "技能名称"}}, "required": ["name"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.skill import delete_skill; r = delete_skill(args['name']); result = r"},
    },
    {
        "name": "skill_list",
        "description": "列出所有技能",
        "parameters": {"type": "object", "properties": {}},
        "implementation": {"type": "code", "code": "from fangyu.engine.skill import list_skills; result = list_skills()"},
    },
    {
        "name": "skill_view",
        "description": "查看指定技能的完整内容",
        "parameters": {"type": "object", "properties": {"name": {"type": "string", "description": "技能名称"}}, "required": ["name"]},
        "implementation": {"type": "code", "code": "from fangyu.engine.skill import get_skill_content; r = get_skill_content(args['name']); result = {'found': r is not None, 'content': r}"},
    },
]


def register_builtins():
    _ensure()
    existing = _load()
    for tool in BUILTIN_TOOLS:
        name = tool["name"]
        existing[name] = {
            **tool,
            "enabled": _tool_enabled(name),
            "builtin": True,
            "dangerous": name in DANGEROUS_TOOL_NAMES,
        }
    _save(existing)


register_builtins()
