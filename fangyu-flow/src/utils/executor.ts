export interface ExecutorLog {
  nodeId: string
  nodeName: string
  type: 'start' | 'complete' | 'error'
  data: Record<string, unknown>
  time: number
}

export interface ExecutorResult {
  success: boolean
  results: { nodeId: string; nodeName: string; type: string; outputs?: Record<string, unknown>; error?: string }[]
  logs: ExecutorLog[]
  error?: string
}

export class Executor {
  private nodes: unknown[] = []
  private edges: unknown[] = []
  private _aborted = false
  private _onNodeProgress: ((nodeId: string, status: 'running' | 'done' | 'error') => void) | null = null
  private _externalInputs: Record<string, unknown> = {}
  private _globalVars: Record<string, unknown> = {}

  constructor(nodes: unknown[], edges: unknown[]) {
    this.nodes = nodes
    this.edges = edges
  }

  setExternalInputs(inputs: Record<string, unknown>) { this._externalInputs = inputs }
  setGlobalVars(vars: Record<string, unknown>) { this._globalVars = vars }

  onNodeProgress(cb: (nodeId: string, status: 'running' | 'done' | 'error') => void) {
    this._onNodeProgress = cb
  }

  abort() { this._aborted = true }

  async run(): Promise<ExecutorResult> {
    this._aborted = false
    if (!this.nodes || this.nodes.length === 0) {
      return { success: false, error: '画布为空', results: [], logs: [] }
    }

    const backendNodes = this.nodes.map(n => {
      const node = n as Record<string, unknown>
      return {
        id: node.id,
        type: node.type,
        data: {
          originType: node.type,
          label: (node.name as string) || (node.label as string) || '',
          config: (node.config as Record<string, unknown>) || {},
          mappings: (node.mappings as Record<string, string>) || {},
          inner_nodes: (node.inner_nodes as unknown[]) || [],
          inner_links: (node.inner_links as unknown[]) || [],
        },
        position: node.position || { x: 0, y: 0 },
      }
    })

    const backendEdges = this.edges.map(e => {
      const edge = e as Record<string, unknown>
      const edgeData = edge.data as Record<string, unknown> | undefined
      return {
        id: edge.id,
        source: edge.sourceNodeId || edge.source,
        target: edge.targetNodeId || edge.target,
        type: 'flow-edge',
        data: {
          linkType: (edgeData?.linkType as string) || (edge.linkType as string) || 'serial',
          mappings: (edgeData?.mappings as Record<string, string>) || (edge.mappings as Record<string, string>) || {},
        },
      }
    })

    try {
      const resp = await fetch('/api/v1/flow/run/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: backendNodes,
          edges: backendEdges,
          external_inputs: this._externalInputs,
          global_vars: this._globalVars,
        }),
      })

      if (!resp.ok) {
        return { success: false, error: `后端请求失败 (${resp.status})`, results: [], logs: [] }
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let result: ExecutorResult = { success: false, error: '未收到结果', results: [], logs: [] }

      while (true) {
        if (this._aborted) {
          reader.cancel()
          return { success: false, error: '已中止', results: [], logs: [] }
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6)
            if (dataStr === '[DONE]') continue
            try {
              const evt = JSON.parse(dataStr)
              if (evt.type === 'node_start') {
                this._onNodeProgress?.(evt.nodeId, 'running')
              } else if (evt.type === 'node_complete' || evt.type === 'node_error') {
                this._onNodeProgress?.(evt.nodeId, evt.type === 'node_complete' ? 'done' : 'error')
              } else if (evt.type === 'flow_result') {
                result = evt as ExecutorResult
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      return result
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), results: [], logs: [] }
    }
  }
}
