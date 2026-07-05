import { describe, it, expect } from 'vitest'
import { VariablePool, getUpstreamSelectors } from '../variablePool'
import type { Node, Edge } from 'reactflow'

describe('VariablePool', () => {
  it('add and get a variable', () => {
    const pool = new VariablePool()
    pool.add('node1', 'result', 'hello')
    expect(pool.getVariable('node1.result')).toBe('hello')
  })

  it('addOutputs stores all keys', () => {
    const pool = new VariablePool()
    pool.addOutputs('n1', { result: 'ok', usage: { tokens: 50 } })
    expect(pool.getVariable('n1.result')).toBe('ok')
    expect(pool.getVariable('n1.usage')).toEqual({ tokens: 50 })
  })

  it('getVariable returns undefined for unknown selector', () => {
    const pool = new VariablePool()
    expect(pool.getVariable('nope.x')).toBeUndefined()
  })

  it('resolve replaces {{nodeId.field}} with string value', () => {
    const pool = new VariablePool()
    pool.add('llm1', 'result', 'Hello World')
    expect(pool.resolve('The answer: {{llm1.result}}')).toBe('The answer: Hello World')
  })

  it('resolve replaces multiple variables', () => {
    const pool = new VariablePool()
    pool.add('n1', 'a', 'foo')
    pool.add('n2', 'b', 'bar')
    expect(pool.resolve('{{n1.a}} and {{n2.b}}')).toBe('foo and bar')
  })

  it('resolve JSON-stringifies object values', () => {
    const pool = new VariablePool()
    pool.add('n1', 'data', { x: 1, y: 2 })
    expect(pool.resolve('data={{n1.data}}')).toBe('data={"x":1,"y":2}')
  })

  it('resolve leaves unknown selectors unchanged', () => {
    const pool = new VariablePool()
    expect(pool.resolve('{{missing.field}}')).toBe('{{missing.field}}')
  })

  it('resolveInObject walks nested structure', () => {
    const pool = new VariablePool()
    pool.add('llm', 'result', 'LLM output')
    const input = {
      system_prompt: 'You are helpful',
      user_prompt: 'Based on: {{llm.result}}',
      temperature: 0.7,
    }
    const resolved = pool.resolveInObject(input)
    expect(resolved).toEqual({
      system_prompt: 'You are helpful',
      user_prompt: 'Based on: LLM output',
      temperature: 0.7,
    })
  })

  it('resolveInObject handles arrays', () => {
    const pool = new VariablePool()
    pool.add('n1', 'x', 'val')
    const resolved = pool.resolveInObject(['{{n1.x}}', 'static'])
    expect(resolved).toEqual(['val', 'static'])
  })

  it('hasVariable returns true/false', () => {
    const pool = new VariablePool()
    pool.add('n1', 'x', 42)
    expect(pool.hasVariable('n1.x')).toBe(true)
    expect(pool.hasVariable('n1.y')).toBe(false)
  })

  it('allVariables returns snapshot', () => {
    const pool = new VariablePool()
    pool.add('a', 'x', 1)
    pool.add('b', 'y', 2)
    const snapshot = pool.allVariables
    expect(snapshot.get('a.x')).toBe(1)
    expect(snapshot.get('b.y')).toBe(2)
    expect(snapshot.size).toBe(2)
  })

  it('clear removes all variables', () => {
    const pool = new VariablePool()
    pool.add('n1', 'x', 'val')
    pool.clear()
    expect(pool.hasVariable('n1.x')).toBe(false)
  })
})

describe('getUpstreamSelectors', () => {
  function makeNode(id: string, originType: string, label: string): Node {
    return {
      id, type: 'atom-node',
      position: { x: 0, y: 0 },
      data: { originType, label },
    }
  }

  it('returns output ports from upstream nodes', () => {
    const nodes: Node[] = [
      makeNode('n1', 'llm', 'LLM'),
      makeNode('n2', 'condition', '条件'),
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'n1', target: 'n2' },
    ]
    const selectors = getUpstreamSelectors('n2', nodes, edges)
    expect(selectors.length).toBeGreaterThan(0)
    expect(selectors.some(s => s.selector === 'n1.result')).toBe(true)
    expect(selectors.every(s => s.nodeLabel.length > 0)).toBe(true)
  })

  it('returns empty for node without edges', () => {
    const nodes: Node[] = [makeNode('n1', 'llm', 'LLM')]
    expect(getUpstreamSelectors('n1', nodes, [])).toEqual([])
  })

  it('sorts by label', () => {
    const nodes: Node[] = [
      makeNode('b', 'condition', 'B'),
      makeNode('a', 'condition', 'A'),
      makeNode('target', 'llm', 'Target'),
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'b', target: 'target' },
      { id: 'e2', source: 'a', target: 'target' },
    ]
    const selectors = getUpstreamSelectors('target', nodes, edges)
    const labels = selectors.map(s => s.nodeLabel)
    expect(labels).toEqual(['A', 'A', 'B', 'B'])
  })
})
