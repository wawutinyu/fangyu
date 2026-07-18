import { describe, expect, it } from 'vitest'
import type {
  CollaborationEdge,
  CollaborationEvent,
  PresenceEntity,
} from '@fangyu/core/schema'
import {
  collectActorPartners,
  filterActorEvents,
} from '../../components/ActorDetailPanel'

function agent(partial: Partial<PresenceEntity> & Pick<PresenceEntity, 'id' | 'label'>): PresenceEntity {
  return {
    kind: 'agent',
    name: partial.id,
    status: 'idle',
    online: true,
    ...partial,
  }
}

describe('ActorDetailPanel helpers', () => {
  it('collects inbound/outbound partners from edges', () => {
    const a = agent({ id: 'a1', label: '检索' })
    const b = agent({ id: 'a2', label: '分析' })
    const edges: CollaborationEdge[] = [
      { source: 'a1', target: 'a2', count: 3, last_kind: 'a2a', last_ts: 100 },
      { source: 'worker-1', target: '检索', count: 1, last_kind: 'dispatch', last_ts: 90 },
    ]
    const partners = collectActorPartners(a, edges, [a, b])
    expect(partners).toHaveLength(2)
    expect(partners[0].direction).toBe('out')
    expect(partners[0].label).toBe('分析')
    expect(partners[1].direction).toBe('in')
  })

  it('filters events by actor id/name/label', () => {
    const a = agent({ id: 'a1', name: 'search', label: '检索' })
    const events: CollaborationEvent[] = [
      { id: '1', ts: 1, kind: 'a2a', actor: 'a1', target: 'a2', message: 'ping', severity: 'info' },
      { id: '2', ts: 2, kind: 'a2a', actor: 'x', target: '检索', message: 'hi', severity: 'info' },
      { id: '3', ts: 3, kind: 'note', actor: 'other', message: 'nope', severity: 'info' },
    ]
    expect(filterActorEvents(a, events).map(e => e.id)).toEqual(['1', '2'])
  })
})
