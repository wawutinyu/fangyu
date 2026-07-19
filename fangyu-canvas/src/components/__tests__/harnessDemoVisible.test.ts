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

describe('拼装验收 · Harness 级入口', () => {
  it('demo 用 until_done + tool-round，不含 agent-loop', () => {
    const demo = demoFlows.opencode_harness
    expect(demo).toBeTruthy()
    expect(demo.label).toMatch(/拼装验收/)
    const data = demo.data as {
      nodes: { type: string; config?: { mode?: string }; inner_nodes?: { originType: string }[] }[]
    }
    const types = data.nodes.map(n => n.type)
    expect(types).toContain('loop')
    expect(types).toContain('memory')
    expect(types).not.toContain('agent-loop')
    const until = data.nodes.find(n => n.type === 'loop')
    expect(until?.config?.mode).toBe('until_done')
    expect(until?.inner_nodes?.some(n => n.originType === 'tool-round')).toBe(true)
  })

  it('CATEGORY_ORDER 含 Harness', () => {
    expect(toolbarSrc).toMatch(/CATEGORY_ORDER\s*=\s*\[[^\]]*['"]Harness['"]/)
  })

  it('创建菜单一键加载拼装验收', () => {
    expect(toolbarSrc).toMatch(/拼装验收 · Harness 级/)
    expect(toolbarSrc).toMatch(/opencode_harness/)
  })

  it('可拼原语在节点库：tool-round；整环仍保留', () => {
    expect(getNodeMeta('tool-round').name).toMatch(/工具轮/)
    expect(getNodeMeta('agent-loop').name).toMatch(/高级/)
  })
})
