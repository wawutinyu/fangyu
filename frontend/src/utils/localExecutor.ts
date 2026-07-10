import { getNodeMeta } from './nodeRegistry'
import { getExecutionOrder } from './flowHelper'
import { VariablePool } from './variablePool'
import type { Node, Edge } from 'reactflow'

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
  nodes: Node[],
  edges: Edge[],
  options: LocalExecutorOptions,
): Promise<{ success: boolean; results: NodeResult[] }> {
  console.log(`[exec] runLocalFlow start nodes=${nodes.length} edges=${edges.length}`)
  const { onProgress, onPending, autoResolveInput, breakpoints } = options
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const order = getExecutionOrder(nodes.map(n => n.id), edges)
  console.log(`[exec] order=${JSON.stringify(order)}`)

  const pool = new VariablePool()
  const outputs = new Map<string, Record<string, unknown>>()

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)
    if (!node) {
      console.log(`[exec] node ${nodeId} NOT FOUND in nodeMap`)
      continue
    }

    const originType = (node.data?.originType as string) || ''
    const meta = getNodeMeta(originType)
    const rawConfig = (node.data?.config as Record<string, unknown>) || {}
    const nodeName = (node.data?.label as string) || meta.name

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
        nodeOutput = await simulateNode(originType, config, inputData)
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

async function simulateNode(
  originType: string,
  config: Record<string, unknown>,
  inputData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (originType) {
    case 'condition': {
      const expr = (config.expression as string) || 'true'
      try {
        const keys = Object.keys(inputData)
        const vals = Object.values(inputData)
        const fn = new Function(...keys, `return Boolean(${expr})`)
        const result = fn(...vals)
        return { result, true: result, false: !result }
      } catch {
        return { result: false, error: 'condition eval failed' }
      }
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
      // Use mock directly to avoid headless Chromium network issues
      _lastLLMOutput = `[mock] LLM answer for: ${prompt.slice(0, 100)}`
      return { result: _lastLLMOutput, usage: {} }
      _lastLLMOutput = prompt
      return { result: `[echo] ${prompt}`, usage: { total_tokens: 0 } }
    }
    case 'json-parse': {
      const input = typeof inputData === 'string' ? inputData : JSON.stringify(inputData)
      try { return { result: JSON.parse(input) } }
      catch { return { result: inputData, error: 'invalid json' } }
    }
    case 'transform': {
      const expr = (config.expression as string) || ''
      if (!expr) return { result: inputData }
      try {
        const fn = new Function('data', `return (${expr})`)
        const result = fn(inputData)
        return { result }
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
      const query = (inputData as Record<string, unknown>)?.query as string || (inputData as Record<string, unknown>)?.input as string || ''
      const topK = (config.top_k as number) || 5
      if (!query) return { error: 'query is required' }
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
    default:
      return { result: `[${originType}] executed` }
  }
}
