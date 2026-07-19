/** 回归：Harness 入口 = 多节点编排骨架，不是单点 agent-loop */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { demoFlows } from '../../utils/demoFlows'
import { getNodeMeta } from '../../utils/nodeRegistry'

const toolbarSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../TopToolbar.tsx'),
  'utf8',
)

describe('节点编排 · Harness 页面入口', () => {
  it('demo 是多节点骨架（含记忆/计划/执行/验收）', () => {
    const demo = demoFlows.opencode_harness
    expect(demo).toBeTruthy()
    expect(demo.label).toMatch(/节点编排/)
    const data = demo.data as { nodes: { type: string; name: string }[] }
    const types = data.nodes.map(n => n.type)
    expect(types).toContain('memory')
    expect(types).toContain('llm')
    expect(types).toContain('code')
    expect(types).not.toContain('agent-loop')
    expect(data.nodes.length).toBeGreaterThanOrEqual(6)
  })

  it('CATEGORY_ORDER 含 Harness', () => {
    expect(toolbarSrc).toMatch(/CATEGORY_ORDER\s*=\s*\[[^\]]*['"]Harness['"]/)
  })

  it('创建菜单一键加载编排骨架', () => {
    expect(toolbarSrc).toMatch(/节点编排 · Harness/)
    expect(toolbarSrc).toMatch(/opencode_harness/)
  })

  it('agent-loop 降级为高级整环，不当产品入口名', () => {
    const meta = getNodeMeta('agent-loop')
    expect(meta.name).toMatch(/高级/)
    expect(meta.desc).toMatch(/节点编排/)
  })
})
