/** 观 · Agent 社会孪生：画布拓扑布局 + Presence 对齐 + 回放推导 */

import type {
  CollaborationEdge,
  CollaborationEvent,
  PresenceEntity,
} from '@fangyu/core/schema'
import { layoutCollaborationGraph, type EdgeGraphLayout, type EdgeGraphNode } from './collaborationGraph'

export interface TwinAgentNode {
  id: string
  label: string
  type?: string
  position: { x: number; y: number }
}

export interface TwinAgentEdge {
  id: string
  source: string
  target: string
}

export interface TwinNode extends EdgeGraphNode {
  /** 画布节点 id；无画布绑定时为空 */
  canvasId?: string
  kind?: string
  status?: string
  bound: boolean
  presenceId?: string
}

export interface TwinDesignEdge {
  source: string
  target: string
  /** 端点用 twin node id（通常是 canvas id 或 presence name） */
}

export interface SocietyTwinLayout {
  nodes: TwinNode[]
  /** 设计拓扑（淡线） */
  designEdges: TwinDesignEdge[]
  /** 运行协作边（实线），source/target 已映射到 twin node id */
  runEdges: CollaborationEdge[]
  width: number
  height: number
  /** 是否使用了 Agent 画布坐标 */
  fromCanvas: boolean
}

function norm(s: string): string {
  return (s || '').trim().toLowerCase()
}

/** 将 Presence 实体匹配到画布节点（id / label / name / canvas_id） */
export function matchPresenceToCanvas(
  entity: PresenceEntity,
  agentNodes: TwinAgentNode[],
): TwinAgentNode | undefined {
  const canvasId = (entity as PresenceEntity & { canvas_id?: string }).canvas_id
  if (canvasId) {
    const byCid = agentNodes.find(n => n.id === canvasId)
    if (byCid) return byCid
  }
  const candidates = [entity.id, entity.name, entity.label].map(norm).filter(Boolean)
  return agentNodes.find(n => {
    const keys = [n.id, n.label].map(norm)
    return candidates.some(c => keys.includes(c) || keys.some(k => k && (k.includes(c) || c.includes(k))))
  })
}

/** 把协作边端点解析到 twin 节点 id */
export function resolveEndpoint(
  name: string,
  nodes: TwinNode[],
): string | null {
  const n = norm(name)
  if (!n) return null
  const hit = nodes.find(node =>
    norm(node.id) === n
    || norm(node.label) === n
    || norm(node.canvasId || '') === n
    || norm(node.presenceId || '') === n
    || norm(node.presenceId || '').replace(/^agent:/, '') === n
  )
  return hit?.id ?? null
}

/**
 * 社会孪生布局：有 Agent 画布时用画布坐标；否则回退圆形弦图。
 */
export function layoutSocietyTwin(
  agentNodes: TwinAgentNode[],
  agentEdges: TwinAgentEdge[],
  presence: PresenceEntity[],
  collabEdges: CollaborationEdge[],
  opts?: { width?: number; height?: number },
): SocietyTwinLayout {
  const width = opts?.width ?? 720
  const height = opts?.height ?? 420
  const agents = agentNodes.filter(n =>
    !n.type || n.type === 'a2a-agent' || n.type === 'a2a-external' || n.type === 'a2a-router',
  )

  if (agents.length === 0) {
    const fallback: EdgeGraphLayout = layoutCollaborationGraph(presence, collabEdges, { width, height })
    return {
      nodes: fallback.nodes.map(n => {
        const ent = presence.find(p => p.name === n.id || p.label === n.label)
        return {
          ...n,
          bound: false,
          kind: ent?.kind,
          status: ent?.status != null ? String(ent.status) : undefined,
          presenceId: ent?.id,
        }
      }),
      designEdges: [],
      runEdges: fallback.edges,
      width: fallback.width,
      height: fallback.height,
      fromCanvas: false,
    }
  }

  const xs = agents.map(a => a.position.x)
  const ys = agents.map(a => a.position.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const pad = 48

  const nodes: TwinNode[] = agents.map(a => {
    const ent = presence.find(p => matchPresenceToCanvas(p, [a]))
    const x = pad + ((a.position.x - minX) / spanX) * (width - pad * 2)
    const y = pad + ((a.position.y - minY) / spanY) * (height - pad * 2)
    return {
      id: a.id,
      canvasId: a.id,
      x,
      y,
      label: a.label || a.id,
      bound: !!ent,
      kind: ent?.kind || 'agent',
      status: ent ? String(ent.status) : 'offline',
      presenceId: ent?.id,
    }
  })

  // Presence 里有、画布没有的实体：挂在底部一排
  const boundPresenceIds = new Set(nodes.map(n => n.presenceId).filter(Boolean))
  const orphans = presence.filter(p => !boundPresenceIds.has(p.id) && !matchPresenceToCanvas(p, agents))
  orphans.slice(0, 8).forEach((p, i) => {
    const n = orphans.length
    nodes.push({
      id: `presence:${p.name}`,
      x: pad + (n <= 1 ? (width - pad * 2) / 2 : (i / (n - 1)) * (width - pad * 2)),
      y: height - 28,
      label: p.label || p.name,
      bound: false,
      kind: p.kind,
      status: String(p.status),
      presenceId: p.id,
    })
  })

  const idSet = new Set(nodes.map(n => n.id))
  const designEdges: TwinDesignEdge[] = agentEdges
    .filter(e => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target)
    .map(e => ({ source: e.source, target: e.target }))

  const runEdges: CollaborationEdge[] = []
  for (const e of collabEdges) {
    if (e.source === e.target) continue
    const s = resolveEndpoint(e.source, nodes)
    const t = resolveEndpoint(e.target, nodes)
    if (!s || !t || s === t) continue
    runEdges.push({ ...e, source: s, target: t })
  }

  return { nodes, designEdges, runEdges, width, height, fromCanvas: true }
}

/** 截止到 t 的运行边（按事件前缀聚合） */
export function runEdgesAtTime(
  events: CollaborationEvent[],
  nodes: TwinNode[],
  t: number,
  limit = 40,
): CollaborationEdge[] {
  const filtered = events.filter(e => (e.ts || 0) <= t)
  const agg = new Map<string, CollaborationEdge>()
  // 事件通常 newest-first，按时间正序重放
  const chronological = [...filtered].sort((a, b) => (a.ts || 0) - (b.ts || 0))
  for (const e of chronological) {
    if (!e.actor || !e.target) continue
    const s = resolveEndpoint(e.actor, nodes)
    const tId = resolveEndpoint(String(e.target), nodes)
    if (!s || !tId || s === tId) continue
    const key = `${s}->${tId}`
    const prev = agg.get(key)
    if (!prev) {
      agg.set(key, {
        source: s,
        target: tId,
        count: 1,
        last_kind: e.kind,
        last_ts: e.ts,
        last_severity: String(e.severity || 'info'),
      })
    } else {
      prev.count += 1
      prev.last_kind = e.kind
      prev.last_ts = e.ts
      prev.last_severity = String(e.severity || 'info')
    }
  }
  return Array.from(agg.values())
    .sort((a, b) => (b.last_ts || 0) - (a.last_ts || 0))
    .slice(0, limit)
}

/** 从事件粗推某时刻节点是否 busy（working 类事件后、完成类事件前） */
export function statusAtTime(
  node: TwinNode,
  events: CollaborationEvent[],
  t: number,
  liveStatus?: string,
): string {
  if (liveStatus && (t >= Date.now() / 1000 - 1)) return liveStatus
  const names = [node.id, node.label, node.canvasId, node.presenceId, node.presenceId?.replace(/^agent:/, '')]
    .filter(Boolean)
    .map(s => norm(String(s)))

  const relevant = events
    .filter(e => (e.ts || 0) <= t)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))

  let status = node.bound ? 'idle' : (liveStatus || 'offline')
  for (const e of relevant) {
    const actor = norm(e.actor)
    const target = norm(String(e.target || ''))
    const involves = names.some(n => n === actor || n === target)
    if (!involves) continue
    const k = e.kind || ''
    if (k.includes('failed') || e.severity === 'error' || e.severity === 'deny') {
      status = 'error'
    } else if (k.includes('send') || k.includes('started') || k.includes('enqueued')) {
      status = 'busy'
    } else if (k.includes('complete') || k.includes('done')) {
      status = 'idle'
    }
  }
  return status
}

/** 找出应脉冲的边（最近 maxAgeSec 内有事件） */
export function pulsingEdgeKeys(
  events: CollaborationEvent[],
  nodes: TwinNode[],
  nowSec: number,
  maxAgeSec = 2.5,
): Set<string> {
  const keys = new Set<string>()
  for (const e of events) {
    if ((nowSec - (e.ts || 0)) > maxAgeSec) continue
    if (!e.actor || !e.target) continue
    const s = resolveEndpoint(e.actor, nodes)
    const t = resolveEndpoint(String(e.target), nodes)
    if (s && t) keys.add(`${s}->${t}`)
  }
  return keys
}
