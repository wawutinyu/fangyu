import { describe, it, expect } from 'vitest'
import { demoFlows } from '../demoFlows'
import { getAllNodeTypes } from '../nodeRegistry'

const ENGINE_ONLY = new Set(['start', 'end'])

function collectCoveredTypes(): Set<string> {
  const covered = new Set<string>()
  for (const demo of Object.values(demoFlows)) {
    const data = demo.data as { nodes?: { type: string; inner_nodes?: { type?: string; originType?: string }[] }[] }
    for (const n of data.nodes || []) {
      covered.add(n.type)
      for (const inner of n.inner_nodes || []) {
        covered.add(inner.type || inner.originType || '')
      }
    }
  }
  covered.delete('')
  return covered
}

const UNIFIED_VARIANTS: Record<string, { field: string; values: string[] }> = {
  branch: { field: 'mode', values: ['bool', 'multi'] },
  memory: { field: 'operation', values: ['read', 'write', 'extract', 'search'] },
  execute: { field: 'mode', values: ['tool', 'skill'] },
  register: { field: 'mode', values: ['tool', 'skill'] },
  mcp: { field: 'operation', values: ['list', 'call'] },
}

function collectUnifiedVariants(): Record<string, Set<string>> {
  const found: Record<string, Set<string>> = {}
  for (const demo of Object.values(demoFlows)) {
    const data = demo.data as { nodes?: { type: string; config?: Record<string, unknown> }[] }
    for (const n of data.nodes || []) {
      const spec = UNIFIED_VARIANTS[n.type]
      if (!spec) continue
      const val = String(n.config?.[spec.field] ?? '')
      if (val) {
        if (!found[n.type]) found[n.type] = new Set()
        found[n.type].add(val)
      }
    }
  }
  return found
}

describe('demo 节点覆盖率', () => {
  it('每个画布节点类型至少出现在一个用例中', () => {
    const covered = collectCoveredTypes()
    const allTypes = getAllNodeTypes()
    const missing = allTypes.filter(t => !covered.has(t) && !ENGINE_ONLY.has(t))
    expect(missing, `未覆盖节点: ${missing.join(', ')}`).toEqual([])
  })

  it('统一节点的各配置模式均有用例覆盖', () => {
    const found = collectUnifiedVariants()
    const gaps: string[] = []
    for (const [nodeType, spec] of Object.entries(UNIFIED_VARIANTS)) {
      const covered = found[nodeType] || new Set()
      for (const v of spec.values) {
        if (!covered.has(v)) gaps.push(`${nodeType}.${spec.field}=${v}`)
      }
    }
    expect(gaps, `未覆盖配置: ${gaps.join(', ')}`).toEqual([])
  })

  it('用例数量不少于节点类型数', () => {
    expect(Object.keys(demoFlows).length).toBeGreaterThanOrEqual(getAllNodeTypes().length - ENGINE_ONLY.size)
  })
})
