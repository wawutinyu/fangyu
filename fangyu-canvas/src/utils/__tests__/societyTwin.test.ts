import { describe, expect, it } from 'vitest'
import type { CollaborationEdge, CollaborationEvent, PresenceEntity } from '@fangyu/core/schema'
import {
  layoutSocietyTwin,
  matchPresenceToCanvas,
  runEdgesAtTime,
  statusAtTime,
} from '../societyTwin'

describe('societyTwin', () => {
  const agents = [
    { id: 'n1', label: '搜索 Agent', position: { x: 0, y: 0 }, type: 'a2a-agent' },
    { id: 'n2', label: '分析 Agent', position: { x: 200, y: 0 }, type: 'a2a-agent' },
    { id: 'n3', label: '汇总 Agent', position: { x: 100, y: 160 }, type: 'a2a-agent' },
  ]
  const agentEdges = [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
  ]

  it('uses canvas positions (not equal circle spacing) when agents exist', () => {
    const presence: PresenceEntity[] = [
      { id: 'agent:搜索 Agent', kind: 'agent', name: '搜索 Agent', label: '搜索 Agent', status: 'idle', online: true },
      { id: 'agent:分析 Agent', kind: 'agent', name: '分析 Agent', label: '分析 Agent', status: 'busy', online: true },
    ]
    const layout = layoutSocietyTwin(agents, agentEdges, presence, [], { width: 720, height: 420 })
    expect(layout.fromCanvas).toBe(true)
    expect(layout.nodes.length).toBe(3)
    expect(layout.designEdges).toHaveLength(2)
    const n1 = layout.nodes.find(n => n.id === 'n1')!
    const n2 = layout.nodes.find(n => n.id === 'n2')!
    // 画布上 n1 在左、n2 在右 → 归一化后 x 应明显不同且 n1.x < n2.x
    expect(n1.x).toBeLessThan(n2.x)
    expect(n1.bound).toBe(true)
    expect(n2.status).toBe('busy')
  })

  it('falls back to circle layout when canvas empty', () => {
    const presence: PresenceEntity[] = [
      { id: 'agent:a', kind: 'agent', name: 'a', label: 'A', status: 'idle', online: true },
      { id: 'agent:b', kind: 'agent', name: 'b', label: 'B', status: 'idle', online: true },
    ]
    const edges: CollaborationEdge[] = [
      { source: 'a', target: 'b', count: 1, last_kind: 'a2a.send', last_ts: 1 },
    ]
    const layout = layoutSocietyTwin([], [], presence, edges, { width: 520, height: 260 })
    expect(layout.fromCanvas).toBe(false)
    expect(layout.nodes.length).toBeGreaterThanOrEqual(2)
    expect(layout.designEdges).toEqual([])
  })

  it('matchPresenceToCanvas matches by label/name', () => {
    const hit = matchPresenceToCanvas(
      { id: 'agent:x', kind: 'agent', name: '搜索 Agent', label: '搜索 Agent', status: 'idle', online: true },
      agents,
    )
    expect(hit?.id).toBe('n1')
  })

  it('runEdgesAtTime only counts events up to t', () => {
    const nodes = layoutSocietyTwin(agents, agentEdges, [], [], { width: 720, height: 420 }).nodes
    const events: CollaborationEvent[] = [
      { id: '1', ts: 10, kind: 'a2a.send', actor: '搜索 Agent', target: '分析 Agent', message: '', severity: 'info' },
      { id: '2', ts: 20, kind: 'a2a.send', actor: '分析 Agent', target: '汇总 Agent', message: '', severity: 'info' },
    ]
    const at15 = runEdgesAtTime(events, nodes, 15)
    expect(at15).toHaveLength(1)
    expect(at15[0].source).toBe('n1')
    expect(at15[0].target).toBe('n2')
    const at25 = runEdgesAtTime(events, nodes, 25)
    expect(at25.length).toBeGreaterThanOrEqual(2)
  })

  it('statusAtTime flips busy then idle', () => {
    const nodes = layoutSocietyTwin(agents, agentEdges, [], []).nodes
    const n2 = nodes.find(n => n.id === 'n2')!
    const events: CollaborationEvent[] = [
      { id: '1', ts: 10, kind: 'a2a.send', actor: '搜索 Agent', target: '分析 Agent', message: '', severity: 'info' },
      { id: '2', ts: 20, kind: 'a2a.complete', actor: '分析 Agent', target: '搜索 Agent', message: '', severity: 'info' },
    ]
    expect(statusAtTime(n2, events, 15)).toBe('busy')
    expect(statusAtTime(n2, events, 25)).toBe('idle')
  })
})
