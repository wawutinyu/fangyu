import { getNodeMeta } from './nodeRegistry'
import { getExecutionOrder } from './flowHelper'
import { VariablePool } from './variablePool'
import { safeEval, safeEvalBool } from './safeExpr'
import type { FlowNode, FlowEdge, InnerNodeDef, InnerLinkDef } from '../types'

const FETCH_TIMEOUT = 8000

function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), timeout)
  return fetch(url, { ...options, signal: options.signal || controller.signal })
}

let _lastLLMOutput = ''

function _tryExtractToolName(text: string): { toolName: string; args: Record<string, unknown> } | null {
  const jsonBlock = text.match(/```(?:json)?\s*\n?(\{.*?"(?:tool|tool_name|function)".*?\})\s*\n?```/s)
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1])
      const toolName = parsed.tool || parsed.tool_name || ''
      const args = parsed.args || {}
      if (toolName) return { toolName, args }
    } catch { /* ignore */ }
  }
  const inline = text.match(/\{[\s\n]*"(?:tool|tool_name)"[\s\n]*:[\s\n]*"([^"]+)"[\s\n]*,[\s\n]*"args"[\s\n]*:[\s\n]*(\{.*?\})[\s\n]*\}/s)
  if (inline) {
    try {
      return { toolName: inline[1], args: JSON.parse(inline[2]) }
    } catch { /* ignore */ }
  }
  return null
}

export interface PendingInteraction {
  type: 'approval' | 'input' | 'breakpoint'
  nodeId: string
  nodeName: string
  inputData: Record<string, unknown>
  config: Record<string, unknown>
  resolve: (value: ApprovalResponse | InputResponse | null) => void
}

export interface ApprovalResponse {
  action: 'approved' | 'rejected'
  reason?: string
  modifiedData?: Record<string, unknown>
}

export interface InputResponse {
  value: string
}

export interface NodeResult {
  nodeId: string
  nodeName: string
  status: 'done' | 'error'
  output?: Record<string, unknown>
  error?: string
}

export interface LocalExecutorOptions {
  onProgress: (nodeId: string, status: 'running' | 'done' | 'error') => void
  onPending: (interaction: PendingInteraction) => void
  autoResolveInput?: boolean
  breakpoints?: string[]
}

export async function runLocalFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: LocalExecutorOptions,
): Promise<{ success: boolean; results: NodeResult[] }> {
  console.log(`[exec] runLocalFlow start nodes=${nodes.length} edges=${edges.length}`)
  const { onProgress, onPending, autoResolveInput, breakpoints } = options
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const order = getExecutionOrder(nodes.map(n => n.id), edges)
  console.log(`[exec] order=${JSON.stringify(order)}`)

  const pool = new VariablePool()
  const outputs = new Map<string, Record<string, unknown>>()
  const globalVars: Record<string, unknown> = {}

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)
    if (!node) {
      console.log(`[exec] node ${nodeId} NOT FOUND in nodeMap`)
      continue
    }

    const originType = node.data.originType || ''
    const meta = getNodeMeta(originType)
    const rawConfig = node.data.config || {}
    const nodeName = node.data.label || meta.name

    console.log(`[exec] node ${nodeId} type=${originType} name=${nodeName}`)

    const config = originType === 'input' ? rawConfig : pool.resolveInObject(rawConfig)

    // Collect input data from upstream nodes
    const upstreamEdges = edges.filter(e => e.target === nodeId)
    const inputData: Record<string, unknown> = {}
    for (const edge of upstreamEdges) {
      const srcOutput = outputs.get(edge.source)
      if (srcOutput) Object.assign(inputData, srcOutput)
    }

    console.log(`[exec] node ${nodeId} inputData=${JSON.stringify(inputData).slice(0, 200)}`)
    onProgress(nodeId, 'running')

    // Breakpoint pause
    if (breakpoints?.includes(nodeId)) {
      await new Promise<null>(resolve => {
        onPending({
          type: 'breakpoint',
          nodeId,
          nodeName,
          inputData: {},
          config,
          resolve: resolve as unknown as PendingInteraction['resolve'],
        })
      })
    }

    try {
      const meta = getNodeMeta(originType)
      const inputPorts = new Set(meta.inputSchema.map(p => p.name))
      const outputPorts = new Set(meta.outputSchema.map(p => p.name))

      // Build inputData using port mapping from handles
      const usePortMapping = upstreamEdges.some(e => e.targetHandle)
      if (usePortMapping) {
        for (const key of Object.keys(inputData)) delete inputData[key]
        for (const edge of upstreamEdges) {
          const srcOutput = outputs.get(edge.source)
          if (!srcOutput) continue
          const tPort = edge.targetHandle
          if (!tPort || !inputPorts.has(tPort)) continue
          const mappings = (edge.data?.mappings as Record<string, string>) || {}
          // Priority: 1) mappings 2) field matching tPort name 3) sourceHandle 4) first field
          let srcField: string | undefined
          if (mappings[tPort]) {
            srcField = mappings[tPort]
          } else if (tPort in srcOutput) {
            srcField = tPort
          } else if (edge.sourceHandle && edge.sourceHandle in srcOutput) {
            srcField = edge.sourceHandle
          } else {
            srcField = Object.keys(srcOutput)[0]
          }
          if (srcField) inputData[tPort] = srcOutput[srcField]
        }
        // After port mapping, include non-output-port upstream fields (passthrough)
        for (const edge of upstreamEdges) {
          const srcOutput = outputs.get(edge.source)
          if (!srcOutput) continue
          for (const [k, v] of Object.entries(srcOutput)) {
            if (!outputPorts.has(k) && !(k in inputData)) {
              inputData[k] = v
            }
          }
        }
      }

      let nodeOutput: Record<string, unknown> = {}
      if (originType === 'approval') {
        const response = await new Promise<ApprovalResponse | null>(resolve => {
          onPending({
            type: 'approval',
            nodeId,
            nodeName,
            inputData: {},
            config,
            resolve: resolve as PendingInteraction['resolve'],
          })
        })
        if (!response || response.action === 'rejected') {
          nodeOutput = { rejected: response?.reason || '用户拒绝', approved: undefined }
        } else {
          nodeOutput = { approved: response.modifiedData || {}, rejected: undefined }
        }
      } else if (originType === 'input') {
        let response: InputResponse | null = null
        if (autoResolveInput) {
          response = { value: (config.default_value as string) || '' }
        } else {
          response = await new Promise<InputResponse | null>(resolve => {
            onPending({
              type: 'input',
              nodeId,
              nodeName,
              inputData: {},
              config,
              resolve: resolve as PendingInteraction['resolve'],
            })
          })
        }
        nodeOutput = { input: response?.value ?? config.default_value ?? '' }
      } else {
        nodeOutput = await simulateNode(originType, config, inputData, node, globalVars)
      }

      // Passthrough: carry forward upstream data + node's own output
      const passthroughFields: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(inputData)) {
        if (!outputPorts.has(k)) passthroughFields[k] = v
      }
      console.log(`[exec] node ${nodeId} output=${JSON.stringify(nodeOutput).slice(0, 200)}`)
      outputs.set(nodeId, { ...passthroughFields, ...nodeOutput })
      pool.addOutputs(nodeId, outputs.get(nodeId) || {})
      onProgress(nodeId, 'done')
    } catch (err) {
      onProgress(nodeId, 'error')
      return {
        success: false,
        results: [{ nodeId, nodeName, status: 'error', error: String(err) }],
      }
    }
  }

  return {
    success: true,
    results: Array.from(outputs.entries()).map(([nodeId, output]) => ({
      nodeId,
      nodeName: nodeMap.get(nodeId)?.data?.label as string || '',
      status: 'done' as const,
      output,
    })),
  }
}

async function runSubGraph(
  innerNodes: InnerNodeDef[],
  innerLinks: InnerLinkDef[],
  baseInputs: Record<string, unknown>,
  globalVars: Record<string, unknown>,
): Promise<Record<string, Record<string, unknown>>> {
  const flowNodes: FlowNode[] = innerNodes.map(n => ({
    id: n.id,
    type: 'atom-node',
    position: { x: 0, y: 0 },
    data: {
      originType: n.originType,
      label: n.label || n.name || n.originType,
      config: n.config || {},
    },
  }))
  const flowEdges: FlowEdge[] = innerLinks.map((l, i) => ({
    id: `inner-${i}`,
    source: l.sourceNodeId,
    target: l.targetNodeId,
    type: 'flow-edge',
    data: { linkType: l.linkType || 'serial', mappings: l.mappings || {} },
  }))
  const nodeMap = new Map(flowNodes.map(n => [n.id, n]))
  const order = getExecutionOrder(flowNodes.map(n => n.id), flowEdges)
  const subOutputs = new Map<string, Record<string, unknown>>()

  for (const nodeId of order) {
    const n = nodeMap.get(nodeId)
    if (!n) continue
    const inputData: Record<string, unknown> = {}
    for (const link of innerLinks) {
      if (link.targetNodeId === nodeId) {
        const src = subOutputs.get(link.sourceNodeId)
        if (src) Object.assign(inputData, src)
      }
    }
    const hasInnerUpstream = innerLinks.some(l => l.targetNodeId === nodeId)
    if (!hasInnerUpstream) {
      Object.assign(inputData, baseInputs)
    }
    const ot = n.data.originType || ''
    const cfg = n.data.config || {}
    if (ot === 'start' || ot === 'trigger') {
      subOutputs.set(nodeId, { ...inputData, trigger: true })
    } else if (ot === 'input') {
      subOutputs.set(nodeId, { input: inputData.input ?? cfg.default_value ?? '' })
    } else if (ot === 'output') {
      subOutputs.set(nodeId, { result: inputData.input ?? inputData.result })
    } else {
      subOutputs.set(nodeId, await simulateNode(ot, cfg, inputData, n, globalVars))
    }
  }
  return Object.fromEntries(subOutputs)
}

async function simulateNode(
  originType: string,
  config: Record<string, unknown>,
  inputData: Record<string, unknown>,
  node?: FlowNode,
  globalVars: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (originType) {
    case 'switch': {
      const expr = (config.expression as string) || 'input'
      const inputVal = inputData.input ?? inputData.result ?? inputData
      try {
        const value = safeEval(expr, { input: inputVal, inputs: inputData })
        return { result: value, branch: `branch_${value}` }
      } catch {
        return { result: inputVal, branch: `branch_${inputVal}` }
      }
    }
    case 'loop': {
      let arr = inputData.array ?? inputData.result ?? config.items ?? []
      if (!Array.isArray(arr)) arr = [arr]
      const maxIter = Number(config.max_iterations) || 100
      const loopVar = (config.loop_var as string) || 'item'
      const innerNodes = node?.data?.inner_nodes || []
      const innerLinks = node?.data?.inner_links || []
      const results: Record<string, unknown>[] = []
      for (let i = 0; i < Math.min(arr.length, maxIter); i++) {
        const item = arr[i]
        const entry: Record<string, unknown> = { index: i, [loopVar]: item }
        if (innerNodes.length > 0) {
          entry.body_outputs = await runSubGraph(
            innerNodes,
            innerLinks,
            { ...inputData, item, index: i, [loopVar]: item },
            globalVars,
          )
        }
        results.push(entry)
      }
      return { result: results, count: results.length }
    }
    case 'composite':
    case 'composite-node': {
      const innerNodes = node?.data?.inner_nodes || []
      const innerLinks = node?.data?.inner_links || []
      if (innerNodes.length === 0) {
        return { output: inputData.input ?? inputData.result, success: true }
      }
      const outputs = await runSubGraph(innerNodes, innerLinks, inputData, globalVars)
      return { outputs, success: true }
    }
    case 'condition': {
      const expr = (config.expression as string) || 'true'
      const inputVal = inputData.input ?? inputData.result ?? inputData
      const result = safeEvalBool(expr, { input: inputVal, inputs: inputData })
      return { result, branch: result ? 'true' : 'false', true: result, false: !result }
    }
    case 'code': {
      const code = (config.code as string) || 'return input'
      try {
        const fn = new Function('input', code)
        const result = fn(inputData)
        return { result }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'http': {
      const url = (config.url as string) || ''
      const method = (config.method as string) || 'GET'
      const body = config.body ? JSON.parse(config.body as string) : undefined
      try {
        const opts: RequestInit = { method }
        if (body) { opts.body = JSON.stringify(body); opts.headers = { 'Content-Type': 'application/json' } }
        const res = await fetchWithTimeout(url, opts)
        const text = await res.text()
        return { status: res.status, body: text }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'llm': {
      const prompt = (config.prompt as string) || (inputData as Record<string, unknown>)?.input || ''
      const model = (config.model as string) || 'default'
      const systemPrompt = (config.system_prompt as string) || ''
      const inputCtx = (inputData as Record<string, unknown>)?.context as string || ''
      const userMessage = inputCtx
        ? `上下文：\n${inputCtx}\n\n用户问题：${prompt}`
        : String(prompt)
      try {
        const res = await fetchWithTimeout('/api/v1/llm/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: userMessage },
            ],
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const content = data.result ?? data.content ?? ''
          _lastLLMOutput = content
          return { result: content, usage: data.usage || {} }
        }
      } catch { /* fallback to mock when backend unavailable */ }
      _lastLLMOutput = `[mock] LLM answer for: ${prompt.slice(0, 100)}`
      return { result: _lastLLMOutput, usage: {} }
    }
    case 'json-parse': {
      const source = inputData.source ?? config.source ?? inputData.result ?? inputData.input ?? inputData
      const raw = typeof source === 'string' ? source : JSON.stringify(source)
      try { return { result: JSON.parse(raw), error: null } }
      catch (e) { return { result: null, error: String(e) } }
    }
    case 'transform': {
      const mapping = config.mapping as Record<string, string> | undefined
      if (mapping && Object.keys(mapping).length > 0) {
        const src = (inputData.source ?? inputData.input ?? inputData.result ?? inputData) as Record<string, unknown>
        const base = typeof src === 'object' && src !== null ? src : { result: src }
        const mapped: Record<string, unknown> = {}
        for (const [k, path] of Object.entries(mapping)) {
          let cur: unknown = base
          for (const part of String(path).split('.')) {
            cur = (cur as Record<string, unknown>)?.[part]
          }
          mapped[k] = cur
        }
        return { result: mapped }
      }
      const expr = (config.expression as string) || ''
      if (!expr) return { result: inputData }
      try {
        const src = inputData.source ?? inputData.input ?? inputData
        const data = typeof src === 'object' && src !== null ? src : { result: src }
        const result = safeEval(expr, { data, input: inputData })
        return typeof result === 'object' && result !== null ? { result } : { result }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'mcp-tools': {
      const server = (config.server as string) || '__internal__'
      try {
        const res = await fetchWithTimeout(`/api/v1/mcp/tools?server=${encodeURIComponent(server)}`)
        if (!res.ok) return { error: `MCP server '${server}' not found` }
        const data = await res.json()
        return { result: data.tools || [] }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'mcp-call': {
      const server = (config.server as string) || (inputData as Record<string, unknown>)?.server as string || '__internal__'
      const toolName = (config.tool_name as string) || (inputData as Record<string, unknown>)?.tool_name as string || ''
      const argsRaw = (config.args as string) || '{}'
      const args = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw
      try {
        const res = await fetchWithTimeout('/api/v1/mcp/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server, name: toolName, arguments: args }),
        })
        if (!res.ok) return { error: (await res.json()).detail || 'MCP call failed' }
        const data = await res.json()
        return { result: data.result }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'knowledge': {
      const query = (inputData as Record<string, unknown>)?.query as string
        || (inputData as Record<string, unknown>)?.input as string || ''
      const topK = (config.top_k as number) || 5
      if (!query) return { error: 'query is required' }
      try {
        const res = await fetchWithTimeout('/api/v1/knowledge/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, top_k: topK }),
        })
        if (res.ok) {
          const data = await res.json()
          return {
            result: data.results || [],
            context: data.context || '',
          }
        }
      } catch { /* fallback */ }
      return { result: [], context: '' }
    }
    case 'tool-call': {
      let toolName = (config.tool_name as string) || (inputData as Record<string, unknown>)?.tool_name as string || ''
      let argsRaw = (config.args as string) || '{}'
      if (!toolName && _lastLLMOutput) {
        const extracted = _tryExtractToolName(_lastLLMOutput)
        if (extracted) {
          toolName = extracted.toolName
          argsRaw = JSON.stringify(extracted.args)
        }
      }
      const args = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw
      if (!toolName) return { error: 'tool_name is required' }
      try {
        const res = await fetchWithTimeout('/api/v1/tools/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: toolName, args }),
        })
        if (!res.ok) return { error: 'tool call failed' }
        const data = await res.json()
        return { result: data.result, success: data.success }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'register-tool': {
      const llmOutput = (inputData as Record<string, unknown>)?.llm_output as string || (inputData as Record<string, unknown>)?.value as string || (inputData as Record<string, unknown>)?.input as string || _lastLLMOutput || ''
      try {
        const res = await fetchWithTimeout('/api/v1/tools/parse-from-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: llmOutput }),
        })
        const data = await res.json()
        return { result: data, count: data.count || 0 }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'execute-skill': {
      const skillName = (config.skill_name as string) || (inputData as Record<string, unknown>)?.skill_name as string || ''
      const paramsRaw = (config.params as string) || '{}'
      const params = typeof paramsRaw === 'string' ? JSON.parse(paramsRaw) : paramsRaw
      if (!skillName) return { error: 'skill_name is required' }
      try {
        const res = await fetchWithTimeout(`/api/v1/skills/${encodeURIComponent(skillName)}`)
        if (!res.ok) return { error: `skill '${skillName}' not found` }
        const data = await res.json()
        return { result: data.content || '', found: data.found }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'learn-skill': {
      const llmOutput = (inputData as Record<string, unknown>)?.llm_output as string || (inputData as Record<string, unknown>)?.value as string || (inputData as Record<string, unknown>)?.input as string || _lastLLMOutput || ''
      try {
        const res = await fetchWithTimeout('/api/v1/skills/learn-from-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: llmOutput }),
        })
        const data = await res.json()
        return { result: data, count: data.count || 0 }
      } catch (err) {
        return { error: String(err) }
      }
    }
    case 'text-process': {
      const op = (config.operation as string) || 'trim'
      const text = String(inputData.text ?? inputData.input ?? '')
      if (op === 'concat') return { result: text + String(config.separator ?? '') }
      if (op === 'split') return { result: text.split(String(config.separator ?? ',')) }
      if (op === 'replace') {
        const pattern = String(config.pattern ?? '')
        const replacement = String(config.replacement ?? '')
        return { result: text.replace(new RegExp(pattern, 'g'), replacement) }
      }
      if (op === 'trim') return { result: text.trim() }
      if (op === 'uppercase' || op === 'upper') return { result: text.toUpperCase() }
      if (op === 'lowercase' || op === 'lower') return { result: text.toLowerCase() }
      return { result: text }
    }
    case 'variable-set': {
      const varName = String(config.var_name ?? 'var')
      const value = (config.var_value && inputData.value == null)
        ? config.var_value
        : inputData.value
      globalVars[varName] = value
      return { result: value, [`var_${varName}`]: value }
    }
    case 'variable-get': {
      const varName = String(config.var_name ?? 'var')
      return { value: globalVars[varName] }
    }
    case 'prompt-assembly': {
      const stable = String(config.stable ?? '')
      const context = String(inputData.context ?? config.context ?? '')
      const volatile = String(inputData.volatile ?? config.volatile ?? '')
      let assembled = ''
      if (stable) assembled += stable + '\n'
      if (context) assembled += '\n---\n' + context + '\n'
      if (volatile) assembled += '\n---\n' + volatile + '\n'
      const out = assembled.trim()
      return { assembled: out, prompt: out }
    }
    case 'search': {
      const query = String(inputData.query ?? inputData.input ?? config.query ?? '')
      if (!query) return { results: [], summary: '' }
      try {
        const res = await fetchWithTimeout('/api/v1/search/web', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, top_k: config.top_k ?? 5 }),
        })
        if (res.ok) {
          const data = await res.json()
          return { results: data.results || [], summary: data.summary || '' }
        }
      } catch { /* fallback */ }
      return { results: [{ title: query, snippet: `[mock search] ${query}`, url: '' }], summary: query }
    }
    case 'memory-read': {
      const scope = String(config.scope ?? 'user')
      const key = String(inputData.key ?? config.memory_key ?? '')
      if (!key) return { value: null }
      try {
        const res = await fetchWithTimeout(`/api/v1/memory/read?scope=${encodeURIComponent(scope)}&key=${encodeURIComponent(key)}`)
        if (res.ok) {
          const data = await res.json()
          return { value: data.value }
        }
      } catch { /* fallback */ }
      return { value: null }
    }
    case 'memory-write': {
      const scope = String(config.scope ?? 'user')
      const key = String(inputData.key ?? config.memory_key ?? '')
      const val = inputData.value ?? config.memory_value ?? ''
      if (!key) return { success: false }
      try {
        await fetchWithTimeout('/api/v1/memory/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope, key, value: String(val) }),
        })
      } catch { /* ignore */ }
      return { success: true }
    }
    case 'extract-memory': {
      const text = String(inputData.text ?? config.text ?? inputData.input ?? '')
      try {
        const res = await fetchWithTimeout('/api/v1/memory/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, max_facts: config.max_facts ?? 3, scope: config.scope ?? 'user' }),
        })
        if (res.ok) {
          const data = await res.json()
          return { facts: data.facts || [], count: data.count ?? (data.facts?.length || 0) }
        }
      } catch { /* fallback */ }
      const fact = text.trim()
      return fact
        ? { facts: [{ key: 'fact_local', value: fact }], count: 1 }
        : { facts: [], count: 0 }
    }
    case 'search-sessions': {
      const query = String(inputData.query ?? config.query ?? '')
      const limit = Number(config.limit ?? 10)
      try {
        const res = await fetchWithTimeout(
          `/api/v1/search/messages?q=${encodeURIComponent(query)}&limit=${limit}`,
        )
        if (res.ok) {
          const data = await res.json()
          return { results: data.results || [], count: (data.results || []).length }
        }
      } catch { /* fallback */ }
      return { results: [], count: 0 }
    }
    case 'start':
    case 'end':
    case 'trigger':
      return { result: inputData.result ?? inputData, triggered: originType === 'trigger' }
    case 'output':
      return { result: inputData.input ?? inputData.result ?? inputData }
    default:
      return { result: `[${originType}] executed` }
  }
}
