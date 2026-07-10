import type { Node, Edge } from 'reactflow'
import { getNodeMeta } from './nodeRegistry'
import { getExecutionOrder } from './flowHelper'

export interface GlobalPrompts {
  system_prompt: string
  user_prompt_template: string
  context: string
}

export interface GenerateOptions {
  includeComments?: boolean
  simulateInteractive?: boolean
  globalPrompts?: GlobalPrompts
  desktopGUI?: boolean
}

const INDENT = '    '

export function generatePythonCode(nodes: Node[], edges: Edge[], options: GenerateOptions = {}): string {
  const { includeComments = true, simulateInteractive = true, globalPrompts, desktopGUI = false } = options
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const order = getExecutionOrder(nodes.map(n => n.id), edges)

  const lines: string[] = []

  function w(line = '') { lines.push(line) }
  function comment(text: string) { if (includeComments) lines.push(`# ${text}`) }

  function resolveTpl(value: unknown): string {
    if (typeof value === 'string' && /\{\{.+\..+\}\}/.test(value)) {
      return `_resolve(${JSON.stringify(value)}, pool)`
    }
    return JSON.stringify(value)
  }

  w('"""')
  w('Auto-generated flow from AI Flow Canvas')
  w('"""')
  w()
  if (desktopGUI) {
    w('import tkinter as tk')
    w('from tkinter import ttk, messagebox, simpledialog, scrolledtext')
    w('import json, re, threading, queue')
  } else {
    for (const imp of ['asyncio', 'json', 're']) {
      w(`import ${imp}`)
    }
  }
  w()
  if (globalPrompts) {
    if (globalPrompts.system_prompt) {
      w(`# 全局系统提示词`)
      w(`GLOBAL_SYSTEM_PROMPT = """${globalPrompts.system_prompt}"""`)
    }
    if (globalPrompts.user_prompt_template) {
      w(`# 全局用户提示词模板`)
      w(`GLOBAL_USER_TEMPLATE = """${globalPrompts.user_prompt_template}"""`)
    }
    if (globalPrompts.context) {
      w(`# 全局上下文`)
      w(`GLOBAL_CONTEXT = """${globalPrompts.context}"""`)
    }
    w()
  }

  if (desktopGUI) {
    w()
    comment('Queue-based dialog bridge for thread-safe Tkinter interaction')
    w('_dialog_q: "queue.Queue" = queue.Queue()')
    w('_result_q: "queue.Queue" = queue.Queue()')
    w()
    comment('Called from worker thread; dispatches dialog request to GUI thread')
    w('def _handle_input(node_name: str, config: dict) -> str:')
    w(`${INDENT}_dialog_q.put(("input", {"title": f"[{node_name}] 输入", "prompt": "请输入值:", "default": config.get("default_value", "")}))`)
    w(`${INDENT}result = _result_q.get()`)
    w(`${INDENT}return result or config.get("default_value", "")`)
    w()
    w('def _handle_approval(node_name: str, data: dict, message: str) -> dict:')
    w(`${INDENT}_dialog_q.put(("approval", {"title": f"[{node_name}] 审批", "message": f"{message}\\n\\n数据: {json.dumps(data, ensure_ascii=False, indent=2)}"}))`)
    w(`${INDENT}ok = _result_q.get()`)
    w(`${INDENT}if ok:`)
    w(`${INDENT}${INDENT}return {"action": "approved", "modified_data": data}`)
    w(`${INDENT}else:`)
    w(`${INDENT}${INDENT}return {"action": "rejected", "reason": "用户拒绝"}`)
    w()
  } else if (simulateInteractive) {
    w()
    comment('Handlers for interactive nodes (approval / input)')
    comment('Replace these with your own GUI/API logic')
    w('async def handle_approval(node_name: str, data: dict, message: str) -> dict:')
    w(`${INDENT}"""`)
    w(`${INDENT}Return {"action": "approved", "modified_data": ...} or {"action": "rejected", "reason": "..."}`)
    w(`${INDENT}""`)
    w(`${INDENT}print(f"[{node_name}] 待审批: {json.dumps(data, ensure_ascii=False, indent=2)}")`)
    w(`${INDENT}print(f"  说明: {message}")`)
    w(`${INDENT}# TODO: 接入你的审批 UI`)
    w(`${INDENT}return {"action": "approved", "modified_data": data}`)
    w()
    w('async def handle_input(node_name: str, config: dict) -> str:')
    w(`${INDENT}"""`)
    w(`${INDENT}Return the input value string`)
    w(`${INDENT}""`)
    w(`${INDENT}print(f"[{node_name}] 请输入值")`)
    w(`${INDENT}# TODO: 接入你的输入 UI`)
    w(`${INDENT}return config.get("default_value", "")`)
    w()
  }

  comment('Resolve {{nodeId.field}} template references from the variable pool')
  w('def _resolve(tpl: str, pool: dict) -> str:')
  w(`${INDENT}return re.sub(r'\\{\\{\\s*(\\S+?)\\s*\\.\\s*(\\S+?)\\s*\\}\\}', lambda m: str(pool.get(m.group(1), {}).get(m.group(2), m.group(0))), tpl)`)
  w()

  w()
  if (desktopGUI) {
    w('def run_flow():')
    w(`${INDENT}"""Execute the flow synchronously and return all node outputs."""`)
    w(`${INDENT}pool: dict = {}  # variable pool (nodeId -> {field: value})`)
  } else {
    w('async def run_flow():')
    w(`${INDENT}"""Execute the flow and return all node outputs."""`)
    w(`${INDENT}pool: dict = {}  # variable pool (nodeId -> {field: value})`)
  }
  w()

  const varNames = new Map<string, string>()

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)
    if (!node) continue

    const originType = (node.data?.originType as string) || ''
    const meta = getNodeMeta(originType)
    const nodeName = (node.data?.label as string) || meta.name
    const config = (node.data?.config as Record<string, unknown>) || {}
    const varName = `output_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}`
    varNames.set(nodeId, varName)

    comment(`--- ${nodeName} (${originType}) ---`)

    switch (originType) {
      case 'input': {
        if (simulateInteractive && desktopGUI) {
          w(`${INDENT}user_input = _handle_input("${nodeName}", ${JSON.stringify(config, null, 2).replace(/\n/g, `\n${INDENT}`)})`)
          w(`${INDENT}${varName} = {"input": user_input}`)
        } else if (simulateInteractive) {
          w(`${INDENT}user_input = await handle_input("${nodeName}", ${JSON.stringify(config, null, 2).replace(/\n/g, `\n${INDENT}`)})`)
          w(`${INDENT}${varName} = {"input": user_input}`)
        } else {
          w(`${INDENT}${varName} = {"input": ${resolveTpl(config.default_value || '')}}`)
        }
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'approval': {
        const inputVar = '{}'
        if (simulateInteractive && desktopGUI) {
          w(`${INDENT}approval_result = _handle_approval("${nodeName}", ${inputVar}, ${resolveTpl(config.message || '')})`)
          w(`${INDENT}if approval_result["action"] == "rejected":`)
          w(`${INDENT}${INDENT}${varName} = {"rejected": approval_result.get("reason", "用户拒绝")}`)
          w(`${INDENT}else:`)
          w(`${INDENT}${INDENT}${varName} = {"approved": approval_result.get("modified_data", ${inputVar})}`)
        } else if (simulateInteractive) {
          w(`${INDENT}approval_result = await handle_approval("${nodeName}", ${inputVar}, ${resolveTpl(config.message || '')})`)
          w(`${INDENT}if approval_result["action"] == "rejected":`)
          w(`${INDENT}${INDENT}${varName} = {"rejected": approval_result.get("reason", "用户拒绝")}`)
          w(`${INDENT}${INDENT}print(f"[${nodeName}] 已拒绝: {approval_result.get('reason')}")`)
          w(`${INDENT}else:`)
          w(`${INDENT}${INDENT}${varName} = {"approved": approval_result.get("modified_data", ${inputVar})}`)
        } else {
          w(`${INDENT}${varName} = {"approved": ${inputVar}}`)
        }
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'llm': {
        const model = config.model || 'deepseek-chat'
        w(`${INDENT}# LLM 调用: ${model}`)
        if (globalPrompts?.system_prompt) {
          w(`${INDENT}# 全局系统提示词`)
          w(`${INDENT}system = "${globalPrompts.system_prompt.replace(/"/g, '\\"')}"`)
        } else {
          w(`${INDENT}system = ${resolveTpl(config.system_prompt || '')}`)
        }
        if (globalPrompts?.context) {
          w(`${INDENT}context_info = "${globalPrompts.context.replace(/"/g, '\\"')}"`)
        }
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}call_llm(`)
        w(`${INDENT}${INDENT}model="${model}",`)
        w(`${INDENT}${INDENT}system_prompt=system,`)
        if (globalPrompts?.context) {
          w(`${INDENT}${INDENT}context=context_info,`)
        }
        w(`${INDENT}${INDENT}user_input="",`)
        w(`${INDENT}${INDENT}user_template=${resolveTpl(globalPrompts?.user_prompt_template || '')},`)
        w(`${INDENT}${INDENT}config=${JSON.stringify({ temperature: config.temperature, max_tokens: config.max_tokens }, defaultReplacer)},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'http': {
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}call_http(`)
        w(`${INDENT}${INDENT}url=${resolveTpl(config.url || '')},`)
        w(`${INDENT}${INDENT}method="${config.method || 'GET'}",`)
        w(`${INDENT}${INDENT}headers=${JSON.stringify(config.headers || {}, defaultReplacer)},`)
        w(`${INDENT}${INDENT}body=${resolveTpl(config.body || '')},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'condition': {
        const expr = config.expression || 'input > 0'
        w(`${INDENT}# 条件: ${expr}`)
        w(`${INDENT}${varName} = {"true": True, "false": False}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'code': {
        const codeStr = (config.code as string) || '# TODO'
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}execute_python_code(`)
        w(`${INDENT}${INDENT}"""`)
        for (const line of codeStr.split('\n')) {
          w(`${INDENT}${INDENT}${line}`)
        }
        w(`${INDENT}${INDENT}""",`)
        w(`${INDENT}${INDENT}inputs=${JSON.stringify({}, defaultReplacer)},`)
        w(`${INDENT}${INDENT}timeout=${config.timeout || 5000},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'search': {
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}web_search(`)
        w(`${INDENT}${INDENT}query=${resolveTpl('')},`)
        w(`${INDENT}${INDENT}top_k=${config.top_k || 5},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'variable-set': {
        w(`${INDENT}_vars["${config.var_name || 'var'}"] = pool.get("${nodeId}", {}).get("value", pool.get("${nodeId}", {}))`)
        w(`${INDENT}${varName} = {"result": _vars["${config.var_name || 'var'}"]}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'variable-get': {
        w(`${INDENT}${varName} = {"value": _vars.get("${config.var_name || ''}", None)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'transform': {
        w(`${INDENT}# 数据转换映射: ${JSON.stringify(config.mapping || {}, defaultReplacer)}`)
        w(`${INDENT}${varName} = {"result": pool.get("${nodeId}", {})}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'json-parse': {
        w(`${INDENT}try:`)
        w(`${INDENT}${INDENT}${varName} = {"result": json.loads(str(pool.get("${nodeId}", {})))}`)
        w(`${INDENT}except Exception as e:`)
        w(`${INDENT}${INDENT}${varName} = {"error": str(e)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'memory-write': {
        w(`${INDENT}# 写入记忆: key=${config.memory_key || ''}, scope=${config.scope || 'session'}`)
        w(`${INDENT}_memory["${config.memory_key || ''}"] = pool.get("${nodeId}", {}).get("value", pool.get("${nodeId}", {}))`)
        w(`${INDENT}${varName} = {"success": True}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'memory-read': {
        w(`${INDENT}${varName} = {"value": _memory.get("${config.memory_key || ''}", None)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'output': {
        w(`${INDENT}${varName} = pool.get("${nodeId}", {})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'knowledge': {
        w(`${INDENT}# 知识库检索: top_k=${config.top_k || 5}`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}search_knowledge(`)
        w(`${INDENT}${INDENT}query=${resolveTpl('')},`)
        w(`${INDENT}${INDENT}top_k=${config.top_k || 5},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'tool-call': {
        w(`${INDENT}# 工具调用: ${config.tool_name || ''}`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}call_tool(`)
        w(`${INDENT}${INDENT}name="${config.tool_name || ''}",`)
        w(`${INDENT}${INDENT}args=${JSON.stringify(config.args || {}, defaultReplacer)},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'register-tool': {
        w(`${INDENT}# 从 LLM 输出注册工具`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}register_tool_from_llm(`)
        w(`${INDENT}${INDENT}content=str(pool.get("${nodeId}", {})),`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'execute-skill': {
        w(`${INDENT}# 执行技能: ${config.skill_name || ''}`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}execute_skill(`)
        w(`${INDENT}${INDENT}name="${config.skill_name || ''}",`)
        w(`${INDENT}${INDENT}params=${JSON.stringify(config.params || {}, defaultReplacer)},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'learn-skill': {
        w(`${INDENT}# 从 LLM 输出学习技能`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}learn_skill_from_llm(`)
        w(`${INDENT}${INDENT}content=str(pool.get("${nodeId}", {})),`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'mcp-tools': {
        w(`${INDENT}# MCP 工具列表: server=${config.server || '__internal__'}`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}mcp_list_tools(`)
        w(`${INDENT}${INDENT}server="${config.server || '__internal__'}",`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'mcp-call': {
        w(`${INDENT}# MCP 工具调用: ${config.tool_name || ''} @ ${config.server || '__internal__'}`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}mcp_call_tool(`)
        w(`${INDENT}${INDENT}server="${config.server || '__internal__'}",`)
        w(`${INDENT}${INDENT}name="${config.tool_name || ''}",`)
        w(`${INDENT}${INDENT}arguments=${JSON.stringify(config.args || {}, defaultReplacer)},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      default: {
        w(`${INDENT}# TODO: 节点类型 "${originType}" 尚未实现`)
        w(`${INDENT}${varName} = {}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
      }
    }
    w()
  }

  comment('Collect outputs')
  w(`${INDENT}return {`)
  for (const nodeId of order) {
    const varName = varNames.get(nodeId)
    const node = nodeMap.get(nodeId)
    if (varName && node) {
      w(`${INDENT}${INDENT}"${node.data?.label || nodeId}": ${varName},`)
    }
  }
  w(`${INDENT}}`)

  w()
  comment('Helper functions')
  w()
  if (desktopGUI) {
    w('def call_llm(model, system_prompt="", user_input="", user_template="", context="", config=None):')
    w('    """调用 LLM API（替换此函数以接入真实模型）。"""')
    w('    if config is None: config = {}')
    w('    content = (user_template or "").replace("{{input}}", str(user_input)) if user_template else str(user_input)')
    w('    return {"result": f"[模拟] {model} 输出", "usage": {"total_tokens": 0}}')
    w()
    w('def call_http(url, method="GET", headers=None, body=""):')
    w('    """调用 HTTP API（替换此函数以接入真实客户端）。"""')
    w('    import urllib.request, json')
    w('    try:')
    w('        req = urllib.request.Request(url, method=method)')
    w('        with urllib.request.urlopen(req, timeout=10) as resp:')
    w('            return {"status": resp.status, "data": json.loads(resp.read().decode())}')
    w('    except Exception as e:')
    w('        return {"status": 0, "error": str(e)}')
    w()
    w('def execute_python_code(code, inputs=None, timeout=30):')
    w('    """执行 Python 代码（替换此函数以接入沙箱）。"""')
    w('    return {"result": None, "error": None}')
    w()
    w('def web_search(query, top_k=5):')
    w('    """执行网络搜索（替换此函数以接入搜索 API）。"""')
    w('    return {"results": [], "summary": ""}')
    w()
    w('def search_knowledge(query, top_k=5):')
    w('    """知识库检索。"""')
    w('    return {"results": [], "context": ""}')
    w()
    w('def call_tool(name, args=None):')
    w('    """调用已注册的工具。"""')
    w('    return {"success": False, "result": "", "error": f"tool {name} not implemented"}')
    w()
    w('def register_tool_from_llm(content):')
    w('    """从 LLM 输出自动注册工具。"""')
    w('    return {"tools_registered": [], "count": 0}')
    w()
    w('def execute_skill(name, params=None):')
    w('    """执行技能。"""')
    w('    return {"found": False, "result": ""}')
    w()
    w('def learn_skill_from_llm(content):')
    w('    """从 LLM 输出学习技能。"""')
    w('    return {"skills_created": [], "count": 0}')
    w()
    w('def mcp_list_tools(server="__internal__"):')
    w('    """列出 MCP 服务器工具。"""')
    w('    return {"tools": []}')
    w()
    w('def mcp_call_tool(server, name, arguments=None):')
    w('    """调用 MCP 工具。"""')
    w('    return {"success": False, "result": ""}')
    w()
  } else {
    w('async def call_llm(model: str, system_prompt: str, user_input: str, user_template: str, context: str = "", config: dict = None) -> dict:')
    w('    # TODO: 接入你的 LLM API')
    w('    if config is None: config = {}')
    w('    content = user_template.replace("{{input}}", str(user_input)) if user_template else str(user_input)')
    w('    messages = []')
    w('    if system_prompt: messages.append({"role": "system", "content": system_prompt})')
    w('    if context: messages.append({"role": "system", "content": f"上下文信息: {context}"})')
    w('    messages.append({"role": "user", "content": content})')
    w('    return {"result": f"[模拟] {model} 输出", "usage": {"total_tokens": 0}}')
    w()
    w('async def call_http(url: str, method: str, headers: dict, body: str) -> dict:')
    w('    # TODO: 接入 HTTP 客户端')
    w('    return {"status": 200, "data": {"ok": True}}')
    w()
    w('async def execute_python_code(code: str, inputs: dict, timeout: int) -> dict:')
    w('    # TODO: 接入沙箱执行')
    w('    return {"result": None, "error": None}')
    w()
    w('async def web_search(query: str, top_k: int) -> dict:')
    w('    # TODO: 接入搜索 API')
    w('    return {"results": [], "summary": ""}')
    w()
    w('async def search_knowledge(query: str, top_k: int) -> dict:')
    w('    # TODO: 接入知识库检索 API')
    w('    return {"results": [], "context": ""}')
    w()
    w('async def call_tool(name: str, args: dict) -> dict:')
    w('    # TODO: 接入工具调用 API')
    w('    return {"success": False, "result": "", "error": f"tool {name} not implemented"}')
    w()
    w('async def register_tool_from_llm(content: str) -> dict:')
    w('    # TODO: 接入 LLM 工具注册 API')
    w('    return {"tools_registered": [], "count": 0}')
    w()
    w('async def execute_skill(name: str, params: dict) -> dict:')
    w('    # TODO: 接入技能执行 API')
    w('    return {"found": False, "result": ""}')
    w()
    w('async def learn_skill_from_llm(content: str) -> dict:')
    w('    # TODO: 接入 LLM 技能学习 API')
    w('    return {"skills_created": [], "count": 0}')
    w()
    w('async def mcp_list_tools(server: str = "__internal__") -> dict:')
    w('    # TODO: 接入 MCP 工具列表 API')
    w('    return {"tools": []}')
    w()
    w('async def mcp_call_tool(server: str, name: str, arguments: dict) -> dict:')
    w('    # TODO: 接入 MCP 工具调用 API')
    w('    return {"success": False, "result": ""}')
    w()
  }

  w()
  if (desktopGUI) {
    w()
    comment('Desktop GUI application — thread-safe Tkinter flow executor')
    w('class FlowApp:')
    w('    """基于 Tkinter 的流程执行器，线程安全弹窗交互。"""')
    w('    def __init__(self, master):')
    w('        self.master = master')
    w('        self._vars: dict = {}')
    w('        self._memory: dict = {}')
    w('        master.title("AI Flow Canvas - 流程执行器")')
    w('        master.geometry("900x700")')
    w('        master.minsize(600, 400)')
    w()
    w('        toolbar = tk.Frame(master)')
    w('        toolbar.pack(fill=tk.X, padx=10, pady=(8, 0))')
    w('        self.run_btn = tk.Button(toolbar, text="▶ 运行流程", font=("", 11),')
    w('                                 command=self.start_flow, bg="#0078d4", fg="white",')
    w('                                 padx=16, pady=4, cursor="hand2")')
    w('        self.run_btn.pack(side=tk.LEFT)')
    w('        self.status_lbl = tk.Label(toolbar, text="就绪", fg="#888", font=("", 10))')
    w('        self.status_lbl.pack(side=tk.LEFT, padx=12)')
    w()
    w('        self.text = scrolledtext.ScrolledText(master, wrap=tk.WORD,')
    w('                                              font=("Consolas", 10),')
    w('                                              bg="#1e1e1e", fg="#d4d4d4",')
    w('                                              insertbackground="white")')
    w('        self.text.pack(fill=tk.BOTH, expand=True, padx=10, pady=8)')
    w()
    w('    def log(self, msg: str):')
    w('        """线程安全追加日志。"""')
    w('        self.master.after(0, lambda: self.text.insert(tk.END, msg + "\\n") or self.text.see(tk.END))')
    w()
    w('    def start_flow(self):')
    w('        """启动流程执行（后台线程）。"""')
    w('        self.text.delete(1.0, tk.END)')
    w('        self.run_btn.config(state=tk.DISABLED, text="⏳ 运行中…")')
    w('        self.status_lbl.config(text="运行中…", fg="#0078d4")')
    w('        self.log("正在执行流程…")')
    w('        self.master.after(100, self._poll_dialog)')
    w('        import threading')
    w('        threading.Thread(target=self._run, daemon=True).start()')
    w()
    w('    def _poll_dialog(self):')
    w('        """GUI 线程轮询对话框队列。"""')
    w('        try:')
    w('            cmd, args = _dialog_q.get_nowait()')
    w('            if cmd == "input":')
    w('                v = simpledialog.askstring(')
    w('                    args["title"], args["prompt"],')
    w('                    parent=self.master, initialvalue=args.get("default", ""),')
    w('                )')
    w('                _result_q.put(v or args.get("default", ""))')
    w('            elif cmd == "approval":')
    w('                ok = messagebox.askyesno(args["title"], args["message"], parent=self.master)')
    w('                _result_q.put(ok)')
    w('        except queue.Empty:')
    w('            pass')
    w('        if self.run_btn["state"] == "disabled":')
    w('            self.master.after(100, self._poll_dialog)')
    w()
    w('    def _run(self):')
    w('        """后台线程执行流程。"""')
    w('        try:')
    w('            results = run_flow()')
    w('            self.log("")')
    w('            self.log("=== 流程执行结果 ===")')
    w('            for name, output in results.items():')
    w('                self.log(f"  {name}: {json.dumps(output, ensure_ascii=False, indent=2)}")')
    w('            self.master.after(0, lambda: self.status_lbl.config(text="执行完成", fg="#107c10"))')
    w('        except Exception as e:')
    w('            self.log(f"流程执行错误: {e}")')
    w('            import traceback')
    w('            self.log(traceback.format_exc())')
    w('            self.master.after(0, lambda: self.status_lbl.config(text="执行失败", fg="#d32f2f"))')
    w('        finally:')
    w('            self.master.after(0, lambda: self.run_btn.config(state=tk.NORMAL, text="▶ 运行流程"))')
    w()
    w('def main():')
    w('    root = tk.Tk()')
    w('    app = FlowApp(root)')
    w('    root.mainloop()')
    w()
    w('if __name__ == "__main__":')
    w('    main()')
  } else {
    w('if __name__ == "__main__":')
    w('    _vars: dict = {}  # 流程变量')
    w('    _memory: dict = {}  # 临时记忆')
    w('    results = asyncio.run(run_flow())')
    w('    print("\\n=== 流程执行结果 ===")')
    w('    for name, output in results.items():')
    w('        print(f"  {name}: {json.dumps(output, ensure_ascii=False, indent=2)}")')
  }

  return lines.join('\n')
}

function defaultReplacer(_key: string, value: unknown): unknown {
  return value
}
