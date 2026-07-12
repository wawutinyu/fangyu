import { describe, expect, it } from 'vitest'
import { layoutCollaborationGraph } from '../collaborationGraph'
import type { CollaborationEdge, PresenceEntity } from '@fangyu/core/schema'

describe('collaborationGraph', () => {
  it('layouts nodes on a circle from edges', () => {
    const entities: PresenceEntity[] = [
      { id: 'agent:a', kind: 'agent', name: 'a', label: 'A', status: 'idle', online: true },
      { id: 'agent:b', kind: 'agent', name: 'b', label: 'B', status: 'busy', online: true },
    ]
    const edges: CollaborationEdge[] = [
      { source: 'a', target: 'b', count: 3, last_kind: 'a2a.send', last_ts: 1 },
    ]
    const layout = layoutCollaborationGraph(entities, edges)
    expect(layout.nodes.length).toBeGreaterThanOrEqual(2)
    expect(layout.edges).toHaveLength(1)
    const posKey = (n: { x: number; y: number }) => `${n.x.toFixed(2)},${n.y.toFixed(2)}`
    expect(posKey(layout.nodes[0])).not.toBe(posKey(layout.nodes[1]))
  })

  it('returns empty when no names', () => {
    const layout = layoutCollaborationGraph([], [])
    expect(layout.nodes).toEqual([])
  })
})
