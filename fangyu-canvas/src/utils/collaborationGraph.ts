/** 从 Presence 事件推导的协作边布局（纯函数，可单测） */
import type { CollaborationEdge, PresenceEntity } from '@fangyu/core/schema'

export interface EdgeGraphNode {
  id: string
  x: number
  y: number
  label: string
}

export interface EdgeGraphLayout {
  nodes: EdgeGraphNode[]
  edges: CollaborationEdge[]
  width: number
  height: number
}

/** 将实体与边排成圆 + 弦，无外部依赖 */
export function layoutCollaborationGraph(
  entities: PresenceEntity[],
  edges: CollaborationEdge[],
  opts?: { width?: number; height?: number },
): EdgeGraphLayout {
  const width = opts?.width ?? 520
  const height = opts?.height ?? 280
  const names = new Set<string>()
  for (const e of edges) {
    if (e.source === e.target) continue
    names.add(e.source)
    names.add(e.target)
  }
  for (const p of entities) {
    if (p.kind === 'agent' || names.size < 12) names.add(p.name)
  }
  const ids = Array.from(names).slice(0, 16)
  if (ids.length === 0) {
    return { nodes: [], edges: [], width, height }
  }
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) * 0.36
  const nodes: EdgeGraphNode[] = ids.map((id, i) => {
    const angle = (Math.PI * 2 * i) / ids.length - Math.PI / 2
    const ent = entities.find(p => p.name === id)
    return {
      id,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      label: ent?.label || id,
    }
  })
  const known = new Set(ids)
  const filtered = edges.filter(
    e => e.source !== e.target && known.has(e.source) && known.has(e.target),
  )
  return { nodes, edges: filtered, width, height }
}
