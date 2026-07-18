import { describe, it, expect } from 'vitest'
import { getCompatibleTargets, filterUniqueTypes, UNIQUE_NODE_TYPES, getAllNodeTypes, getNodeMeta } from '../nodeRegistry'

describe('getCompatibleTargets', () => {
  it('output has no compatible targets (no output)', () => {
    const result = getCompatibleTargets('output')
    expect(result).toEqual([])
  })

  it('llm can connect to most nodes with input', () => {
    const result = getCompatibleTargets('llm')
    expect(result).toContain('branch')
    expect(result).toContain('code')
    expect(result).toContain('http')
    expect(result).toContain('knowledge')
    expect(result).toContain('memory')
    expect(result).not.toContain('input')
    expect(result).not.toContain('variable-get')
    expect(result).not.toContain('llm')
    expect(result).not.toContain('condition')
    expect(result).not.toContain('memory-write')
  })

  it('excludes self from results', () => {
    const result = getCompatibleTargets('branch')
    expect(result).not.toContain('branch')
  })

  it('excludes no-input types', () => {
    const result = getCompatibleTargets('llm')
    expect(result).not.toContain('input')
    expect(result).not.toContain('variable-get')
  })

  it('returns empty for no-output types', () => {
    expect(getCompatibleTargets('output')).toEqual([])
  })

  it('includes output as valid target', () => {
    const result = getCompatibleTargets('llm')
    expect(result).toContain('output')
  })

  it('approval node appears as compatible target', () => {
    const result = getCompatibleTargets('llm')
    expect(result).toContain('approval')
  })

  it('approval node has input and output schema', () => {
    const meta = getNodeMeta('approval')
    expect(meta.inputSchema.length).toBeGreaterThan(0)
    expect(meta.outputSchema.length).toBeGreaterThan(0)
    expect(meta.outputSchema.map(p => p.name)).toContain('approved')
    expect(meta.outputSchema.map(p => p.name)).toContain('rejected')
  })
})

describe('UNIQUE_NODE_TYPES', () => {
  it('is empty after removing start/end', () => {
    expect(UNIQUE_NODE_TYPES.size).toBe(0)
  })
})

describe('filterUniqueTypes', () => {
  it('returns all types when none are unique', () => {
    const all = getAllNodeTypes()
    const filtered = filterUniqueTypes(all, [])
    expect(filtered).toEqual(all)
  })

  it('keeps all types even if they appear in existing (no unique constraint)', () => {
    const filtered = filterUniqueTypes(['llm', 'approval', 'input'], ['llm'])
    expect(filtered).toContain('llm')
    expect(filtered).toContain('approval')
  })

  it('returns empty array for empty input', () => {
    expect(filterUniqueTypes([], [])).toEqual([])
  })
})
