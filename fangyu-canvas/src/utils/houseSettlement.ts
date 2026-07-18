/**
 * 观 · 宅子共场布局
 * 宅子 = 部门；宅内 = 私密角 + 公共厅（主）+ 宅内院（辅）
 * 风格：现代院壳 + 厅为主协作场（非工位、非空旷广场）
 */

import type { CollaborationEdge, PresenceDepartment, PresenceEntity } from '@fangyu/core/schema'

export const HOUSE_PALETTE = {
  skyWash: '#B9D9F2',
  ground: '#B7D4A8',
  groundDeep: '#8FBC7A',
  wall: '#FFF8F0',
  wallStroke: '#D4B896',
  wood: '#E0A86E',
  woodDeep: '#C47E3B',
  hallFloor: '#F0D9B5',
  courtGrass: '#7FBF6E',
  path: '#E8C9A0',
  ink: '#3D3A36',
  muted: '#7A7268',
  accent: '#E07A6F',
  bloom: '#F2A0B5',
  bloom2: '#F5C84C',
  water: '#5BA8C9',
  status: {
    idle: '#4CAF7A',
    busy: '#F0A05A',
    waiting: '#E07A6F',
    error: '#E05555',
    offline: '#A8A29A',
    unauthorized: '#D4A017',
  },
} as const

export type HouseRolePlace = 'nook' | 'hall' | 'court'

export interface HouseMember {
  id: string
  label: string
  kind: string
  status: string
  /** 私密角槽位（宅内固定） */
  nookIndex: number
  /** 当前出现位置：默认 busy→厅、idle→角、跨宅交互→院 */
  place: HouseRolePlace
  presence: PresenceEntity
}

export interface HouseLayout {
  id: string
  name: string
  /** 所属部门（多宅同部门时共用） */
  departmentId?: string
  departmentLabel?: string
  /** 宅外壳 */
  x: number
  y: number
  w: number
  h: number
  /** 公共厅（主） */
  hall: { x: number; y: number; w: number; h: number }
  /** 宅内院（辅） */
  court: { x: number; y: number; w: number; h: number }
  /** 私密角矩形列表 */
  nooks: { x: number; y: number; w: number; h: number }[]
  members: HouseMember[]
}

export interface SettlementPath {
  fromHouseId: string
  toHouseId: string
  x1: number
  y1: number
  x2: number
  y2: number
  hot?: boolean
  count?: number
}

export interface HouseSettlement {
  width: number
  height: number
  houses: HouseLayout[]
  paths: SettlementPath[]
  /** 角色屏幕坐标（中心点） */
  actors: {
    id: string
    houseId: string
    label: string
    status: string
    kind: string
    x: number
    y: number
    place: HouseRolePlace
  }[]
}

export interface GroupHint {
  id: string
  label: string
  /** 归属该组的 agent 画布 id 或 label */
  memberKeys: string[]
  /** 所属部门 id（多宅同部门时共用） */
  departmentId?: string
  departmentLabel?: string
}

/** 部门契约 → 布局用 groupHints（一宅一条） */
export function departmentsToGroupHints(
  departments: PresenceDepartment[],
): GroupHint[] {
  const hints: GroupHint[] = []
  for (const d of departments) {
    for (const h of d.houses || []) {
      hints.push({
        id: h.id,
        label: h.label || d.label,
        memberKeys: [...(h.member_ids || [])],
        departmentId: d.id,
        departmentLabel: d.label,
      })
    }
  }
  return hints
}

/** 仅有 entity.department 时，自动聚成 groupHints（大部门拆多宅） */
export function groupHintsFromPresence(
  presence: PresenceEntity[],
  maxPerHouse = 3,
): GroupHint[] {
  const buckets = new Map<string, { label: string; members: PresenceEntity[] }>()
  const order: string[] = []
  for (const p of presence) {
    const did = (p.department_id || '').trim()
    const dlabel = (p.department || '').trim()
    if (!did && !dlabel) continue
    const id = did || `dept-${dlabel}`
    const label = dlabel || id
    if (!buckets.has(id)) {
      buckets.set(id, { label, members: [] })
      order.push(id)
    }
    buckets.get(id)!.members.push(p)
  }
  const hints: GroupHint[] = []
  const annex = ['', '·东厢', '·西厢', '·北厢', '·南厢']
  for (const id of order) {
    const b = buckets.get(id)!
    for (let i = 0; i < b.members.length; i += maxPerHouse) {
      const chunk = b.members.slice(i, i + maxPerHouse)
      const annexI = Math.floor(i / maxPerHouse)
      const suffix = annexI < annex.length ? annex[annexI] : `·${annexI + 1}`
      hints.push({
        id: annexI === 0 ? `house-${id}` : `house-${id}-${annexI}`,
        label: annexI === 0 ? b.label : `${b.label}${suffix}`,
        memberKeys: chunk.flatMap(m => [m.id, m.name, m.label].filter(Boolean) as string[]),
        departmentId: id,
        departmentLabel: b.label,
      })
    }
  }
  return hints
}

function norm(s: string): string {
  return (s || '').trim().toLowerCase()
}

function statusPlace(status: string, inCrossHouse: boolean): HouseRolePlace {
  if (inCrossHouse) return 'court'
  const s = status.toLowerCase()
  if (s === 'busy' || s === 'error' || s === 'unauthorized') return 'hall'
  if (s === 'offline') return 'nook'
  return 'nook'
}

function haloColor(status: string): string {
  const s = status.toLowerCase()
  if (s === 'busy') return HOUSE_PALETTE.status.busy
  if (s === 'idle') return HOUSE_PALETTE.status.idle
  if (s === 'error') return HOUSE_PALETTE.status.error
  if (s === 'unauthorized') return HOUSE_PALETTE.status.unauthorized
  if (s === 'offline') return HOUSE_PALETTE.status.offline
  return HOUSE_PALETTE.status.waiting
}

/** 导出供场景着色 */
export { haloColor }

function entityKeys(p: PresenceEntity): string[] {
  const raw = [p.id, p.name, p.label].map(norm).filter(Boolean)
  const stripped = raw.map(s => s.replace(/^(agent|worker):/, ''))
  return [...new Set([...raw, ...stripped])]
}

function matchesGroup(p: PresenceEntity, memberKeys: string[]): boolean {
  const keys = memberKeys.map(norm).filter(Boolean)
  const cands = entityKeys(p)
  return cands.some(c => keys.some(k => c === k || k === c.replace(/^(agent|worker):/, '')))
}

/**
 * 按部门分宅：优先 groupHints；否则按 presence.department；再退回 Agent/行。
 */
export function assignHouses(
  presence: PresenceEntity[],
  groupHints: GroupHint[] = [],
): {
  houseId: string
  houseName: string
  members: PresenceEntity[]
  departmentId?: string
  departmentLabel?: string
}[] {
  const used = new Set<string>()
  const houses: {
    houseId: string
    houseName: string
    members: PresenceEntity[]
    departmentId?: string
    departmentLabel?: string
  }[] = []

  const hints = groupHints.length > 0 ? groupHints : groupHintsFromPresence(presence)

  for (const g of hints) {
    const members = presence.filter(p => {
      if (used.has(p.id)) return false
      return matchesGroup(p, g.memberKeys)
    })
    if (members.length === 0) continue
    members.forEach(m => used.add(m.id))
    houses.push({
      houseId: g.id,
      houseName: g.label || g.id,
      members,
      departmentId: g.departmentId,
      departmentLabel: g.departmentLabel,
    })
  }

  const rest = presence.filter(p => !used.has(p.id))
  const agents = rest.filter(p => p.kind === 'agent')
  const workers = rest.filter(p => p.kind === 'worker')
  const other = rest.filter(p => p.kind !== 'agent' && p.kind !== 'worker')

  if (houses.length === 0 && agents.length && workers.length) {
    houses.push({ houseId: 'house-agents', houseName: '智能体宅', members: [...agents, ...other] })
    houses.push({ houseId: 'house-workers', houseName: '行署', members: workers })
  } else if (houses.length === 0) {
    const all = [...agents, ...workers, ...other]
    if (all.length) {
      houses.push({ houseId: 'house-shared', houseName: '共域', members: all })
    }
  } else {
    if (agents.length || other.length) {
      houses.push({
        houseId: 'house-ungrouped',
        houseName: '闲置厢',
        members: [...agents, ...other],
      })
    }
    if (workers.length) {
      houses.push({ houseId: 'house-workers', houseName: '行署', members: workers })
    }
  }

  return houses.filter(h => h.members.length > 0)
}

function layoutOneHouse(
  houseId: string,
  houseName: string,
  members: PresenceEntity[],
  ox: number,
  oy: number,
  houseW: number,
  houseH: number,
  crossIds: Set<string>,
  departmentId?: string,
  departmentLabel?: string,
): HouseLayout {
  const pad = 18
  const titleH = 36
  const innerX = ox + pad
  const innerY = oy + pad + titleH
  const innerW = houseW - pad * 2 - 12
  const innerH = houseH - pad * 2 - titleH - 8

  // 左：私密角带；右上：厅；右下：院
  const nookBandW = Math.min(132, Math.max(96, innerW * 0.34))
  const hallH = Math.max(96, innerH * 0.54)
  const hall: HouseLayout['hall'] = {
    x: innerX + nookBandW + 8,
    y: innerY,
    w: innerW - nookBandW - 8,
    h: hallH,
  }
  const court: HouseLayout['court'] = {
    x: hall.x,
    y: hall.y + hall.h + 8,
    w: hall.w,
    h: Math.max(48, innerH - hallH - 8),
  }

  const n = Math.max(members.length, 1)
  const nookH = Math.max(36, (innerH - (n - 1) * 6) / n)
  const nooks = members.map((_, i) => ({
    x: innerX,
    y: innerY + i * (nookH + 6),
    w: nookBandW,
    h: nookH,
  }))

  const houseMembers: HouseMember[] = members.map((p, i) => {
    const place = statusPlace(String(p.status), crossIds.has(p.id))
    return {
      id: p.id,
      label: p.label || p.name,
      kind: p.kind,
      status: String(p.status),
      nookIndex: i,
      place,
      presence: p,
    }
  })

  return {
    id: houseId,
    name: houseName,
    departmentId,
    departmentLabel,
    x: ox,
    y: oy,
    w: houseW,
    h: houseH,
    hall,
    court,
    nooks,
    members: houseMembers,
  }
}

function actorPoint(house: HouseLayout, m: HouseMember): { x: number; y: number } {
  if (m.place === 'hall') {
    const slot = house.members.filter(x => x.place === 'hall').findIndex(x => x.id === m.id)
    const count = Math.max(house.members.filter(x => x.place === 'hall').length, 1)
    const t = count === 1 ? 0.5 : (slot + 1) / (count + 1)
    return {
      x: house.hall.x + house.hall.w * t,
      y: house.hall.y + house.hall.h * 0.55,
    }
  }
  if (m.place === 'court') {
    const slot = house.members.filter(x => x.place === 'court').findIndex(x => x.id === m.id)
    const count = Math.max(house.members.filter(x => x.place === 'court').length, 1)
    const t = count === 1 ? 0.5 : (slot + 1) / (count + 1)
    return {
      x: house.court.x + house.court.w * t,
      y: house.court.y + house.court.h * 0.5,
    }
  }
  const nook = house.nooks[m.nookIndex] || house.nooks[0]
  return {
    x: nook.x + nook.w * 0.5,
    y: nook.y + nook.h * 0.55,
  }
}

/**
 * 生成聚落布局：1～N 座现代院宅 + 宅间径。
 */
export function layoutHouseSettlement(
  presence: PresenceEntity[],
  edges: CollaborationEdge[] = [],
  opts?: {
    width?: number
    height?: number
    groupHints?: GroupHint[]
  },
): HouseSettlement {
  const width = opts?.width ?? 720
  const height = opts?.height ?? 380
  const groups = assignHouses(presence, opts?.groupHints || [])

  if (groups.length === 0) {
    return { width, height, houses: [], paths: [], actors: [] }
  }

  // 跨宅交互的实体：若边两端不在同宅，双方倾向出现在院
  const memberHouse = new Map<string, string>()
  for (const g of groups) {
    for (const m of g.members) {
      memberHouse.set(m.id, g.houseId)
      memberHouse.set(norm(m.name), g.houseId)
      memberHouse.set(norm(m.label), g.houseId)
    }
  }
  const crossIds = new Set<string>()
  for (const e of edges) {
    const hs = memberHouse.get(e.source) || memberHouse.get(norm(e.source))
    const ht = memberHouse.get(e.target) || memberHouse.get(norm(e.target))
    if (hs && ht && hs !== ht) {
      for (const g of groups) {
        for (const m of g.members) {
          if (
            m.id === e.source || m.id === e.target
            || norm(m.name) === norm(e.source) || norm(m.name) === norm(e.target)
            || norm(m.label) === norm(e.source) || norm(m.label) === norm(e.target)
          ) {
            crossIds.add(m.id)
          }
        }
      }
    }
  }

  const n = groups.length
  const gap = 28
  const marginX = 24
  const marginY = 20
  const cols = n === 1 ? 1 : n === 2 ? 2 : Math.min(3, n)
  const rows = Math.ceil(n / cols)
  const houseW = (width - marginX * 2 - gap * (cols - 1)) / cols
  const houseH = (height - marginY * 2 - gap * (rows - 1)) / rows

  const houses: HouseLayout[] = groups.map((g, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const ox = marginX + col * (houseW + gap)
    const oy = marginY + row * (houseH + gap)
    return layoutOneHouse(
      g.houseId,
      g.houseName,
      g.members,
      ox,
      oy,
      houseW,
      houseH,
      crossIds,
      g.departmentId,
      g.departmentLabel,
    )
  })

  const paths: SettlementPath[] = []
  if (houses.length >= 2) {
    for (let i = 0; i < houses.length - 1; i++) {
      const a = houses[i]
      const b = houses[i + 1]
      const edge = edges.find(e => {
        const as = a.members.some(m =>
          m.id === e.source || norm(m.name) === norm(e.source) || norm(m.label) === norm(e.source),
        )
        const bt = b.members.some(m =>
          m.id === e.target || norm(m.name) === norm(e.target) || norm(m.label) === norm(e.target),
        )
        const bs = b.members.some(m =>
          m.id === e.source || norm(m.name) === norm(e.source) || norm(m.label) === norm(e.source),
        )
        const at = a.members.some(m =>
          m.id === e.target || norm(m.name) === norm(e.target) || norm(m.label) === norm(e.target),
        )
        return (as && bt) || (bs && at)
      })
      paths.push({
        fromHouseId: a.id,
        toHouseId: b.id,
        x1: a.x + a.w,
        y1: a.y + a.h * 0.55,
        x2: b.x,
        y2: b.y + b.h * 0.55,
        hot: edge ? (edge.last_severity === 'deny' || edge.last_severity === 'error') : false,
        count: edge?.count,
      })
    }
  }

  const actors = houses.flatMap(h =>
    h.members.map(m => {
      const pt = actorPoint(h, m)
      return {
        id: m.id,
        houseId: h.id,
        label: m.label,
        status: m.status,
        kind: m.kind,
        x: pt.x,
        y: pt.y,
        place: m.place,
      }
    }),
  )

  return { width, height, houses, paths, actors }
}

/** 选中协作边时，点亮对应宅间径 */
export function withSelectedEdgeHighlight(
  settlement: HouseSettlement,
  selectedEdge: { source: string; target: string } | null | undefined,
): HouseSettlement {
  if (!selectedEdge) return settlement
  const matchKey = (actor: HouseSettlement['actors'][0], key: string) => {
    const k = norm(key)
    return actor.id === key || norm(actor.label) === k || norm(actor.id) === k
  }
  const a = settlement.actors.find(x => matchKey(x, selectedEdge.source))
  const b = settlement.actors.find(x => matchKey(x, selectedEdge.target))
  if (!a || !b || a.houseId === b.houseId) {
    return settlement
  }
  const paths = settlement.paths.map(p => {
    const hit =
      (p.fromHouseId === a.houseId && p.toHouseId === b.houseId)
      || (p.fromHouseId === b.houseId && p.toHouseId === a.houseId)
    return hit ? { ...p, hot: true } : p
  })
  return { ...settlement, paths }
}
