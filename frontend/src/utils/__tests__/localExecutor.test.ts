import { describe, it, expect } from 'vitest'
import { runLocalFlow, type PendingInteraction } from '../localExecutor'
import type { Node, Edge } from 'reactflow'

function makeNode(id: string, originType: string, label: string, config: Record<string, unknown> = {}): Node {
  return {
    id, type: 'atom-node',
    position: { x: 0, y: 0 },
    data: { originType, label, config },
  }
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, type: 'flow-edge' }
}

/** Accumulates pending interactions and resolves them with provided resolvers in order */
function runFlowWithResolvers(
  nodes: Node[], edges: Edge[],
  resolvers: ((p: PendingInteraction) => void)[],
) {
  const pendingList: PendingInteraction[] = []
  return runLocalFlow(nodes, edges, {
    onProgress: () => {},
    onPending: p => {
      pendingList.push(p)
      const idx = pendingList.length - 1
      if (idx < resolvers.length) resolvers[idx](p)
    },
  })
}

describe('runLocalFlow', () => {
  it('executes input node then llm', async () => {
    const nodes = [
      makeNode('in', 'input', '输入', { default_value: 'hello' }),
      makeNode('llm', 'llm', 'LLM'),
    ]
    const edges = [makeEdge('e1', 'in', 'llm')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'hello' }),
    ])

    expect(result.success).toBe(true)
    expect(result.results.length).toBe(2)
    const inputResult = result.results.find(r => r.nodeId === 'in')
    expect(inputResult?.output?.input).toBe('hello')
  })

  it('approval node pauses and can be approved', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('app', 'approval', '审批', { message: 'Approve?' }),
      makeNode('llm', 'llm', 'LLM'),
    ]
    const edges = [makeEdge('e1', 'in', 'app'), makeEdge('e2', 'app', 'llm')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => { expect(p.type).toBe('input'); p.resolve({ value: 'data' }) },
      p => { expect(p.type).toBe('approval'); expect(p.nodeName).toBe('审批'); p.resolve({ action: 'approved', modifiedData: { test: true } }) },
    ])

    expect(result.success).toBe(true)
  })

  it('approval rejection outputs rejected field', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('app', 'approval', '审批'),
    ]
    const edges = [makeEdge('e1', 'in', 'app')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data' }),
      p => p.resolve({ action: 'rejected', reason: 'Not needed' }),
    ])

    expect(result.success).toBe(true)
  })

  it('simulates LLM node without pending', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('llm', 'llm', 'LLM', { model: 'test' }),
    ]
    const edges = [makeEdge('e1', 'in', 'llm')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'test' }),
    ])

    expect(result.success).toBe(true)
    const llmResult = result.results.find(r => r.nodeId === 'llm')
    expect(llmResult).toBeDefined()
    expect(llmResult!.output?.result).toContain('[模拟]')
  })

  it('resolves {{in.input}} in downstream config', async () => {
    const nodes = [
      makeNode('in', 'input', '输入', { default_value: 'world' }),
      makeNode('llm', 'llm', 'LLM', { prompt: 'Hello {{in.input}}', model: 'test' }),
    ]
    const edges = [makeEdge('e1', 'in', 'llm')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'world' }),
    ])

    expect(result.success).toBe(true)
  })

  it('executes condition node', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('cond', 'condition', '条件', { expression: 'input > 0' }),
    ]
    const edges = [makeEdge('e1', 'in', 'cond')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'test' }),
    ])

    expect(result.success).toBe(true)
    expect(result.results.length).toBe(2)
  })

  it('approval message is resolved from pool', async () => {
    const nodes = [
      makeNode('in', 'input', '输入', { default_value: 'data123' }),
      makeNode('app', 'approval', '审批', { message: '审核数据: {{in.input}}' }),
    ]
    const edges = [makeEdge('e1', 'in', 'app')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data123' }),
      p => { expect(p.config.message).toContain('data123'); p.resolve({ action: 'approved' }) },
    ])

    expect(result.success).toBe(true)
  })

  it('executes http node', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('http', 'http', 'HTTP', { url: 'https://example.com', method: 'GET' }),
    ]
    const edges = [makeEdge('e1', 'in', 'http')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data' }),
    ])

    expect(result.success).toBe(true)
  })

  it('executes code node', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('code', 'code', '代码', { code: 'return input' }),
    ]
    const edges = [makeEdge('e1', 'in', 'code')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data' }),
    ])

    expect(result.success).toBe(true)
  })

  it('executes search node', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('search', 'search', '搜索', { top_k: 3 }),
    ]
    const edges = [makeEdge('e1', 'in', 'search')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'query' }),
    ])

    expect(result.success).toBe(true)
  })

  it('executes knowledge node', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('kw', 'knowledge', '知识库', { top_k: 3 }),
    ]
    const edges = [makeEdge('e1', 'in', 'kw')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'query' }),
    ])

    expect(result.success).toBe(true)
  })
})
