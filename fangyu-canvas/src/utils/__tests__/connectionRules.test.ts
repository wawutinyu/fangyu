import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import {
  validateFlowConnection,
  isValidFlowConnection,
  normalizeConnectionHandles,
  resolvePortName,
} from '../connectionRules'
import { canConnectTypes, getCompatibleTargets, getActiveNodeTypes, LEGACY_TYPES } from '../nodeRegistry'

function atom(id: string, originType: string): Node {
  return {
    id,
    type: 'atom-node',
    position: { x: 0, y: 0 },
    data: { originType, name: originType },
  }
}

describe('canConnectTypes', () => {
  it('allows same-type chains but rejects terminal ports', () => {
    expect(canConnectTypes('llm', 'llm')).toBe(true)
    expect(canConnectTypes('code', 'code')).toBe(true)
    expect(canConnectTypes('output', 'llm')).toBe(false)
    expect(canConnectTypes('output', 'output')).toBe(false)
    expect(canConnectTypes('llm', 'input')).toBe(false)
    expect(canConnectTypes('llm', 'variable-get')).toBe(false)
  })

  it('allows normal chains', () => {
    expect(canConnectTypes('input', 'llm')).toBe(true)
    expect(canConnectTypes('llm', 'output')).toBe(true)
    expect(canConnectTypes('llm', 'code')).toBe(true)
    expect(canConnectTypes('code', 'branch')).toBe(true)
  })
})

describe('getCompatibleTargets aligns with canConnectTypes', () => {
  it('does not recommend legacy; allows same-type llm', () => {
    const targets = getCompatibleTargets('llm')
    expect(targets).toContain('llm')
    expect(targets).not.toContain('input')
    expect(targets).not.toContain('condition')
    expect(targets).toContain('branch')
    expect(targets).toContain('output')
    for (const t of targets) {
      expect(LEGACY_TYPES.has(t)).toBe(false)
      expect(canConnectTypes('llm', t)).toBe(true)
    }
  })
})

describe('validateFlowConnection', () => {
  const nodes = [
    atom('a', 'input'),
    atom('b', 'llm'),
    atom('c', 'output'),
    atom('d', 'code'),
  ]

  it('rejects self-loop', () => {
    expect(validateFlowConnection(
      { source: 'b', target: 'b', sourceHandle: '__default', targetHandle: '__default' },
      { nodes, edges: [] },
    )).toMatch(/自身/)
  })

  it('rejects output as source and input as target', () => {
    expect(isValidFlowConnection(
      { source: 'c', target: 'b', sourceHandle: '__default', targetHandle: '__default' },
      { nodes, edges: [] },
    )).toBe(false)
    expect(isValidFlowConnection(
      { source: 'b', target: 'a', sourceHandle: '__default', targetHandle: '__default' },
      { nodes, edges: [] },
    )).toBe(false)
  })

  it('allows same-type llm chain', () => {
    const twoLlms = [atom('l1', 'llm'), atom('l2', 'llm')]
    expect(isValidFlowConnection(
      { source: 'l1', target: 'l2', sourceHandle: '__default', targetHandle: '__default' },
      { nodes: twoLlms, edges: [] },
    )).toBe(true)
  })

  it('rejects invalid handle names', () => {
    expect(validateFlowConnection(
      { source: 'b', target: 'c', sourceHandle: 'nope', targetHandle: '__default' },
      { nodes, edges: [] },
    )).toMatch(/无效输出端口/)
  })

  it('rejects duplicate and occupied target handle', () => {
    const edges: Edge[] = [{
      id: 'e1', source: 'a', target: 'b', sourceHandle: 'input', targetHandle: 'input',
    }]
    expect(validateFlowConnection(
      { source: 'a', target: 'b', sourceHandle: '__default', targetHandle: '__default' },
      { nodes, edges },
    )).toBeTruthy()
  })

  it('rejects cycles', () => {
    const cycleNodes = [atom('x', 'code'), atom('y', 'transform')]
    const edges: Edge[] = [{
      id: 'e1', source: 'y', target: 'x', sourceHandle: 'result', targetHandle: 'input',
    }]
    expect(validateFlowConnection(
      { source: 'x', target: 'y', sourceHandle: '__default', targetHandle: '__default' },
      { nodes: cycleNodes, edges },
    )).toMatch(/环路/)
  })

  it('allows legal input → llm → output', () => {
    expect(isValidFlowConnection(
      { source: 'a', target: 'b', sourceHandle: '__default', targetHandle: '__default' },
      { nodes, edges: [] },
    )).toBe(true)
    const edges: Edge[] = [{
      id: 'e1', source: 'a', target: 'b', sourceHandle: 'input', targetHandle: 'input',
    }]
    expect(isValidFlowConnection(
      { source: 'b', target: 'c', sourceHandle: '__default', targetHandle: '__default' },
      { nodes, edges },
    )).toBe(true)
  })

  it('normalizes __default to schema port names', () => {
    const normalized = normalizeConnectionHandles(
      { source: 'a', target: 'b', sourceHandle: '__default', targetHandle: '__default' },
      { nodes, edges: [] },
    )
    expect(normalized.sourceHandle).toBe('input')
    expect(normalized.targetHandle).toBe('input')
  })
})

describe('resolvePortName', () => {
  it('maps __default to first port', () => {
    expect(resolvePortName('__default', [{ name: 'result' }])).toBe('result')
    expect(resolvePortName('true', [{ name: 'true' }, { name: 'false' }])).toBe('true')
    expect(resolvePortName('missing', [{ name: 'true' }])).toBe(null)
  })
})

describe('branch multi-port', () => {
  it('allows true/false handles to distinct targets', () => {
    const nodes = [
      atom('br', 'branch'),
      atom('out1', 'output'),
      atom('out2', 'output'),
    ]
    expect(isValidFlowConnection(
      { source: 'br', target: 'out1', sourceHandle: 'true', targetHandle: 'input' },
      { nodes, edges: [] },
    )).toBe(true)
    expect(isValidFlowConnection(
      { source: 'br', target: 'out2', sourceHandle: 'false', targetHandle: 'input' },
      { nodes, edges: [] },
    )).toBe(true)
  })

  it('rejects unknown branch handle', () => {
    const nodes = [atom('br', 'branch'), atom('out', 'output')]
    expect(validateFlowConnection(
      { source: 'br', target: 'out', sourceHandle: 'maybe', targetHandle: 'input' },
      { nodes, edges: [] },
    )).toMatch(/无效输出端口/)
  })

  it('rejects occupied target handle from second branch arm', () => {
    const nodes = [atom('br', 'branch'), atom('out', 'output')]
    const edges: Edge[] = [{
      id: 'e1', source: 'br', target: 'out', sourceHandle: 'true', targetHandle: 'input',
    }]
    expect(validateFlowConnection(
      { source: 'br', target: 'out', sourceHandle: 'false', targetHandle: 'input' },
      { nodes, edges },
    )).toMatch(/已被占用/)
  })
})

describe('loop ports', () => {
  it('loop can feed transform and output', () => {
    expect(canConnectTypes('loop', 'transform')).toBe(true)
    expect(canConnectTypes('loop', 'output')).toBe(true)
    expect(getCompatibleTargets('loop')).toContain('output')
  })

  it('agent-loop (Harness) chains from input to output', () => {
    expect(canConnectTypes('input', 'agent-loop')).toBe(true)
    expect(canConnectTypes('agent-loop', 'output')).toBe(true)
    expect(getCompatibleTargets('agent-loop')).toContain('output')
  })
})

describe('active palette nodes', () => {
  it('every active type is not legacy', () => {
    for (const t of getActiveNodeTypes()) {
      expect(LEGACY_TYPES.has(t)).toBe(false)
    }
  })

  it('forbids illegal terminal pairs', () => {
    const illegal: Array<[string, string]> = [
      ['output', 'llm'],
      ['output', 'output'],
      ['llm', 'input'],
      ['llm', 'variable-get'],
    ]
    for (const [s, t] of illegal) {
      expect(canConnectTypes(s, t)).toBe(false)
      expect(getCompatibleTargets(s)).not.toContain(t)
    }
    // 同类型合法
    expect(canConnectTypes('llm', 'llm')).toBe(true)
    expect(getCompatibleTargets('llm')).toContain('llm')
  })

  it('every active source with outputs has at least one legal target except output', () => {
    for (const s of getActiveNodeTypes()) {
      if (s === 'output') {
        expect(getCompatibleTargets(s)).toEqual([])
        continue
      }
      const targets = getCompatibleTargets(s)
      // mcp-tools-like sources with outputs should still find something (e.g. output / transform)
      expect(targets.length).toBeGreaterThan(0)
    }
  })
})
