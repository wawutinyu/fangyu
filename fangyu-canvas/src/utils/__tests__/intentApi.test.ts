import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  assertImportableIntentFlow,
  intentToFlow,
  fetchIntentTemplates,
  type IntentToFlowResult,
} from '../intentApi'
import { convertFromExportFormat } from '../flowHelper'

beforeEach(() => {
  vi.restoreAllMocks()
})

const sampleFlow = {
  flow_id: '',
  flow_name: '意图·测试',
  nodes: [
    { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'hi' }, position: { x: 0, y: 0 } },
    { id: 'n2', type: 'output', name: '输出', category: '流程控制', config: {}, position: { x: 200, y: 0 } },
  ],
  links: [
    { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
  ],
  global_meta: { session_id: '', user_id: '' },
}

function okResult(overrides: Partial<IntentToFlowResult> = {}): IntentToFlowResult {
  return {
    intent: 'hi',
    template: 'simple_io',
    mode: 'template',
    use_llm_plan: false,
    flow: sampleFlow,
    scan: { deny: [], warn: [], all: [], blocked: false },
    rationale: 'test',
    ...overrides,
  }
}

describe('intentApi', () => {
  it('intentToFlow posts and returns result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => okResult({ template: 'action_loop', intent: '完成任务' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await intentToFlow('完成任务', { use_llm_plan: true })
    expect(result.template).toBe('action_loop')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/intent/to-flow', expect.objectContaining({
      method: 'POST',
    }))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.intent).toBe('完成任务')
    expect(body.use_llm_plan).toBe(true)
  })

  it('intentToFlow rejects empty intent locally', async () => {
    await expect(intentToFlow('  ')).rejects.toThrow('intent')
  })

  it('intentToFlow surfaces HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'err',
      text: async () => 'boom',
    }))
    await expect(intentToFlow('任务')).rejects.toThrow('500')
  })

  it('fetchIntentTemplates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templates: [
          { id: 'action_loop', label: '行动闭环', desc: 'x' },
          { id: 'doc_assistant', label: '文档助手', desc: 'y' },
          { id: 'simple_io', label: '简单', desc: 'z' },
        ],
      }),
    }))
    const list = await fetchIntentTemplates()
    expect(list).toHaveLength(3)
  })

  it('assertImportableIntentFlow accepts valid flow', () => {
    expect(() => assertImportableIntentFlow(okResult())).not.toThrow()
  })

  it('assertImportableIntentFlow blocks constitution deny', () => {
    expect(() => assertImportableIntentFlow(okResult({
      scan: { deny: [{ rule: 'x' }], warn: [], all: [], blocked: true },
    }))).toThrow('宪法')
  })

  it('assertImportableIntentFlow rejects empty nodes', () => {
    expect(() => assertImportableIntentFlow(okResult({
      flow: { ...sampleFlow, nodes: [] },
    }))).toThrow('节点为空')
  })

  it('action_loop ExportFormat converts to canvas graph', () => {
    const actionFlow = {
      flow_id: '',
      flow_name: '意图·行动·完成任务',
      nodes: [
        { id: 'n1', type: 'input', name: '任务', category: '流程控制', config: { default_value: '完成任务' }, position: { x: 40, y: 220 } },
        { id: 'observe', type: 'code', name: 'observe', category: '代码', config: { code: 'return { phase: "observe" }' }, position: { x: 200, y: 220 } },
        { id: 'plan', type: 'code', name: 'plan', category: '代码', config: { code: 'return { phase: "plan" }' }, position: { x: 380, y: 220 } },
        { id: 'act', type: 'code', name: 'act', category: '代码', config: { code: 'return { phase: "act" }' }, position: { x: 560, y: 220 } },
        { id: 'verify', type: 'code', name: 'verify', category: '代码', config: { code: 'return { phase: "verify" }' }, position: { x: 740, y: 220 } },
        { id: 'o', type: 'output', name: '输出', category: '流程控制', config: {}, position: { x: 920, y: 220 } },
      ],
      links: [
        { id: 'e0', sourceNodeId: 'n1', targetNodeId: 'observe', linkType: 'serial', mappings: {} },
        { id: 'e1', sourceNodeId: 'observe', targetNodeId: 'plan', linkType: 'serial', mappings: {} },
        { id: 'e3', sourceNodeId: 'plan', targetNodeId: 'act', linkType: 'serial', mappings: {} },
        { id: 'e4', sourceNodeId: 'act', targetNodeId: 'verify', linkType: 'serial', mappings: {} },
        { id: 'e5', sourceNodeId: 'verify', targetNodeId: 'o', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    }
    const { nodes, edges } = convertFromExportFormat(actionFlow as never)
    expect(nodes.map(n => n.id)).toEqual(['n1', 'observe', 'plan', 'act', 'verify', 'o'])
    expect(edges).toHaveLength(5)
    assertImportableIntentFlow(okResult({
      template: 'action_loop',
      flow: actionFlow,
      intent: '完成任务',
    }))
  })
})
