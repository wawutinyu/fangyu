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
})
