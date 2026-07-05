import type { Node, Edge } from 'reactflow'

interface ExportNode {
  id: string
  type: string
  name: string
  category: string
  is_group: boolean
  inner_nodes: unknown[]
  inner_links: unknown[]
  config: Record<string, unknown>
  mappings?: Record<string, string>
  position: { x: number; y: number }
}

interface ExportEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  linkType: string
  mappings?: Record<string, string>
}

interface ExportFormat {
  flow_id: string
  flow_name: string
  nodes: ExportNode[]
  links: ExportEdge[]
  global_meta: { session_id: string; user_id: string }
}

let counter = 0
export function generateId(prefix = 'node'): string {
  counter++
  return `${prefix}_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 6)}`
}

export function convertToExportFormat(nodes: Node[], edges: Edge[]): ExportFormat {
  const exportNodes: ExportNode[] = nodes.map(n => ({
    id: n.id,
    type: (n.data?.originType as string) || n.type || 'atom-node',
    name: (n.data?.name as string) || '',
    category: (n.data?.category as string) || '',
    is_group: n.type === 'composite-node',
    inner_nodes: (n.data?.inner_nodes as unknown[]) || [],
    inner_links: (n.data?.inner_links as unknown[]) || [],
    config: (n.data?.config as Record<string, unknown>) || {},
    mappings: (n.data?.mappings as Record<string, string>) || {},
    position: { x: n.position.x, y: n.position.y },
  }))

  const exportEdges: ExportEdge[] = edges.map(e => ({
    id: e.id,
    sourceNodeId: e.source,
    targetNodeId: e.target,
    linkType: (e.data?.linkType as string) || 'serial',
    mappings: (e.data?.mappings as Record<string, string>) || {},
  }))

  return {
    flow_id: '',
    flow_name: '',
    nodes: exportNodes,
    links: exportEdges,
    global_meta: { session_id: '', user_id: '' },
  }
}

export function convertFromExportFormat(exportData: ExportFormat): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = (exportData.nodes || []).map(n => ({
    id: n.id,
    type: n.is_group ? 'composite-node' : 'atom-node',
    position: { x: n.position.x, y: n.position.y },
    data: {
      originType: n.type,
      name: n.name,
      category: n.category,
      label: n.name || '',
      config: n.config || {},
      ...(n.is_group ? { is_group: true, inner_nodes: n.inner_nodes || [], inner_links: n.inner_links || [], mappings: n.mappings || {} } : {}),
    },
  }))

  const edges: Edge[] = (exportData.links || []).map(e => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: 'flow-edge',
    data: {
      linkType: e.linkType || 'serial',
      mappings: e.mappings || {},
    },
  }))

  return { nodes, edges }
}

export function getExecutionOrder(nodeIds: string[], edges: Edge[]): string[] {
  const adj = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  nodeIds.forEach(id => { adj.set(id, []); inDegree.set(id, 0) })
  edges.forEach(e => {
    if (nodeIds.includes(e.source) && nodeIds.includes(e.target)) {
      adj.get(e.source)!.push(e.target)
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
    }
  })
  const queue: string[] = []
  inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id) })
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const neighbor of (adj.get(id) || [])) {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1)
      if (inDegree.get(neighbor) === 0) queue.push(neighbor)
    }
  }
  return order
}

export function offsetPosition(nodes: ExportNode[], centerX: number, centerY: number): ExportNode[] {
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 180
  return nodes.map((n, i) => ({
    ...n,
    position: {
      x: centerX + (i % cols) * spacing - (cols - 1) * spacing / 2,
      y: centerY + Math.floor(i / cols) * spacing - (Math.ceil(nodes.length / cols) - 1) * spacing / 2,
    },
  }))
}
