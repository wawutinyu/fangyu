import { describe, it, expect } from 'vitest'
import { exportFormatToSkillFlow } from '../assetApi'

describe('exportFormatToSkillFlow', () => {
  it('converts export format nodes and links to skill flow', () => {
    const data = {
      nodes: [
        { id: 'n1', type: 'input', name: '输入', config: { default_value: 'hi' } },
        { id: 'n2', type: 'output', name: '输出', config: {} },
      ],
      links: [
        { id: 'l1', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial' },
      ],
    }
    const flow = exportFormatToSkillFlow(data)
    expect(flow.nodes).toHaveLength(2)
    expect(flow.edges).toHaveLength(1)
    expect((flow.nodes[0] as { data: { originType: string } }).data.originType).toBe('input')
    expect((flow.edges[0] as { source: string; target: string }).source).toBe('n1')
    expect((flow.edges[0] as { source: string; target: string }).target).toBe('n2')
  })

  it('passes through react-flow shaped nodes and edges', () => {
    const data = {
      nodes: [{ id: 'a', data: { originType: 'llm', label: 'LLM', config: {} } }],
      edges: [{ id: 'e1', source: 'a', target: 'b', data: { linkType: 'serial' } }],
    }
    const flow = exportFormatToSkillFlow(data)
    expect(flow.nodes[0]).toEqual(data.nodes[0])
    expect(flow.edges[0]).toEqual(data.edges[0])
  })
})
