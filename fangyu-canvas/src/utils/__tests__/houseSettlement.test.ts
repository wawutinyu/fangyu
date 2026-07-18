import { describe, expect, it } from 'vitest'
import type { CollaborationEdge, PresenceEntity } from '@fangyu/core/schema'
import { assignHouses, departmentsToGroupHints, layoutHouseSettlement } from '../houseSettlement'

describe('houseSettlement', () => {
  const agents: PresenceEntity[] = [
    { id: 'agent:a', kind: 'agent', name: 'a', label: '搜索', status: 'idle', online: true },
    { id: 'agent:b', kind: 'agent', name: 'b', label: '分析', status: 'busy', online: true },
  ]
  const workers: PresenceEntity[] = [
    { id: 'worker:1', kind: 'worker', name: 'w1', label: '本机行', status: 'idle', online: true },
  ]

  it('splits agents and workers into two houses by default', () => {
    const houses = assignHouses([...agents, ...workers])
    expect(houses).toHaveLength(2)
    expect(houses.map(h => h.houseName).sort()).toEqual(['行署', '智能体宅'].sort())
  })

  it('uses a single shared house when only agents', () => {
    const houses = assignHouses(agents)
    expect(houses).toHaveLength(1)
    expect(houses[0].houseName).toBe('共域')
  })

  it('respects groupHints as departments', () => {
    const houses = assignHouses(agents, [
      { id: 'dept-search', label: '检索部', memberKeys: ['a', '搜索'] },
    ])
    expect(houses.some(h => h.houseName === '检索部')).toBe(true)
    expect(houses.find(h => h.houseName === '检索部')!.members).toHaveLength(1)
  })

  it('auto-groups by presence.department and splits large depts into multi-house', () => {
    const cast: PresenceEntity[] = [
      { id: 'agent:1', kind: 'agent', name: 'a', label: 'a', status: 'idle', online: true, department: '研判部', department_id: 'dept-j' },
      { id: 'agent:2', kind: 'agent', name: 'b', label: 'b', status: 'idle', online: true, department: '研判部', department_id: 'dept-j' },
      { id: 'agent:3', kind: 'agent', name: 'c', label: 'c', status: 'idle', online: true, department: '研判部', department_id: 'dept-j' },
      { id: 'agent:4', kind: 'agent', name: 'd', label: 'd', status: 'idle', online: true, department: '研判部', department_id: 'dept-j' },
      { id: 'agent:5', kind: 'agent', name: 'e', label: 'e', status: 'idle', online: true, department: '感知部', department_id: 'dept-s' },
    ]
    const houses = assignHouses(cast)
    expect(houses.length).toBe(3) // 研判 + 东厢 + 感知
    expect(houses.map(h => h.houseName).sort()).toEqual(['感知部', '研判部', '研判部·东厢'].sort())
  })

  it('maps PresenceDepartment contract to multi-house hints', () => {
    const hints = departmentsToGroupHints([
      {
        id: 'dept-judge',
        label: '研判部',
        houses: [
          { id: 'h1', label: '研判宅', member_ids: ['agent:a'] },
          { id: 'h2', label: '研判·东厢', member_ids: ['agent:b'] },
        ],
      },
    ])
    expect(hints).toHaveLength(2)
    expect(hints[0].departmentLabel).toBe('研判部')
    expect(hints[1].label).toBe('研判·东厢')
  })

  it('places busy agents in hall and idle in nook', () => {
    const layout = layoutHouseSettlement(agents, [], { width: 700, height: 360 })
    expect(layout.houses.length).toBe(1)
    const busy = layout.actors.find(a => a.id === 'agent:b')!
    const idle = layout.actors.find(a => a.id === 'agent:a')!
    expect(busy.place).toBe('hall')
    expect(idle.place).toBe('nook')
    expect(layout.houses[0].hall.w).toBeGreaterThan(0)
    expect(layout.houses[0].court.w).toBeGreaterThan(0)
    expect(layout.houses[0].nooks.length).toBe(2)
  })

  it('draws a path between two houses when edges cross', () => {
    const edges: CollaborationEdge[] = [
      {
        source: 'agent:a',
        target: 'worker:1',
        count: 3,
        last_kind: 'a2a.send',
        last_severity: 'info',
      },
    ]
    const layout = layoutHouseSettlement([...agents, ...workers], edges, { width: 720, height: 360 })
    expect(layout.houses.length).toBe(2)
    expect(layout.paths.length).toBeGreaterThanOrEqual(1)
    expect(layout.paths[0].count).toBe(3)
  })
})
