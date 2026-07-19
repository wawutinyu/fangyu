/** 回归：OpenCode Harness 必须出现在「创建」菜单可点路径上 */
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

describe('OpenCode Harness 页面入口可见', () => {
  it('demoFlows 含 opencode_harness', () => {
    expect(demoFlows.opencode_harness).toBeTruthy()
    expect(demoFlows.opencode_harness.label).toMatch(/Harness/i)
  })

  it('CATEGORY_ORDER 含 Harness，避免示例用例滤掉', () => {
    expect(toolbarSrc).toMatch(/CATEGORY_ORDER\s*=\s*\[[^\]]*['"]Harness['"]/)
  })

  it('创建菜单有一键 OpenCode Harness', () => {
    expect(toolbarSrc).toMatch(/label:\s*'OpenCode Harness'/)
    expect(toolbarSrc).toMatch(/opencode_harness/)
  })

  it('节点库有 agent-loop', () => {
    const meta = getNodeMeta('agent-loop')
    expect(meta.name).toBe('Agent 工具环')
  })
})
