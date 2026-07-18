import { describe, expect, it } from 'vitest'
import type { CollaborationEvent } from '@fangyu/core/schema'
import { explainCollabEvent } from '../presenceExplain'

function ev(partial: Partial<CollaborationEvent> & Pick<CollaborationEvent, 'kind' | 'actor'>): CollaborationEvent {
  return {
    id: 'e1',
    ts: 1,
    message: '',
    severity: 'info',
    ...partial,
  }
}

describe('explainCollabEvent', () => {
  it('explains a2a.send in plain Chinese', () => {
    const e = explainCollabEvent(ev({
      kind: 'a2a.send',
      actor: '检索',
      target: '分析',
      message: '把材料交给分析',
    }))
    expect(e.title).toContain('协作')
    expect(e.plain).toContain('检索')
    expect(e.plain).toContain('分析')
    expect(e.nextStep.length).toBeGreaterThan(4)
  })

  it('delegates constitution.warn to law-style copy', () => {
    const e = explainCollabEvent(ev({
      kind: 'constitution.warn',
      actor: '汇总',
      message: '输出偏长',
      severity: 'warn',
    }))
    expect(e.severity).toBe('warn')
    expect(e.plain).toContain('汇总')
    expect(e.title.length).toBeGreaterThan(2)
  })

  it('explains worker.enqueued', () => {
    const e = explainCollabEvent(ev({
      kind: 'worker.enqueued',
      actor: '汇总',
      target: 'demo-行',
      message: '本地校验',
    }))
    expect(e.title).toContain('行')
    expect(e.plain).toContain('demo-行')
  })

  it('explains managed lifecycle', () => {
    const start = explainCollabEvent(ev({
      kind: 'managed.start',
      actor: 'managed:x',
      target: 'demo',
      message: '托管启动 demo :9100',
    }))
    expect(start.title).toContain('托管')
    expect(start.plain).toContain('demo')

    const up = explainCollabEvent(ev({
      kind: 'managed.upgrade',
      actor: 'managed:y',
      target: 'demo',
      detail: { from: 'x', to: 'y' },
    }))
    expect(up.title).toContain('升级')
    expect(up.plain).toContain('x')
  })
})
