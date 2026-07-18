import { describe, expect, it } from 'vitest'
import type { PresenceSnapshot } from '@fangyu/core/schema'
import { buildReplayPack, replayPackToMarkdown } from '../presenceExport'

const snap: PresenceSnapshot = {
  presence: [
    {
      id: 'agent:检索', kind: 'agent', name: '检索', label: '检索',
      status: 'idle', online: true, department: '感知部', department_id: 'dept-sense',
    },
  ],
  events: [
    {
      id: '1', ts: 100, kind: 'a2a.send', actor: '检索', target: '分析',
      message: '材料', severity: 'info',
    },
    {
      id: '2', ts: 101, kind: 'constitution.warn', actor: '汇总',
      message: '偏长', severity: 'warn',
    },
  ],
  departments: [
    {
      id: 'dept-sense',
      label: '感知部',
      houses: [{ id: 'h1', label: '感知宅', member_ids: ['agent:检索'] }],
    },
  ],
  summary: {
    agents: 1, agents_busy: 0, workers: 0, workers_online: 0, events: 2, edges: 1, departments: 1,
  },
  ts: 102,
}

describe('presenceExport', () => {
  it('builds pack with explain on each event', () => {
    const pack = buildReplayPack(snap)
    expect(pack.format).toBe('fangyu.guan.replay')
    expect(pack.events).toHaveLength(2)
    expect(pack.events[0].explain.plain).toContain('检索')
    expect(pack.summary.houses).toBe(1)
  })

  it('renders markdown retrospective', () => {
    const md = replayPackToMarkdown(buildReplayPack(snap))
    expect(md).toContain('# 方隅·观 协作回放')
    expect(md).toContain('感知部')
    expect(md).toContain('下一步')
  })
})
