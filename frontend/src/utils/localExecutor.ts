import { getNodeMeta } from './nodeRegistry'
import { getExecutionOrder } from './flowHelper'
import { VariablePool } from './variablePool'
import type { Node, Edge } from 'reactflow'

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
  const { onProgress, onPending, autoResolveInput, breakpoints } = options
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const order = getExecutionOrder(nodes.map(n => n.id), edges)

  const pool = new VariablePool()
  const outputs = new Map<string, Record<string, unknown>>()

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)
    if (!node) continue

    const originType = (node.data?.originType as string) || ''
    const meta = getNodeMeta(originType)
    const rawConfig = (node.data?.config as Record<string, unknown>) || {}
    const nodeName = (node.data?.label as string) || meta.name

    const config = originType === 'input' ? rawConfig : pool.resolveInObject(rawConfig)

    // Collect input data from upstream nodes
    const upstreamEdges = edges.filter(e => e.target === nodeId)
    const inputData: Record<string, unknown> = {}
    for (const edge of upstreamEdges) {
      const srcOutput = outputs.get(edge.source)
      if (srcOutput) Object.assign(inputData, srcOutput)
    }

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
          outputs.set(nodeId, { rejected: response?.reason || '用户拒绝', approved: undefined })
        } else {
          outputs.set(nodeId, { approved: response.modifiedData || {}, rejected: undefined })
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
        outputs.set(nodeId, { input: response?.value ?? config.default_value ?? '' })
      } else {
        const output = await simulateNode(originType, config, inputData)
        outputs.set(nodeId, output)
      }

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
        const res = await fetch(url, opts)
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
      try {
        const body = JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: String(prompt) }], temperature: config.temperature ?? 0.7, max_tokens: config.max_tokens ?? 1024 })
        const res = await fetch('/api/v1/llm/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        if (res.ok) {
          const data = await res.json()
          return { result: data.content || data.message?.content || JSON.stringify(data), usage: data.usage || {} }
        }
      } catch { /* fallback to echo */ }
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
    default:
      return { result: `[${originType}] executed` }
  }
}
