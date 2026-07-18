/** 回归：SSO 标签引用的处理函数必须已定义（曾漏写 onLogout → 一点就崩） */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../OpsPanel.tsx'),
  'utf8',
)

describe('OpsPanel SSO handlers', () => {
  it('defines onLogout used by SSO tab', () => {
    expect(src).toMatch(/const onLogout\s*=/)
    expect(src).toMatch(/onClick=\{onLogout\}/)
  })

  it('defines reloadAuth used by SSO refresh', () => {
    expect(src).toMatch(/const reloadAuth\s*=/)
  })
})

describe('OpsPanel IM orchestrate hint', () => {
  it('warns when mode=orchestrate without topology', () => {
    expect(src).toMatch(/data-testid="im-orchestrate-hint"/)
    expect(src).toMatch(/imMode === 'orchestrate'/)
    expect(src).toMatch(/has_topology/)
    expect(src).toMatch(/topology\.json/)
  })
})
