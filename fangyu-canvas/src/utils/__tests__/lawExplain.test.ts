import { describe, expect, it } from 'vitest'
import { explainAuditEntry, explainViolation } from '../lawExplain'

describe('lawExplain', () => {
  it('explains trust denial', () => {
    const e = explainViolation({ rule: 'trust_violation', message: '未授权' })
    expect(e.title).toContain('信任')
    expect(e.nextStep).toContain('授权')
  })

  it('explains shell block', () => {
    const e = explainViolation({ rule: 'worker_shell_blocked', message: 'rm blocked' })
    expect(e.title).toContain('命令')
    expect(e.severity).toBe('deny')
  })

  it('explains warn', () => {
    const e = explainViolation({ rule: 'constitution.warn', severity: 'warn', message: '缺 model' })
    expect(e.severity).toBe('warn')
    expect(e.plain.length).toBeGreaterThan(4)
  })

  it('explains audit entry', () => {
    const e = explainAuditEntry({
      event: 'constitution_violation',
      details: { error: 'forbidden', agent: 'a1' },
    })
    expect(e.title).toBeTruthy()
    expect(e.nextStep).toContain('律')
  })

  it('explains policy_ssrf', () => {
    const e = explainViolation({ rule: 'policy_ssrf', message: '内网地址' })
    expect(e.title).toContain('SSRF')
    expect(e.nextStep.length).toBeGreaterThan(4)
  })

  it('explains policy_llm_model', () => {
    const e = explainViolation({ rule: 'policy_llm_model', message: '缺 model' })
    expect(e.title).toContain('大模型')
    expect(e.nextStep).toMatch(/model|设置/)
  })

  it('explains policy_loop_limit', () => {
    const e = explainViolation({ rule: 'policy_loop_limit', message: '超过 100' })
    expect(e.title).toContain('循环')
  })

  it('explains policy_tool_name', () => {
    const e = explainViolation({ rule: 'policy_tool_name', tool_name: 'bad_tool', message: '不允许' })
    expect(e.title).toContain('工具')
    expect(e.plain).toMatch(/bad_tool|不允许/)
  })
})
