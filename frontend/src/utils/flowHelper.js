let counter = 0
export function generateId(prefix = 'node') {
  counter++
  return `${prefix}_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 6)}`
}

function nodeToExport(lfNode) {
  const { id, type, properties, x, y } = lfNode
  const isGroup = type === 'composite-node'
  return {
    id,
    type: properties.originType || type,
    name: properties.name || '',
    category: properties.category || '',
    is_group: isGroup,
    inner_nodes: properties.inner_nodes || [],
    inner_links: properties.inner_links || [],
    config: properties.config || {},
    mappings: properties.mappings || {},
    position: { x, y }
  }
}

function edgeToExport(lfEdge) {
  return {
    id: lfEdge.id,
    sourceNodeId: lfEdge.sourceNodeId,
    targetNodeId: lfEdge.targetNodeId,
    linkType: lfEdge.properties?.linkType || 'serial',
    mappings: lfEdge.properties?.mappings || {},
  }
}

export function convertToExportFormat(lf) {
  const lfData = lf.getGraphData()
  const nodes = (lfData.nodes || []).map(nodeToExport)
  const links = (lfData.edges || []).map(edgeToExport)
  return {
    flow_id: '',
    flow_name: '',
    nodes,
    links,
    global_meta: { session_id: '', user_id: '' }
  }
}

export function convertFromExportFormat(exportData) {
  const nodes = (exportData.nodes || []).map(n => ({
    id: n.id,
    type: n.is_group ? 'composite-node' : 'atom-node',
    x: n.position.x,
    y: n.position.y,
    properties: {
      originType: n.type,
      name: n.name,
      category: n.category,
      is_group: n.is_group,
      inner_nodes: n.inner_nodes || [],
      inner_links: n.inner_links || [],
      config: n.config || {},
      mappings: n.mappings || {},
    },
    text: { x: n.position.x, y: n.position.y + 40, value: n.name || '' }
  }))
  const edges = (exportData.links || []).map(e => ({
    id: e.id,
    type: 'flow-edge',
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    properties: {
      linkType: e.linkType || 'serial',
      mappings: e.mappings || {},
    }
  }))
  return { nodes, edges }
}

export function getExecutionOrder(nodes, edges) {
  const nodeIds = new Set(nodes.map(n => n.id))
  const adj = new Map()
  const inDegree = new Map()
  nodeIds.forEach(id => { adj.set(id, []); inDegree.set(id, 0) })
  edges.forEach(e => {
    if (nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId)) {
      adj.get(e.sourceNodeId).push(e.targetNodeId)
      inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) || 0) + 1)
    }
  })
  const queue = []
  inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id) })
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const neighbor of (adj.get(id) || [])) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1)
      if (inDegree.get(neighbor) === 0) queue.push(neighbor)
    }
  }
  return order
}

export function offsetPosition(nodes, centerX, centerY) {
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 180
  return nodes.map((n, i) => ({
    ...n,
    position: {
      x: centerX + (i % cols) * spacing - (cols - 1) * spacing / 2,
      y: centerY + Math.floor(i / cols) * spacing - (Math.ceil(nodes.length / cols) - 1) * spacing / 2
    }
  }))
}

export function findCompositeForNode(composites, nodeId) {
  for (const comp of composites) {
    const inner = comp.properties.inner_nodes || []
    if (inner.some(n => n.id === nodeId)) return comp
  }
  return null
}
