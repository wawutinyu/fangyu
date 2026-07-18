import { describe, it, expect, vi } from 'vitest'
import { runLocalFlow, type PendingInteraction } from '../localExecutor'
import type { Node, Edge } from 'reactflow'

function makeNode(
  id: string,
  originType: string,
  label: string,
  config: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Node {
  return {
    id, type: 'atom-node',
    position: { x: 0, y: 0 },
    data: { originType, label, config, ...extra },
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'Hello from LLM', usage: { total_tokens: 42 } }), { status: 200 })
    )
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
    expect(llmResult!.output?.result).toBe('Hello from LLM')
    expect(llmResult!.output?.usage).toEqual({ total_tokens: 42 })
    // 验证 executor 真的调了后端 API
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/llm/chat', expect.objectContaining({ method: 'POST' }))
    fetchSpy.mockRestore()
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
      p => p.resolve({ value: '5' }),
    ])

    expect(result.success).toBe(true)
    expect(result.results.length).toBe(2)
    const condResult = result.results.find(r => r.nodeId === 'cond')
    // input value '5' => Number('5') > 0 = true
    expect(condResult?.output?.result).toBe(true)
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('http', 'http', 'HTTP', { url: 'https://httpbin.org/get', method: 'GET' }),
    ]
    const edges = [makeEdge('e1', 'in', 'http')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data' }),
    ])

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('https://httpbin.org/get', expect.objectContaining({ method: 'GET' }))
    const httpResult = result.results.find(r => r.nodeId === 'http')
    expect(httpResult?.output?.status).toBe(200)
    fetchSpy.mockRestore()
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

  it('executes tool-call node', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, result: 'tool result' }), { status: 200 })
    )
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('tc', 'tool-call', '工具', { tool_name: 'get_weather', args: '{"city":"Beijing"}' }),
    ]
    const edges = [makeEdge('e1', 'in', 'tc')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data' }),
    ])

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/tools/execute', expect.objectContaining({ method: 'POST' }))
    fetchSpy.mockRestore()
  })

  it('executes register-tool node', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ tools_registered: [{ name: 'weather' }], count: 1 }), { status: 200 })
    )
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('rt', 'register-tool', '注册工具'),
    ]
    const edges = [makeEdge('e1', 'in', 'rt')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: '{"tool": "weather"}' }),
    ])

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/tools/parse-from-llm', expect.objectContaining({ method: 'POST' }))
    fetchSpy.mockRestore()
  })

  it('executes execute-skill node', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ found: true, content: 'skill content' }), { status: 200 })
    )
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('es', 'execute-skill', '执行技能', { skill_name: 'greet', params: '{}' }),
    ]
    const edges = [makeEdge('e1', 'in', 'es')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data' }),
    ])

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/skills/greet', expect.anything())
    fetchSpy.mockRestore()
  })

  it('executes learn-skill node', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ skills_created: [{ name: 'greet' }], count: 1 }), { status: 200 })
    )
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('ls', 'learn-skill', '学习技能'),
    ]
    const edges = [makeEdge('e1', 'in', 'ls')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'LLM output with skill' }),
    ])

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/skills/learn-from-llm', expect.objectContaining({ method: 'POST' }))
    fetchSpy.mockRestore()
  })

  it('executes mcp-call node', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'mcp result' }), { status: 200 })
    )
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('mcp', 'mcp-call', 'MCP 调用', { server: '__internal__', tool_name: 'hello', args: '{}' }),
    ]
    const edges = [makeEdge('e1', 'in', 'mcp')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data' }),
    ])

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/mcp/call', expect.objectContaining({ method: 'POST' }))
    fetchSpy.mockRestore()
  })

  it('passthrough: knowledge context reaches LLM inputData', async () => {
    // Mock knowledge search: returns context
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockImplementation(async (url) => {
      if (url === '/api/v1/knowledge/search') {
        return new Response(JSON.stringify({ results: [{ content: 'AI agents are...' }], context: 'AI context data' }), { status: 200 })
      }
      if (url === '/api/v1/llm/chat') {
        return new Response(JSON.stringify({ result: 'Answer with context', usage: { total_tokens: 10 } }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    })
    const nodes = [
      makeNode('in', 'input', '输入', { default_value: 'AI 代理是什么' }),
      makeNode('kw', 'knowledge', '知识库', { top_k: 3 }),
      makeNode('llm', 'llm', 'LLM', { model: 'test', system_prompt: '基于知识回答' }),
    ]
    const edges = [
      { ...makeEdge('e1', 'in', 'kw'), targetHandle: 'input' },
      { ...makeEdge('e2', 'kw', 'llm'), targetHandle: 'input', sourceHandle: 'result' },
    ]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'AI 代理是什么' }),
    ])

    expect(result.success).toBe(true)
    const llmResult = result.results.find(r => r.nodeId === 'llm')
    expect(llmResult).toBeDefined()
    // context should be in output via passthrough
    expect(llmResult!.output?.context).toBe('AI context data')
    // input query should also be preserved
    expect(llmResult!.output?.input).toBe('AI 代理是什么')
    // LLM should have been called with context in the user message
    const chatCall = fetchSpy.mock.calls.find(c => c[0] === '/api/v1/llm/chat')
    expect(chatCall).toBeDefined()
    const body = JSON.parse(chatCall![1].body as string)
    expect(body.messages[1].content).toContain('上下文：')
    expect(body.messages[1].content).toContain('AI context data')
    fetchSpy.mockRestore()
  })

  it('executes mcp-tools node', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ tools: [{ name: 'hello' }] }), { status: 200 })
    )
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('mt', 'mcp-tools', 'MCP 工具列表', { server: '__internal__' }),
    ]
    const edges = [makeEdge('e1', 'in', 'mt')]

    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'data' }),
    ])

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/mcp/tools?server=__internal__', expect.anything())
    fetchSpy.mockRestore()
  })

  it('executes switch node with expression', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('sw', 'switch', '分支', { expression: 'input' }),
    ]
    const edges = [makeEdge('e1', 'in', 'sw')]
    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'branch-a' }),
    ])
    expect(result.success).toBe(true)
    const sw = result.results.find(r => r.nodeId === 'sw')
    expect(sw?.output?.result).toBe('branch-a')
    expect(sw?.output?.branch).toBe('branch_branch-a')
  })

  it('executes composite inner graph', async () => {
    const nodes = [
      makeNode('g', 'composite', '子图', {}, {
        inner_nodes: [
          { id: 'i0', originType: 'input', config: { default_value: 'inner-val' } },
          { id: 'i1', originType: 'output', config: {} },
        ],
        inner_links: [{ sourceNodeId: 'i0', targetNodeId: 'i1', linkType: 'serial' }],
      }),
    ]
    const result = await runLocalFlow(nodes, [], {
      onProgress: () => {},
      onPending: () => {},
    })
    expect(result.success).toBe(true)
    const comp = result.results.find(r => r.nodeId === 'g')
    const outputs = comp?.output?.outputs as Record<string, Record<string, unknown>>
    expect(outputs?.i1?.result).toBe('inner-val')
  })

  it('action-loop code chain carries plan action into act/verify', async () => {
    const nodes = [
      makeNode('n1', 'input', '任务', { default_value: '体验闭环' }),
      makeNode('observe', 'code', 'observe', {
        code: "const goal = (input && (input.input || input.query || input.message)) || 'demo'\nreturn { phase: 'observe', goal, files: [] }",
      }),
      makeNode('plan', 'code', 'plan', {
        code: "const goal = input?.goal || input?.result?.goal || 'task'\nconst files = input?.files || []\nconst action = files.includes('result.txt') ? 'verify_only' : 'write_result'\nreturn { phase: 'plan', goal, action, files }",
      }),
      makeNode('act', 'code', 'act', {
        code: "const action = input?.action || ''\nconst goal = input?.goal || ''\nlet files = input?.files || []\nif (action === 'write_result') {\n  if (!files.includes('result.txt')) files = [...files, 'result.txt']\n  return { phase: 'act', acted: true, goal, files }\n}\nreturn { phase: 'act', acted: false, goal, files }",
      }),
      makeNode('verify', 'code', 'verify', {
        code: "const files = input?.files || []\nconst ok = files.includes('result.txt')\nreturn { phase: 'verify', verified: ok, status: ok ? 'completed' : 'pending', files }",
      }),
      makeNode('o', 'output', '输出'),
    ]
    const edges: Edge[] = [
      { id: 'e0', source: 'n1', target: 'observe', sourceHandle: 'input', targetHandle: 'input', type: 'flow-edge' },
      { id: 'e1', source: 'observe', target: 'plan', sourceHandle: 'result', targetHandle: 'input', type: 'flow-edge' },
      { id: 'e2', source: 'plan', target: 'act', sourceHandle: 'result', targetHandle: 'input', type: 'flow-edge' },
      { id: 'e3', source: 'act', target: 'verify', sourceHandle: 'result', targetHandle: 'input', type: 'flow-edge' },
      { id: 'e4', source: 'verify', target: 'o', sourceHandle: 'result', targetHandle: 'input', type: 'flow-edge' },
    ]
    const result = await runLocalFlow(nodes, edges, {
      autoResolveInput: true,
      onProgress: () => {},
      onPending: () => {},
    })
    expect(result.success).toBe(true)
    const act = result.results.find(r => r.nodeId === 'act')
    const verify = result.results.find(r => r.nodeId === 'verify')
    expect(act?.output?.result).toMatchObject({ acted: true, phase: 'act' })
    expect(verify?.output?.result).toMatchObject({ verified: true, status: 'completed' })
  })

  it('executes loop with inner graph count', async () => {
    const nodes = [
      makeNode('in', 'input', '输入'),
      makeNode('code', 'code', '数组', { code: 'return [1, 2, 3]' }),
      makeNode('loop', 'loop', '循环', { max_iterations: 10 }, {
        inner_nodes: [
          { id: 'li', originType: 'input', config: { default_value: 'item' } },
          { id: 'lo', originType: 'output', config: {} },
        ],
        inner_links: [{ sourceNodeId: 'li', targetNodeId: 'lo', linkType: 'serial' }],
      }),
    ]
    const edges = [makeEdge('e1', 'in', 'code'), makeEdge('e2', 'code', 'loop')]
    const result = await runFlowWithResolvers(nodes, edges, [
      p => p.resolve({ value: 'x' }),
    ])
    expect(result.success).toBe(true)
    const loop = result.results.find(r => r.nodeId === 'loop')
    expect(loop?.output?.count).toBe(3)
  })
})
