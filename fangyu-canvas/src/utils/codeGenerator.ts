import type { Node, Edge } from 'reactflow'
import { getNodeMeta } from './nodeRegistry'
import { getExecutionOrder } from './flowHelper'
import { SAFE_EXPR_PYTHON } from './safeExprEmbed'

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
  embeddedKnowledge?: { chunks: Array<{ content: string; metadata?: Record<string, unknown> }> }
  embeddedSkills?: Record<string, string>
}

const INDENT = '    '

export function generatePythonCode(nodes: Node[], edges: Edge[], options: GenerateOptions = {}): string {
  const {
    includeComments = true,
    simulateInteractive = true,
    globalPrompts,
    desktopGUI = false,
    embeddedKnowledge,
    embeddedSkills,
  } = options
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
  w(SAFE_EXPR_PYTHON)
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
  comment('Topological sort for sub-graph execution')
  w('def _topo_sort(nodes: list, edges: list) -> list:')
  w(`${INDENT}nids = [n["id"] for n in nodes]`)
  w(`${INDENT}adj = {nid: [] for nid in nids}`)
  w(`${INDENT}indeg = {nid: 0 for nid in nids}`)
  w(`${INDENT}for e in edges:`)
  w(`${INDENT}${INDENT}s, t = e.get("sourceNodeId"), e.get("targetNodeId")`)
  w(`${INDENT}${INDENT}if s in adj and t in adj:`)
  w(`${INDENT}${INDENT}${INDENT}adj[s].append(t); indeg[t] = indeg.get(t, 0) + 1`)
  w(`${INDENT}q = [nid for nid in nids if indeg.get(nid, 0) == 0]`)
  w(`${INDENT}res = []`)
  w(`${INDENT}while q:`)
  w(`${INDENT}${INDENT}nid = q.pop(0)`)
  w(`${INDENT}${INDENT}res.append(nid)`)
  w(`${INDENT}${INDENT}for nb in adj.get(nid, []):`)
  w(`${INDENT}${INDENT}${INDENT}indeg[nb] -= 1`)
  w(`${INDENT}${INDENT}${INDENT}if indeg[nb] == 0: q.append(nb)`)
  w(`${INDENT}return res`)
  w()
  w(`_knowledge_base: dict = ${JSON.stringify({ chunks: embeddedKnowledge?.chunks ?? [] })}`)
  w(`_registered_tools: dict = {}`)
  w(`_inline_skills: dict = ${JSON.stringify(embeddedSkills ?? {})}`)
  w('_external_inputs: dict = {}')
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
    const upstreamIds = edges.filter(e => e.target === nodeId).map(e => e.source)
    w(`${INDENT}_inputs = {}`)
    for (const src of upstreamIds) {
      w(`${INDENT}_inputs.update(pool.get("${src}", {}))`)
    }

    switch (originType) {
      case 'start': {
        w(`${INDENT}${varName} = {**_external_inputs, "trigger": True}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'end': {
        w(`${INDENT}${varName} = {"result": _inputs.get("input", _inputs.get("result"))}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
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
      case 'agent-loop': {
        w(`${INDENT}# Agent 工具环 (Harness) — 画布预览走后端；完整手脚需 fangyu Bundle 运行时`)
        w(`${INDENT}# toolbelt=${String(config.toolbelt || 'coding')} max_turns=${Number(config.max_turns || 24)}`)
        w(`${INDENT}${varName} = {`)
        w(`${INDENT}${INDENT}"result": _inputs.get("input", _inputs.get("result", _inputs)),`)
        w(`${INDENT}${INDENT}"success": False,`)
        w(`${INDENT}${INDENT}"turns": 0,`)
        w(`${INDENT}${INDENT}"error": "agent-loop requires fangyu runtime (Studio 预览或 bundle chat)",`)
        w(`${INDENT}}`)
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
        w(`${INDENT}${INDENT}user_input=str(_inputs.get("input", _inputs.get("result", ""))),`)
        w(`${INDENT}${INDENT}user_template=${resolveTpl(globalPrompts?.user_prompt_template || config.prompt || '')},`)
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
        const expr = String(config.expression || 'input')
        const branchCount = Number(config.branch_count || 2)
        w(`${INDENT}# 条件: ${expr}`)
        w(`${INDENT}_cond_input = _inputs.get("input", _inputs.get("result"))`)
        w(`${INDENT}_cond_ctx = {"input": _cond_input, "inputs": _inputs, "_outputs": pool}`)
        w(`${INDENT}try:`)
        if (branchCount > 2) {
          w(`${INDENT}${INDENT}_cond_idx = max(0, min(int(safe_eval(${JSON.stringify(expr)}, _cond_ctx)), ${branchCount - 1}))`)
          w(`${INDENT}${INDENT}${varName} = {"result": _cond_idx, "branch": f"branch_{_cond_idx}"}`)
        } else {
          w(`${INDENT}${INDENT}_cond_pass = bool(safe_eval(${JSON.stringify(expr)}, _cond_ctx))`)
          w(`${INDENT}${INDENT}${varName} = {"result": _cond_pass, "branch": "true" if _cond_pass else "false", "true": _cond_pass, "false": not _cond_pass}`)
        }
        w(`${INDENT}except Exception:`)
        if (branchCount > 2) {
          w(`${INDENT}${INDENT}${varName} = {"result": 0, "branch": "branch_0"}`)
        } else {
          w(`${INDENT}${INDENT}_cond_pass = bool(_cond_input)`)
          w(`${INDENT}${INDENT}${varName} = {"result": _cond_pass, "branch": "true" if _cond_pass else "false", "true": _cond_pass, "false": not _cond_pass}`)
        }
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
        w(`${INDENT}${INDENT}inputs=_inputs,`)
        w(`${INDENT}${INDENT}timeout=${config.timeout || 5000},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'search': {
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}web_search(`)
        w(`${INDENT}${INDENT}query=str(_inputs.get("query", _inputs.get("input", ""))),`)
        w(`${INDENT}${INDENT}top_k=${config.top_k || 5},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'variable-set': {
        const varNameKey = config.var_name || 'var'
        const hasVarValue = config.var_value !== undefined && config.var_value !== null
        if (hasVarValue) {
          w(`${INDENT}_set_val = _inputs.get("value")`)
          w(`${INDENT}if _set_val is None or _set_val is True:`)
          w(`${INDENT}${INDENT}_set_val = ${JSON.stringify(config.var_value)}`)
        } else {
          w(`${INDENT}_set_val = _inputs.get("value", _inputs.get("result", _inputs))`)
        }
        w(`${INDENT}_vars["${varNameKey}"] = _set_val`)
        w(`${INDENT}${varName} = {"result": _vars["${varNameKey}"]}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'variable-get': {
        w(`${INDENT}${varName} = {"value": _vars.get("${config.var_name || ''}", None)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'transform': {
        const mapping = config.mapping || {}
        w(`${INDENT}# 数据转换映射: ${JSON.stringify(mapping, defaultReplacer)}`)
        w(`${INDENT}_src = _inputs.get("source")`)
        w(`${INDENT}if _src is None: _src = _inputs.get("input", _inputs.get("result", _inputs))`)
        w(`${INDENT}if not isinstance(_src, dict): _src = {"result": _src}`)
        w(`${INDENT}_mapped = {}`)
        w(`${INDENT}for _mk, _mp in ${JSON.stringify(mapping, defaultReplacer)}.items():`)
        w(`${INDENT}${INDENT}_cur = _src`)
        w(`${INDENT}${INDENT}for _part in str(_mp).split("."):`)
        w(`${INDENT}${INDENT}${INDENT}if isinstance(_cur, dict): _cur = _cur.get(_part)`)
        w(`${INDENT}${INDENT}${INDENT}else: _cur = None; break`)
        w(`${INDENT}${INDENT}_mapped[_mk] = _cur`)
        if (Object.keys(mapping).length > 0) {
          w(`${INDENT}${varName} = {"result": _mapped}`)
        } else {
          w(`${INDENT}${varName} = {"result": _src}`)
        }
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'json-parse': {
        const sourceLiteral = JSON.stringify(config.source ?? '')
        w(`${INDENT}_raw = _inputs.get("source")`)
        w(`${INDENT}if _raw is None: _raw = ${sourceLiteral}`)
        w(`${INDENT}if _raw is None: _raw = _inputs.get("result", _inputs)`)
        w(`${INDENT}try:`)
        w(`${INDENT}${INDENT}${varName} = {"result": json.loads(str(_raw)), "error": None}`)
        w(`${INDENT}except Exception as e:`)
        w(`${INDENT}${INDENT}${varName} = {"result": None, "error": str(e)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'memory-write': {
        w(`${INDENT}# 写入记忆: key=${config.memory_key || ''}, scope=${config.scope || 'session'}`)
        w(`${INDENT}_memory["${config.memory_key || ''}"] = _inputs.get("value", _inputs.get("result", _inputs))`)
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
        w(`${INDENT}${varName} = {"result": _inputs.get("input", _inputs.get("result"))}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'knowledge': {
        w(`${INDENT}# 知识库检索: top_k=${config.top_k || 5}`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}search_knowledge(`)
        w(`${INDENT}${INDENT}query=str(_inputs.get("query", _inputs.get("input", ""))),`)
        w(`${INDENT}${INDENT}top_k=${config.top_k || 5},`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'tool-call': {
        w(`${INDENT}# 工具调用: ${config.tool_name || ''}`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}call_tool(`)
        w(`${INDENT}${INDENT}name="${config.tool_name || ''}" or str(_inputs.get("tool_name", "")),`)
        w(`${INDENT}${INDENT}args=_inputs.get("args", ${JSON.stringify(config.args || {}, defaultReplacer)}),`)
        w(`${INDENT})`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'register-tool': {
        w(`${INDENT}# 从 LLM 输出注册工具`)
        w(`${INDENT}${varName} = ${desktopGUI ? '' : 'await '}register_tool_from_llm(`)
        w(`${INDENT}${INDENT}content=str(_inputs.get("llm_output", _inputs.get("result", _inputs))),`)
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
        w(`${INDENT}${INDENT}content=str(_inputs.get("llm_output", _inputs.get("result", _inputs))),`)
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
      case 'switch': {
        const expr = config.expression || 'input'
        w(`${INDENT}# 多路分支: ${expr}`)
        w(`${INDENT}_sw_input = _inputs.get("input", _inputs.get("result"))`)
        w(`${INDENT}try:`)
        w(`${INDENT}${INDENT}switch_val = safe_eval(${JSON.stringify(String(expr))}, {"input": _sw_input, "inputs": _inputs, "_outputs": pool})`)
        w(`${INDENT}except Exception:`)
        w(`${INDENT}${INDENT}switch_val = _sw_input`)
        w(`${INDENT}${varName} = {"result": switch_val, "branch": f"branch_{switch_val}"}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'loop': {
        const loopVar = config.loop_var || 'item'
        const maxIter = config.max_iterations || 100
        const innerNodes = JSON.stringify((node.data?.inner_nodes as unknown[]) || [])
        const innerLinks = JSON.stringify((node.data?.inner_links as unknown[]) || [])
        w(`${INDENT}# 循环体: loop_var=${loopVar}, max_iter=${maxIter}`)
        w(`${INDENT}loop_arr = _inputs.get("array", _inputs.get("result", ${JSON.stringify(config.items || [])}))`)
        w(`${INDENT}if not isinstance(loop_arr, list): loop_arr = [loop_arr]`)
        w(`${INDENT}inner_nodes = json.loads(r'''${innerNodes}''')`)
        w(`${INDENT}inner_links = json.loads(r'''${innerLinks}''')`)
        w(`${INDENT}loop_results = []`)
        w(`${INDENT}for idx, ${loopVar} in enumerate(loop_arr[:${maxIter}]):`)
        w(`${INDENT}${INDENT}_vars["${loopVar}"] = ${loopVar}`)
        w(`${INDENT}${INDENT}_vars["_loop_index"] = idx`)
        w(`${INDENT}${INDENT}_loop_in = {**_inputs, "item": ${loopVar}, "index": idx}`)
        w(`${INDENT}${INDENT}if inner_nodes:`)
        w(`${INDENT}${INDENT}${INDENT}_body_pool = {}`)
        w(`${INDENT}${INDENT}${INDENT}_body_order = _topo_sort(inner_nodes, inner_links)`)
        w(`${INDENT}${INDENT}${INDENT}for _nid in _body_order:`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_n = next((n for n in inner_nodes if n.get("id") == _nid), None)`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}if not _n: continue`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_nt = _n.get("originType", "start")`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_nc = _n.get("config", {}) or {}`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_in = dict(_loop_in)`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}for _ie in inner_links:`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}if _ie.get("targetNodeId") == _nid:`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}_src = _ie.get("sourceNodeId")`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}if _src in _body_pool: _in.update(_body_pool[_src])`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}if _nt == "input":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}_body_pool[_nid] = {"input": _in.get("input", _nc.get("default_value", ""))}`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}elif _nt == "output":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}_body_pool[_nid] = {"result": _in.get("input", _in.get("result"))}`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}elif _nt == "code":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}_lc = {"_input": _in, "input": _in, "item": _loop_in.get("item"), "index": idx, "result": None}`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}exec(str(_nc.get("code", "pass")), {"__builtins__": _SAFE_BUILTINS}, _lc)`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}_body_pool[_nid] = {"result": _lc.get("result")}`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}else:`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}_body_pool[_nid] = {"result": _in.get("result", _in)}`)
        w(`${INDENT}${INDENT}${INDENT}loop_results.append({"index": idx, "${loopVar}": ${loopVar}, "body_outputs": dict(_body_pool)})`)
        w(`${INDENT}${INDENT}else:`)
        w(`${INDENT}${INDENT}${INDENT}loop_results.append({"index": idx, "${loopVar}": ${loopVar}})`)
        w(`${INDENT}${varName} = {"result": loop_results, "count": len(loop_results)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'trigger': {
        w(`${INDENT}# 触发器: 接收外部消息`)
        w(`${INDENT}trigger_msg = _external_inputs.get("message", _inputs.get("message", ${JSON.stringify(config.default_message || '')}))`)
        w(`${INDENT}${varName} = {"message": trigger_msg, "triggered": True}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'prompt-assembly': {
        const stable = (config.stable as string) || ''
        const context = (config.context as string) || ''
        const volatile = (config.volatile as string) || ''
        w(`${INDENT}# 提示词组装: stable + context + volatile`)
        w(`${INDENT}stable_part = ${resolveTpl(stable)}`)
        w(`${INDENT}context_part = str(_inputs.get("context", ${resolveTpl(context)}))`)
        w(`${INDENT}volatile_part = str(_inputs.get("volatile", ${resolveTpl(volatile)}))`)
        w(`${INDENT}_assembled = ""`)
        w(`${INDENT}if stable_part: _assembled += stable_part + "\\n"`)
        w(`${INDENT}if context_part: _assembled += "\\n---\\n" + context_part + "\\n"`)
        w(`${INDENT}if volatile_part: _assembled += "\\n---\\n" + volatile_part + "\\n"`)
        w(`${INDENT}${varName} = {"assembled": _assembled.strip(), "prompt": _assembled.strip()}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'text-process': {
        const operation = config.operation as string || 'upper'
        w(`${INDENT}# 文本处理: ${operation}`)
        w(`${INDENT}input_text = str(_inputs.get("text", _inputs.get("input", "")))`)
        w(`${INDENT}if "${operation}" == "upper":`)
        w(`${INDENT}${INDENT}result_text = input_text.upper()`)
        w(`${INDENT}elif "${operation}" == "lower":`)
        w(`${INDENT}${INDENT}result_text = input_text.lower()`)
        w(`${INDENT}elif "${operation}" == "trim":`)
        w(`${INDENT}${INDENT}result_text = input_text.strip()`)
        w(`${INDENT}elif "${operation}" == "replace":`)
        w(`${INDENT}${INDENT}old = "${((config.replace_old as string) || '').replace(/"/g, '\\"')}"`)
        w(`${INDENT}${INDENT}new = "${((config.replace_new as string) || '').replace(/"/g, '\\"')}"`)
        w(`${INDENT}${INDENT}result_text = input_text.replace(old, new)`)
        w(`${INDENT}else:`)
        w(`${INDENT}${INDENT}result_text = input_text.upper()`)
        w(`${INDENT}${varName} = {"result": result_text}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'extract-memory': {
        const memKey = config.memory_key as string || 'extracted'
        w(`${INDENT}# 事实提取: key=${memKey}`)
        w(`${INDENT}source_text = str(_inputs.get("text", _inputs.get("input", "")))`)
        w(`${INDENT}extracted = source_text.strip() if source_text else None`)
        w(`${INDENT}if extracted:`)
        w(`${INDENT}${INDENT}_memory["${memKey}"] = extracted`)
        w(`${INDENT}${INDENT}${varName} = {"facts": [{"key": "${memKey}", "value": extracted}], "extracted": extracted, "count": 1}`)
        w(`${INDENT}else:`)
        w(`${INDENT}${INDENT}${varName} = {"facts": [], "extracted": None, "count": 0}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'search-sessions': {
        const query = config.query as string || ''
        w(`${INDENT}# 会话搜索: query=${query}`)
        w(`${INDENT}search_q = str(_inputs.get("query", ${resolveTpl(query)}))`)
        w(`${INDENT}search_results = []`)
        w(`${INDENT}# 遍历 _memory 实现会话搜索`)
        w(`${INDENT}for key, val in _memory.items():`)
        w(`${INDENT}${INDENT}if isinstance(val, str) and search_q.lower() in val.lower():`)
        w(`${INDENT}${INDENT}${INDENT}search_results.append({"key": key, "content": val})`)
        w(`${INDENT}${varName} = {"results": search_results, "count": len(search_results)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'composite':
      case 'composite-node': {
        const innerNodes = JSON.stringify((node.data?.inner_nodes as unknown[]) || [])
        const innerLinks = JSON.stringify((node.data?.inner_links as unknown[]) || [])
        const callPrefix = desktopGUI ? '' : 'await '
        w(`${INDENT}# 子图执行 (${originType})`)
        w(`${INDENT}inner_nodes = json.loads(r'''${innerNodes}''')`)
        w(`${INDENT}inner_links = json.loads(r'''${innerLinks}''')`)
        w(`${INDENT}if not inner_nodes:`)
        w(`${INDENT}${INDENT}${varName} = {"output": _inputs.get("input", _inputs.get("result")), "success": True}`)
        w(`${INDENT}else:`)
        w(`${INDENT}${INDENT}_sub_pool = {}`)
        w(`${INDENT}${INDENT}_sub_order = _topo_sort(inner_nodes, inner_links)`)
        w(`${INDENT}${INDENT}for _nid in _sub_order:`)
        w(`${INDENT}${INDENT}${INDENT}_n = next((n for n in inner_nodes if n.get("id") == _nid), None)`)
        w(`${INDENT}${INDENT}${INDENT}if not _n: continue`)
        w(`${INDENT}${INDENT}${INDENT}_nt = _n.get("originType", "start")`)
        w(`${INDENT}${INDENT}${INDENT}_nc = _n.get("config", {}) or {}`)
        w(`${INDENT}${INDENT}${INDENT}_in = {}`)
        w(`${INDENT}${INDENT}${INDENT}for _ie in inner_links:`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}if _ie.get("targetNodeId") == _nid:`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}_src = _ie.get("sourceNodeId")`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}if _src in _sub_pool: _in.update(_sub_pool[_src])`)
        w(`${INDENT}${INDENT}${INDENT}if not _in: _in.update(_inputs)`)
        w(`${INDENT}${INDENT}${INDENT}if _nt in ("start", "trigger"):`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = {**_in, "trigger": True}`)
        w(`${INDENT}${INDENT}${INDENT}elif _nt == "input":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = {"input": _in.get("input", _nc.get("default_value", ""))}`)
        w(`${INDENT}${INDENT}${INDENT}elif _nt == "llm":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = ${callPrefix}call_llm(`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}model=_nc.get("model", "gpt-4o"),`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}system_prompt=_nc.get("system_prompt", ""),`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}user_input=str(_in.get("input", _in.get("result", ""))),`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}user_template=_nc.get("prompt", ""),`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}context=str(_in.get("context", "")),`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}${INDENT}config=_nc,`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT})`)
        w(`${INDENT}${INDENT}${INDENT}elif _nt == "code":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = ${callPrefix}execute_python_code(_nc.get("code", ""), _in, _nc.get("timeout", 5000))`)
        w(`${INDENT}${INDENT}${INDENT}elif _nt == "search":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = ${callPrefix}web_search(str(_in.get("query", _in.get("input", ""))), int(_nc.get("top_k", 5)))`)
        w(`${INDENT}${INDENT}${INDENT}elif _nt == "knowledge":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = ${callPrefix}search_knowledge(str(_in.get("query", _in.get("input", ""))), int(_nc.get("top_k", 5)))`)
        w(`${INDENT}${INDENT}${INDENT}elif _nt == "output":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = {"result": _in.get("input", _in.get("result"))}`)
        w(`${INDENT}${INDENT}${INDENT}else:`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = {"result": _in.get("result", _in)}`)
        w(`${INDENT}${INDENT}${varName} = {"outputs": dict(_sub_pool), "success": True}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      default: {
        if (originType === 'atom-node' || !originType) {
          w(`${INDENT}${varName} = {"result": _inputs.get("result", _inputs.get("input", _inputs))}`)
        } else {
          w(`${INDENT}# 未注册节点类型 "${originType}" — 透传上游数据`)
          w(`${INDENT}${varName} = {"result": _inputs.get("result", _inputs), "type": "${originType}"}`)
        }
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
    w('    """调用 OpenAI 兼容 LLM API。设置 LLM_API_KEY / LLM_ENDPOINT 环境变量。"""')
    w('    import os, json, urllib.request, urllib.error')
    w('    if config is None: config = {}')
    w('    api_key = os.environ.get("LLM_API_KEY", config.get("api_key", ""))')
    w('    endpoint = os.environ.get("LLM_ENDPOINT", "https://api.openai.com/v1/chat/completions")')
    w('    content = user_template.replace("{{input}}", str(user_input)) if user_template else str(user_input)')
    w('    messages = []')
    w('    if system_prompt: messages.append({"role": "system", "content": system_prompt})')
    w('    if context: messages.append({"role": "system", "content": f"上下文信息: {context}"})')
    w('    messages.append({"role": "user", "content": content})')
    w('    body = json.dumps({"model": model, "messages": messages, "temperature": config.get("temperature", 0.7), "max_tokens": config.get("max_tokens", 2048)}).encode()')
    w('    req = urllib.request.Request(endpoint, data=body, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")')
    w('    try:')
    w('        with urllib.request.urlopen(req, timeout=60) as resp:')
    w('            data = json.loads(resp.read().decode())')
    w('            return {"result": data["choices"][0]["message"]["content"], "usage": data.get("usage", {})}')
    w('    except urllib.error.HTTPError as e:')
    w('        return {"result": "", "error": f"LLM API {e.code}: {e.read().decode()[:200]}"}')
    w('    except Exception as e:')
    w('        return {"result": "", "error": str(e)}')
    w()
    w('def call_http(url, method="GET", headers=None, body=""):')
    w('    """执行 HTTP 请求。"""')
    w('    import json, urllib.request, urllib.error')
    w('    data = body.encode("utf-8") if body else None')
    w('    hdrs = {"Content-Type": "application/json"}')
    w('    if headers and isinstance(headers, dict): hdrs.update(headers)')
    w('    req = urllib.request.Request(url, data=data, headers=hdrs, method=method or "GET")')
    w('    try:')
    w('        with urllib.request.urlopen(req, timeout=30) as resp:')
    w('            raw = resp.read().decode("utf-8", errors="replace")')
    w('            try: parsed = json.loads(raw)')
    w('            except: parsed = raw')
    w('            return {"status": resp.status, "data": parsed}')
    w('    except urllib.error.HTTPError as e:')
    w('        return {"status": e.code, "error": e.read().decode("utf-8", errors="replace")[:500]}')
    w('    except Exception as e:')
    w('        return {"status": 0, "error": str(e)}')
    w()
    w('import builtins as _bi')
    w('_SAFE_BUILTINS = {k: getattr(_bi, k) for k in ("len","str","int","float","list","dict","tuple","bool","range","enumerate","zip","map","filter","min","max","sum","sorted","reversed","abs","round","type","isinstance","True","False","None","Exception","ValueError","KeyError","TypeError")}')
    w()
    w('def execute_python_code(code, inputs=None, timeout=30):')
    w('    """在受限沙箱中执行 Python 代码。"""')
    w('    import sys, io, textwrap')
    w('    _globals = {"__builtins__": _SAFE_BUILTINS, "inputs": inputs or {}, "_input": inputs or {}, "input": inputs or {}}')
    w('    _locals = {}')
    w('    stdout_capture = io.StringIO()')
    w('    old_stdout = sys.stdout')
    w('    try:')
    w('        sys.stdout = stdout_capture')
    w('        exec(textwrap.dedent(code or ""), _globals, _locals)')
    w('        result = _locals.get("result", _locals)')
    w('        return {"result": result, "stdout": stdout_capture.getvalue()[:2000], "error": None}')
    w('    except Exception as e:')
    w('        return {"result": None, "stdout": stdout_capture.getvalue()[:1000], "error": str(e)}')
    w('    finally:')
    w('        sys.stdout = old_stdout')
    w()
    w('def web_search(query, top_k=5):')
    w('    """DuckDuckGo 搜索（无需 API key）。"""')
    w('    import urllib.request, urllib.parse, re')
    w('    try:')
    w('        html_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"')
    w('        req = urllib.request.Request(html_url, headers={"User-Agent": "Mozilla/5.0"})')
    w('        with urllib.request.urlopen(req, timeout=15) as resp:')
    w('            html = resp.read().decode("utf-8", errors="replace")')
    w('        results = []')
    w('        for m in re.finditer(r\'<a[^>]+class="result__a"[^>]*>\\s*(.*?)\\s*</a>\', html):')
    w('            results.append({"title": m.group(1), "snippet": ""})')
    w('            if len(results) >= top_k: break')
    w('        return {"results": results, "summary": " ".join(r["title"] for r in results[:3])}')
    w('    except Exception as e:')
    w('        return {"results": [], "summary": "", "error": str(e)}')
    w()
    w('def search_knowledge(query, top_k=5):')
    w('    """知识库关键词检索。"""')
    w('    q = query.lower()')
    w('    docs = _knowledge_base.get("chunks", [])')
    w('    scored = [(d, d.get("content", "").lower().count(q)) for d in docs]')
    w('    scored.sort(key=lambda x: -x[1])')
    w('    results = [{"content": d[0]["content"], "metadata": d[0].get("metadata", {})} for d in scored[:top_k] if d[1] > 0]')
    w('    context = "\\n".join(r["content"] for r in results)')
    w('    return {"results": results, "context": context}')
    w()
    w('def call_tool(name, args=None):')
    w('    """调用内置工具。"""')
    w('    import datetime')
    w('    builtin = {')
    w('        "calculator": lambda a: {"result": safe_calc(str(a.get("expression", "0"))), "success": True},')
    w('        "current_time": lambda a: {"result": datetime.datetime.now().isoformat(), "success": True},')
    w('        "echo": lambda a: {"result": a, "success": True},')
    w('    }')
    w('    fn = builtin.get(name)')
    w('    if fn: return fn(args or {})')
    w('    return {"success": False, "result": "", "error": f"tool {name} not found"}')
    w()
    w('def register_tool_from_llm(content):')
    w('    """从 LLM 输出解析并注册工具。"""')
    w('    import json, re')
    w('    registered = []')
    w('    for m in re.finditer(r\'```(?:tool|json)\\s*\\n({.*?\\n})\\s*```\', content, re.DOTALL):')
    w('        try:')
    w('            td = json.loads(m.group(1))')
    w('            if "name" in td: _registered_tools[td["name"]] = td; registered.append(td)')
    w('        except: pass')
    w('    return {"tools_registered": registered, "count": len(registered)}')
    w()
    w('def execute_skill(name, params=None):')
    w('    """执行内联技能。"""')
    w('    import re')
    w('    code = _inline_skills.get(name)')
    w('    if not code: return {"found": False, "result": "", "error": f"skill {name} not found"}')
    w('    m = re.search(r"```python\\n(.*?)\\n```", code, re.DOTALL)')
    w('    if m: code = m.group(1)')
    w('    _g = {"__builtins__": _SAFE_BUILTINS, "inputs": params or {}, "result": None}')
    w('    try:')
    w('        exec(code, _g)')
    w('        return {"found": True, "result": _g.get("result"), "error": None}')
    w('    except Exception as e:')
    w('        return {"found": False, "result": "", "error": str(e)}')
    w()
    w('def learn_skill_from_llm(content):')
    w('    """从 LLM 输出学习技能。"""')
    w('    import json, re')
    w('    learned = []')
    w('    for m in re.finditer(r"```skill\\s*\\n({.*?\\n})\\s*```", content, re.DOTALL):')
    w('        try:')
    w('            sd = json.loads(m.group(1))')
    w('            if "name" in sd: _inline_skills[sd["name"]] = sd.get("code", json.dumps(sd)); learned.append(sd)')
    w('        except: pass')
    w('    return {"skills_created": learned, "count": len(learned)}')
    w()
    w('def mcp_list_tools(server="__internal__"):')
    w('    """列出 MCP 工具（需后端在线）。"""')
    w('    import json, urllib.request')
    w('    ep = _external_inputs.get("mcp_endpoint", "http://localhost:8000/api/v1/mcp/tools")')
    w('    try:')
    w('        req = urllib.request.Request(f"{ep}?server={server}", method="GET")')
    w('        with urllib.request.urlopen(req, timeout=10) as resp:')
    w('            return json.loads(resp.read().decode())')
    w('    except: return {"tools": []}')
    w()
    w('def mcp_call_tool(server, name, arguments=None):')
    w('    """调用 MCP 工具。"""')
    w('    import json, urllib.request')
    w('    ep = _external_inputs.get("mcp_endpoint", "http://localhost:8000/api/v1/mcp/call")')
    w('    body = json.dumps({"server": server, "name": name, "arguments": arguments or {}}).encode()')
    w('    try:')
    w('        req = urllib.request.Request(ep, data=body, headers={"Content-Type": "application/json"}, method="POST")')
    w('        with urllib.request.urlopen(req, timeout=30) as resp:')
    w('            return json.loads(resp.read().decode())')
    w('    except: return {"success": False, "result": ""}')
    w()
  } else {
    w('async def call_llm(model: str, system_prompt: str, user_input: str, user_template: str, context: str = "", config: dict = None) -> dict:')
    w('    """调用 OpenAI 兼容的 LLM API。设置 LLM_API_KEY 和 LLM_ENDPOINT 环境变量。"""')
    w('    import os, json, urllib.request, urllib.error')
    w('    if config is None: config = {}')
    w('    api_key = os.environ.get("LLM_API_KEY", config.get("api_key", ""))')
    w('    endpoint = os.environ.get("LLM_ENDPOINT", "https://api.openai.com/v1/chat/completions")')
    w('    content = user_template.replace("{{input}}", str(user_input)) if user_template else str(user_input)')
    w('    messages = []')
    w('    if system_prompt: messages.append({"role": "system", "content": system_prompt})')
    w('    if context: messages.append({"role": "system", "content": f"上下文信息: {context}"})')
    w('    messages.append({"role": "user", "content": content})')
    w('    body = json.dumps({"model": model, "messages": messages, "temperature": config.get("temperature", 0.7), "max_tokens": config.get("max_tokens", 2048)}).encode()')
    w('    req = urllib.request.Request(endpoint, data=body, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")')
    w('    try:')
    w('        with urllib.request.urlopen(req, timeout=60) as resp:')
    w('            data = json.loads(resp.read().decode())')
    w('            return {"result": data["choices"][0]["message"]["content"], "usage": data.get("usage", {})}')
    w('    except urllib.error.HTTPError as e:')
    w('        return {"result": "", "error": f"LLM API {e.code}: {e.read().decode()[:200]}"}')
    w('    except Exception as e:')
    w('        return {"result": "", "error": str(e)}')
    w()
    w('async def call_http(url: str, method: str, headers: dict, body: str) -> dict:')
    w('    """执行 HTTP 请求。"""')
    w('    import json, urllib.request, urllib.error')
    w('    data = body.encode("utf-8") if body else None')
    w('    hdrs = {"Content-Type": "application/json"}')
    w('    if headers and isinstance(headers, dict): hdrs.update(headers)')
    w('    req = urllib.request.Request(url, data=data, headers=hdrs, method=method or "GET")')
    w('    try:')
    w('        with urllib.request.urlopen(req, timeout=30) as resp:')
    w('            raw = resp.read().decode("utf-8", errors="replace")')
    w('            try: parsed = json.loads(raw)')
    w('            except: parsed = raw')
    w('            return {"status": resp.status, "data": parsed}')
    w('    except urllib.error.HTTPError as e:')
    w('        return {"status": e.code, "error": e.read().decode("utf-8", errors="replace")[:500]}')
    w('    except Exception as e:')
    w('        return {"status": 0, "error": str(e)}')
    w()
    w('import builtins as _bi')
    w('_SAFE_BUILTINS = {k: getattr(_bi, k) for k in ("len","str","int","float","list","dict","tuple","bool","range","enumerate","zip","map","filter","min","max","sum","sorted","reversed","abs","round","type","isinstance","hasattr","getattr","True","False","None","Exception","ValueError","KeyError","TypeError")}')
    w()
    w('async def execute_python_code(code: str, inputs: dict, timeout: int) -> dict:')
    w('    """在受限沙箱中执行 Python 代码。"""')
    w('    import ast, sys, io, textwrap')
    w('    _globals = {"__builtins__": _SAFE_BUILTINS, "inputs": inputs or {}, "_input": inputs or {}, "input": inputs or {}}')
    w('    _locals = {}')
    w('    stdout_capture = io.StringIO()')
    w('    old_stdout = sys.stdout')
    w('    try:')
    w('        sys.stdout = stdout_capture')
    w('        exec(textwrap.dedent(code), _globals, _locals)')
    w('        result = _locals.get("result", _locals)')
    w('        return {"result": result, "stdout": stdout_capture.getvalue()[:2000], "error": None}')
    w('    except Exception as e:')
    w('        return {"result": None, "stdout": stdout_capture.getvalue()[:1000], "error": str(e)}')
    w('    finally:')
    w('        sys.stdout = old_stdout')
    w()
    w('async def web_search(query: str, top_k: int) -> dict:')
    w('    """执行网络搜索（DuckDuckGo，无需 API key）。"""')
    w('    import urllib.request, urllib.parse, re')
    w('    try:')
    w('        html_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"')
    w('        req = urllib.request.Request(html_url, headers={"User-Agent": "Mozilla/5.0"})')
    w('        with urllib.request.urlopen(req, timeout=15) as resp:')
    w('            html = resp.read().decode("utf-8", errors="replace")')
    w('        results = []')
    w('        for m in re.finditer(r\'<a[^>]+class="result__a"[^>]*>\\s*(.*?)\\s*</a>\', html):')
    w('            results.append({"title": m.group(1), "snippet": ""})')
    w('            if len(results) >= top_k: break')
    w('        return {"results": results, "summary": " ".join(r["title"] for r in results[:3])}')
    w('    except Exception as e:')
    w('        return {"results": [], "summary": "", "error": str(e)}')
    w()
    w('async def search_knowledge(query: str, top_k: int) -> dict:')
    w('    """知识库检索（关键词匹配 _knowledge_base 中的分块）。"""')
    w('    q = query.lower()')
    w('    docs = _knowledge_base.get("chunks", [])')
    w('    scored = [(d, d.get("content", "").lower().count(q)) for d in docs]')
    w('    scored.sort(key=lambda x: -x[1])')
    w('    results = [{"content": d[0]["content"], "metadata": d[0].get("metadata", {})} for d in scored[:top_k] if d[1] > 0]')
    w('    context = "\\n".join(r["content"] for r in results)')
    w('    return {"results": results, "context": context}')
    w()
    w('async def call_tool(name: str, args: dict) -> dict:')
    w('    """调用内置工具（计算器、时间、echo）。"""')
    w('    import datetime')
    w('    builtin = {')
    w('        "calculator": lambda a: {"result": safe_calc(str(a.get("expression", "0"))), "success": True},')
    w('        "current_time": lambda a: {"result": datetime.datetime.now().isoformat(), "success": True},')
    w('        "echo": lambda a: {"result": a, "success": True},')
    w('    }')
    w('    fn = builtin.get(name)')
    w('    if fn: return fn(args or {})')
    w('    return {"success": False, "result": "", "error": f"tool {name} not found"}')
    w()
    w('async def register_tool_from_llm(content: str) -> dict:')
    w('    """从 LLM 输出解析并注册工具。"""')
    w('    import json, re')
    w('    registered = []')
    w('    for m in re.finditer(r\'```(?:tool|json)\\s*\\n({.*?\\n})\\s*```\', content, re.DOTALL):')
    w('        try:')
    w('            td = json.loads(m.group(1))')
    w('            if "name" in td: _registered_tools[td["name"]] = td; registered.append(td)')
    w('        except: pass')
    w('    return {"tools_registered": registered, "count": len(registered)}')
    w()
    w('async def execute_skill(name: str, params: dict) -> dict:')
    w('    """执行内联注册的技能 Python 代码。"""')
    w('    import re')
    w('    code = _inline_skills.get(name)')
    w('    if not code: return {"found": False, "result": "", "error": f"skill {name} not found"}')
    w('    m = re.search(r"```python\\n(.*?)\\n```", code, re.DOTALL)')
    w('    if m: code = m.group(1)')
    w('    _g = {"__builtins__": _SAFE_BUILTINS, "inputs": params or {}, "result": None}')
    w('    try:')
    w('        exec(code, _g)')
    w('        return {"found": True, "result": _g.get("result"), "error": None}')
    w('    except Exception as e:')
    w('        return {"found": False, "result": "", "error": str(e)}')
    w()
    w('async def learn_skill_from_llm(content: str) -> dict:')
    w('    """从 LLM 输出解析并注册技能。"""')
    w('    import json, re')
    w('    learned = []')
    w('    for m in re.finditer(r"```skill\\s*\\n({.*?\\n})\\s*```", content, re.DOTALL):')
    w('        try:')
    w('            sd = json.loads(m.group(1))')
    w('            if "name" in sd: _inline_skills[sd["name"]] = sd.get("code", json.dumps(sd)); learned.append(sd)')
    w('        except: pass')
    w('    return {"skills_created": learned, "count": len(learned)}')
    w()
    w('async def mcp_list_tools(server: str = "__internal__") -> dict:')
    w('    """列出 MCP 服务器工具。"""')
    w('    import json, urllib.request')
    w('    ep = _external_inputs.get("mcp_endpoint", "http://localhost:8000/api/v1/mcp/tools")')
    w('    try:')
    w('        req = urllib.request.Request(f"{ep}?server={server}", method="GET")')
    w('        with urllib.request.urlopen(req, timeout=10) as resp:')
    w('            return json.loads(resp.read().decode())')
    w('    except: return {"tools": []}')
    w()
    w('async def mcp_call_tool(server: str, name: str, arguments: dict) -> dict:')
    w('    """调用 MCP 工具。"""')
    w('    import json, urllib.request')
    w('    ep = _external_inputs.get("mcp_endpoint", "http://localhost:8000/api/v1/mcp/call")')
    w('    body = json.dumps({"server": server, "name": name, "arguments": arguments}).encode()')
    w('    try:')
    w('        req = urllib.request.Request(ep, data=body, headers={"Content-Type": "application/json"}, method="POST")')
    w('        with urllib.request.urlopen(req, timeout=30) as resp:')
    w('            return json.loads(resp.read().decode())')
    w('    except: return {"success": False, "result": ""}')
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
