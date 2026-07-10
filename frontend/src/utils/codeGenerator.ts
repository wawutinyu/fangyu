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
  w('_knowledge_base: dict = {"chunks": []}')
  w('_registered_tools: dict = {}')
  w('_inline_skills: dict = {}')
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
      case 'switch': {
        const expr = config.expression || 'input'
        w(`${INDENT}# 多路分支: ${expr}`)
        w(`${INDENT}switch_val = ${resolveTpl(expr)}`)
        w(`${INDENT}${varName} = {"result": switch_val, "branch": f"branch_{switch_val}"}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'loop': {
        const loopVar = config.loop_var || 'item'
        const maxIter = config.max_iterations || 100
        w(`${INDENT}# 循环体: loop_var=${loopVar}, max_iter=${maxIter}`)
        w(`${INDENT}loop_arr = pool.get("${nodeId}", {}).get("array", [])`)
        w(`${INDENT}if not isinstance(loop_arr, list): loop_arr = [loop_arr]`)
        w(`${INDENT}loop_results = []`)
        w(`${INDENT}for idx, ${loopVar} in enumerate(loop_arr[:${maxIter}]):`)
        w(`${INDENT}${INDENT}# 子图执行（未展开）`)
        w(`${INDENT}${INDENT}loop_results.append({"index": idx, "${loopVar}": ${loopVar}})}`)
        w(`${INDENT}${varName} = {"result": loop_results, "count": len(loop_results)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'trigger': {
        w(`${INDENT}# 触发器: 接收外部消息`)
        w(`${INDENT}trigger_msg = _external_inputs.get("message", pool.get("${nodeId}", {}).get("message", ""))`)
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
        w(`${INDENT}context_part = ${resolveTpl(context)}`)
        w(`${INDENT}volatile_part = ${resolveTpl(volatile)}`)
        w(`${INDENT}${varName} = {"prompt": f"{stable_part}\\n{context_part}\\n{volatile_part}".strip()}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'text-process': {
        const operation = config.operation as string || 'upper'
        w(`${INDENT}# 文本处理: ${operation}`)
        w(`${INDENT}input_text = str(pool.get("${nodeId}", {}).get("input", pool.get("${nodeId}", "")))`)
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
        w(`${INDENT}source_text = str(pool.get("${nodeId}", {}).get("input", ""))`)
        w(`${INDENT}extracted = source_text.strip() if source_text else None`)
        w(`${INDENT}if extracted:`)
        w(`${INDENT}${INDENT}_memory["${memKey}"] = extracted`)
        w(`${INDENT}${varName} = {"extracted": extracted, "count": 1 if extracted else 0}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'search-sessions': {
        const query = config.query as string || ''
        w(`${INDENT}# 会话搜索: query=${query}`)
        w(`${INDENT}search_q = ${resolveTpl(query)}`)
        w(`${INDENT}search_results = []`)
        w(`${INDENT}# 遍历 _memory 实现会话搜索`)
        w(`${INDENT}for key, val in _memory.items():`)
        w(`${INDENT}${INDENT}if isinstance(val, str) and search_q.lower() in val.lower():`)
        w(`${INDENT}${INDENT}${INDENT}search_results.append({"key": key, "content": val})`)
        w(`${INDENT}${varName} = {"results": search_results, "count": len(search_results)}`)
        w(`${INDENT}pool["${nodeId}"] = ${varName}`)
        break
      }
      case 'composite-node': {
        const innerNodes = JSON.stringify((node.data?.inner_nodes as unknown[]) || [])
        const innerLinks = JSON.stringify((node.data?.inner_links as unknown[]) || [])
        w(`${INDENT}# 子图执行 (composite-node)`)
        w(`${INDENT}inner_nodes = json.loads(r'''${innerNodes}''')`)
        w(`${INDENT}inner_links = json.loads(r'''${innerLinks}''')`)
        w(`${INDENT}if not inner_nodes:`)
        w(`${INDENT}${INDENT}${varName} = {"output": pool.get("${nodeId}", {}).get("input"), "success": True}`)
        w(`${INDENT}else:`)
        w(`${INDENT}${INDENT}_sub_pool = {}`)
        w(`${INDENT}${INDENT}_sub_inputs = {k: v for k, v in pool.items() if k != "${nodeId}"}`)
        w(`${INDENT}${INDENT}_sub_order = _topo_sort(inner_nodes, inner_links)`)
        w(`${INDENT}${INDENT}for _nid in _sub_order:`)
        w(`${INDENT}${INDENT}${INDENT}_n = next((n for n in inner_nodes if n.get("id") == _nid), None)`)
        w(`${INDENT}${INDENT}${INDENT}if not _n: continue`)
        w(`${INDENT}${INDENT}${INDENT}_nt = _n.get("originType", "start")`)
        w(`${INDENT}${INDENT}${INDENT}_nc = _n.get("config", {})`)
        w(`${INDENT}${INDENT}${INDENT}_in = _sub_pool.get(_nid, {})`)
        w(`${INDENT}${INDENT}${INDENT}if _nt == "input":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = {"input": _sub_inputs.get("input", _nc.get("default_value", ""))}`)
        w(`${INDENT}${INDENT}${INDENT}elif _nt == "llm":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = {"result": "[sub-graph llm stub]"}`)
        w(`${INDENT}${INDENT}${INDENT}elif _nt == "output":`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = {"result": _in.get("input")}`)
        w(`${INDENT}${INDENT}${INDENT}else:`)
        w(`${INDENT}${INDENT}${INDENT}${INDENT}_sub_pool[_nid] = {"result": str(_in)}`)
        w(`${INDENT}${INDENT}${varName} = {"outputs": {k: v for k, v in _sub_pool.items()}, "success": True}`)
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
    w('_SAFE_BUILTINS = {k: __builtins__[k] for k in ("len","str","int","float","list","dict","tuple","bool","range","enumerate","zip","map","filter","min","max","sum","sorted","reversed","abs","round","type","isinstance","hasattr","getattr","True","False","None","Exception","ValueError","KeyError","TypeError")}')
    w()
    w('async def execute_python_code(code: str, inputs: dict, timeout: int) -> dict:')
    w('    """在受限沙箱中执行 Python 代码。"""')
    w('    import ast, sys, io, textwrap')
    w('    _globals = {"__builtins__": _SAFE_BUILTINS, "inputs": inputs or {}}')
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
    w('        "calculator": lambda a: {"result": eval(a.get("expression","0"), {"__builtins__":{}}), "success": True},')
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
