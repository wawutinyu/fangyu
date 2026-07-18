import { describe, expect, it } from 'vitest'
import type { CollaborationEvent, PresenceEntity } from '@fangyu/core/schema'
import {
  buildEdgesFromEvents,
  frameAtIndex,
  sortEventsAsc,
} from '../presenceReplay'

function agent(id: string, label: string): PresenceEntity {
  return {
    id: `agent:${id}`,
    kind: 'agent',
    name: id,
    label,
    status: 'busy',
    online: true,
    current_skill: 'x',
  }
}

function ev(
  partial: Partial<CollaborationEvent> & Pick<CollaborationEvent, 'id' | 'kind' | 'actor'>,
): CollaborationEvent {
  return {
    ts: 1,
    message: '',
    severity: 'info',
    ...partial,
  }
}

describe('presenceReplay', () => {
  const cast = [agent('检索', '检索'), agent('分析', '分析'), agent('汇总', '汇总')]

  it('sorts events by ts then original order', () => {
    const events = [
      ev({ id: 'b', kind: 'a2a.send', actor: '检索', ts: 2 }),
      ev({ id: 'a', kind: 'a2a.send', actor: '分析', ts: 1 }),
      ev({ id: 'c', kind: 'a2a.send', actor: '汇总', ts: 2 }),
    ]
    expect(sortEventsAsc(events).map(e => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('starts idle at index -1 then busies on send', () => {
    const events = sortEventsAsc([
      ev({ id: '1', kind: 'a2a.send', actor: '检索', target: '分析', ts: 10, message: '材料' }),
    ])
    const start = frameAtIndex(cast, events, -1)
    expect(start.presence.every(p => p.status === 'idle')).toBe(true)
    expect(start.edges).toHaveLength(0)

    const mid = frameAtIndex(cast, events, 0)
    const search = mid.presence.find(p => p.name === '检索')!
    const analyze = mid.presence.find(p => p.name === '分析')!
    expect(search.status).toBe('busy')
    expect(analyze.status).toBe('busy')
    expect(mid.edges).toHaveLength(1)
    expect(mid.activeEvent?.id).toBe('1')
  })

  it('complete returns actor to idle', () => {
    const events = sortEventsAsc([
      ev({ id: '1', kind: 'a2a.started', actor: '汇总', target: '分析', ts: 1 }),
      ev({ id: '2', kind: 'a2a.complete', actor: '汇总', target: '分析', ts: 2 }),
    ])
    const afterStart = frameAtIndex(cast, events, 0)
    expect(afterStart.presence.find(p => p.name === '汇总')!.status).toBe('busy')
    const afterDone = frameAtIndex(cast, events, 1)
    expect(afterDone.presence.find(p => p.name === '汇总')!.status).toBe('idle')
  })

  it('builds edges with counts', () => {
    const edges = buildEdgesFromEvents([
      ev({ id: '1', kind: 'a2a.send', actor: 'A', target: 'B', ts: 1 }),
      ev({ id: '2', kind: 'a2a.send', actor: 'A', target: 'B', ts: 2 }),
      ev({ id: '3', kind: 'a2a.send', actor: 'B', target: 'C', ts: 3 }),
    ])
    expect(edges.find(e => e.source === 'A' && e.target === 'B')?.count).toBe(2)
    expect(edges).toHaveLength(2)
  })
})
