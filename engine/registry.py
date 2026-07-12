from typing import Any, Callable

NODE_REGISTRY: dict[str, dict[str, Any]] = {}
_EXECUTORS: dict[str, Callable] = {}


def register_executor(type_name: str, fn: Callable):
    _EXECUTORS[type_name] = fn


def _reset_executors():
    _EXECUTORS.clear()
    _init_registry()


def _register_node_type(type_name, name, category, input_schema, output_schema):
    NODE_REGISTRY[type_name] = {
        "name": name, "category": category,
        "inputSchema": input_schema, "outputSchema": output_schema,
    }


def _init_registry():
    S = {
        "start": ("开始", "流程控制", [], [{"name": "trigger", "type": "any"}]),
        "end": ("结束", "流程控制", [{"name": "input", "type": "any", "required": True}], []),
        "condition": ("条件分支", "流程控制", [{"name": "input", "type": "any", "required": True}], [{"name": "true", "type": "any"}, {"name": "false", "type": "any"}]),
        "switch": ("多路分支", "流程控制", [{"name": "input", "type": "any", "required": True}], [{"name": "default", "type": "any"}]),
        "loop": ("循环", "流程控制", [{"name": "array", "type": "array", "required": True}, {"name": "body", "type": "any"}], [{"name": "result", "type": "array"}]),
        "trigger": ("触发器", "流程控制", [{"name": "message", "type": "string"}], [{"name": "message", "type": "string"}, {"name": "triggered", "type": "boolean"}]),
        "llm": ("大模型调用", "AI 能力", [{"name": "input", "type": "string"}, {"name": "system_prompt", "type": "string"}, {"name": "context", "type": "array"}], [{"name": "result", "type": "string"}, {"name": "usage", "type": "object"}]),
        "code": ("代码执行", "AI 能力", [{"name": "input", "type": "any"}, {"name": "params", "type": "object"}], [{"name": "result", "type": "any"}, {"name": "error", "type": "string"}]),
        "knowledge": ("知识库检索", "AI 能力", [{"name": "query", "type": "string", "required": True}], [{"name": "results", "type": "array"}, {"name": "context", "type": "string"}]),
        "prompt-assembly": ("提示词组装", "AI 能力", [{"name": "context", "type": "string"}, {"name": "volatile", "type": "string"}], [{"name": "assembled", "type": "string"}]),
        "http": ("HTTP 请求", "工具集成", [{"name": "url", "type": "string"}, {"name": "body", "type": "any"}, {"name": "headers", "type": "object"}], [{"name": "status", "type": "number"}, {"name": "data", "type": "any"}, {"name": "headers", "type": "object"}]),
        "search": ("搜索引擎", "工具集成", [{"name": "query", "type": "string", "required": True}], [{"name": "results", "type": "array"}, {"name": "summary", "type": "string"}]),
        "json-parse": ("JSON 解析", "工具集成", [{"name": "source", "type": "string", "required": True}], [{"name": "result", "type": "object"}, {"name": "error", "type": "string"}]),
        "tool-call": ("工具调用", "工具集成", [{"name": "tool_name", "type": "string"}, {"name": "args", "type": "object"}], [{"name": "result", "type": "any"}, {"name": "success", "type": "boolean"}]),
        "register-tool": ("工具注册", "工具集成", [{"name": "llm_output", "type": "string"}], [{"name": "tools", "type": "array"}, {"name": "count", "type": "number"}]),
        "execute-skill": ("技能执行", "工具集成", [{"name": "skill_name", "type": "string"}, {"name": "params", "type": "object"}], [{"name": "result", "type": "any"}, {"name": "success", "type": "boolean"}]),
        "learn-skill": ("技能学习", "工具集成", [{"name": "llm_output", "type": "string"}], [{"name": "skills", "type": "array"}, {"name": "count", "type": "number"}]),
        "variable-set": ("设置变量", "数据操作", [{"name": "value", "type": "any", "required": True}], [{"name": "result", "type": "any"}]),
        "variable-get": ("读取变量", "数据操作", [], [{"name": "value", "type": "any"}]),
        "transform": ("数据转换", "数据操作", [{"name": "source", "type": "any", "required": True}], [{"name": "result", "type": "any"}]),
        "text-process": ("文本处理", "数据操作", [{"name": "text", "type": "string", "required": True}], [{"name": "result", "type": "string"}]),
        "memory-read": ("记忆读取", "记忆存储", [{"name": "key", "type": "string"}], [{"name": "value", "type": "any"}]),
        "memory-write": ("记忆写入", "记忆存储", [{"name": "key", "type": "string"}, {"name": "value", "type": "any", "required": True}], [{"name": "success", "type": "boolean"}]),
        "extract-memory": ("事实提取", "记忆存储", [{"name": "text", "type": "string", "required": True}], [{"name": "facts", "type": "array"}, {"name": "count", "type": "number"}]),
        "search-sessions": ("会话搜索", "记忆存储", [{"name": "query", "type": "string", "required": True}, {"name": "session_id", "type": "string"}], [{"name": "results", "type": "array"}, {"name": "count", "type": "number"}]),
        "branch": ("条件/多路分支", "流程控制", [{"name": "input", "type": "any", "required": True}], [{"name": "true", "type": "any"}, {"name": "false", "type": "any"}]),
        "memory": ("记忆操作", "记忆存储", [{"name": "input", "type": "any"}], [{"name": "result", "type": "any"}]),
        "execute": ("执行", "工具集成", [{"name": "input", "type": "any"}], [{"name": "result", "type": "any"}]),
        "register": ("注册", "工具集成", [{"name": "llm_output", "type": "string"}], [{"name": "result", "type": "any"}]),
        "mcp-tools": ("MCP 工具列表", "工具集成", [], [{"name": "tools", "type": "array"}]),
        "mcp-call": ("MCP 工具调用", "工具集成", [{"name": "tool_name", "type": "string"}, {"name": "args", "type": "object"}], [{"name": "result", "type": "any"}]),
        "mcp": ("MCP 操作", "工具集成", [{"name": "input", "type": "any"}], [{"name": "result", "type": "any"}]),
        "approval": ("审批", "流程控制", [{"name": "input", "type": "string", "required": True}], [{"name": "approval_id", "type": "string"}, {"name": "status", "type": "string"}, {"name": "message", "type": "string"}]),
        "input": ("输入", "流程控制", [], [{"name": "input", "type": "any"}]),
        "output": ("输出", "流程控制", [{"name": "input", "type": "any", "required": True}], []),
    }
    for type_name, (name, category, input_schema, output_schema) in S.items():
        _register_node_type(type_name, name, category, input_schema, output_schema)


_init_registry()


def _get_meta(node_type):
    if node_type in NODE_REGISTRY:
        return NODE_REGISTRY[node_type]
    return {"name": node_type, "category": "其他", "inputSchema": [{"name": "input", "type": "any", "required": False}], "outputSchema": [{"name": "result", "type": "any"}]}


def register_executors():
    from .exec_core import register as r1
    from .exec_ai import register as r2
    from .exec_data import register as r3
    from .exec_memory import register as r4
    from .exec_tools import register as r5
    from .exec_unified import register as r6
    r1(); r2(); r3(); r4(); r5(); r6()
