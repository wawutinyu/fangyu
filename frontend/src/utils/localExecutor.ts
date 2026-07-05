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

    onProgress(nodeId, 'running')
    await sleep(100)

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
        const output = await simulateNode(originType, config)
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
): Promise<Record<string, unknown>> {
  await sleep(50)
  switch (originType) {
    case 'llm':
      return { result: `[模拟] ${config.model || 'LLM'} 输出`, usage: { total_tokens: 50 } }
    case 'condition':
      return { true: true, false: false }
    default:
      return { result: `[模拟] ${originType} 已执行` }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
