import { useCallback, useRef, useEffect } from 'react'
import type { Node, Edge } from 'reactflow'
import { getNodeMeta, getDefaultConfig, getCompatibleTargets } from '../utils/nodeRegistry'
import { isValidFlowConnection, normalizeConnectionHandles } from '../utils/connectionRules'
import { generateId } from '../utils/flowHelper'

function createAtomNode(nodeType: string, position: { x: number; y: number }): Node {
  const meta = getNodeMeta(nodeType)
  return {
    id: generateId('node'),
    type: 'atom-node',
    position,
    data: {
      originType: nodeType,
      name: meta.name,
      category: meta.category,
      label: meta.name,
      config: getDefaultConfig(nodeType),
    },
  }
}

function createFlowEdge(source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge {
  return {
    id: generateId('edge'),
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'flow-edge',
    data: { linkType: 'serial', mappings: {} },
  }
}

export function useNodeOperations(
  nodes: Node[],
  edges: Edge[],
  setLocalNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setLocalEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  pushHistory: () => void,
  showToast: (msg: string, type: string) => void,
) {
  const clipboardRef = useRef<Node[]>([])

  const groupSelected = useCallback(() => {
    const curNodes = nodes
    const curEdges = edges
    const selected = curNodes.filter(n => n.selected)
    if (selected.length < 2) {
      showToast('请选中至少 2 个节点', 'warn')
      return
    }
    if (selected.some(n => n.type === 'composite-node')) {
      showToast('不能组合已有组合节点', 'warn')
      return
    }

    const positions = selected.map(n => n.position)
    const minX = Math.min(...positions.map(p => p.x))
    const maxX = Math.max(...positions.map(p => p.x))
    const minY = Math.min(...positions.map(p => p.y))
    const maxY = Math.max(...positions.map(p => p.y))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    const selectedIds = new Set(selected.map(n => n.id))

    const innerNodes = selected.map(n => ({
      id: n.id,
      originType: n.data.originType as string,
      name: n.data.name as string,
      category: n.data.category as string,
      label: n.data.label as string,
      config: n.data.config as Record<string, unknown>,
      mappings: (n.data.mappings as Record<string, string>) || {},
      relativeX: n.position.x - cx,
      relativeY: n.position.y - cy,
    }))

    const innerEdges = curEdges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target))
    const innerLinks = innerEdges.map(e => ({
      sourceNodeId: e.source,
      targetNodeId: e.target,
      linkType: (e.data?.linkType as string) || 'serial',
      mappings: (e.data?.mappings as Record<string, string>) || {},
    }))

    const compositeId = generateId('composite')
    const newNode: Node = {
      id: compositeId,
      type: 'composite-node',
      position: { x: cx, y: cy },
      data: {
        originType: 'composite',
        name: '组合原子',
        category: '组合',
        label: `${selected.length} 个节点`,
        is_group: true,
        inner_nodes: innerNodes,
        inner_links: innerLinks,
        config: {},
        mappings: {},
      },
    }

    setLocalEdges(curEdges
      .filter(e => !selectedIds.has(e.source) || !selectedIds.has(e.target))
      .map(e => {
        if (selectedIds.has(e.target) && !selectedIds.has(e.source)) return { ...e, target: compositeId }
        if (selectedIds.has(e.source) && !selectedIds.has(e.target)) return { ...e, source: compositeId }
        return e
      }),
    )
    setLocalNodes(nds => [...nds.filter(n => !selectedIds.has(n.id)), newNode])
  }, [nodes, edges, setLocalNodes, setLocalEdges, showToast])

  const ungroupSelected = useCallback(() => {
    const composite = nodes.find(n => n.selected && n.type === 'composite-node')
    if (!composite) {
      showToast('请选中一个组合节点', 'warn')
      return
    }
    const innerNodes = (composite.data?.inner_nodes as unknown[]) || []
    const innerLinks = (composite.data?.inner_links as unknown[]) || []
    if (innerNodes.length === 0) {
      showToast('该组合为空', 'warn')
      return
    }

    const { x: cx, y: cy } = composite.position
    const restoredNodes: Node[] = (innerNodes as Array<Record<string, unknown>>).map(n => ({
      id: n.id as string,
      type: 'atom-node',
      position: { x: cx + (n.relativeX as number), y: cy + (n.relativeY as number) },
      data: {
        originType: n.originType as string,
        name: n.name as string,
        category: n.category as string,
        label: n.label as string,
        config: n.config as Record<string, unknown>,
      },
    }))

    const restoredEdges: Edge[] = (innerLinks as Array<Record<string, unknown>>).map(l => ({
      id: generateId('edge'),
      source: l.sourceNodeId as string,
      target: l.targetNodeId as string,
      type: 'default',
      data: { linkType: l.linkType || 'serial', mappings: l.mappings || {} },
    }))

    const compositeId = composite.id

    setLocalEdges(
      edges
        .filter(e => e.source !== compositeId && e.target !== compositeId)
        .concat(restoredEdges),
    )
    setLocalNodes(nds => nds.filter(n => n.id !== compositeId).concat(restoredNodes))
    showToast(`已展开为 ${restoredNodes.length} 个节点`, 'success')
  }, [nodes, edges, setLocalNodes, setLocalEdges, showToast])

  const deleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected)
    const selectedEdges = edges.filter(e => e.selected)
    if (selectedNodes.length === 0 && selectedEdges.length === 0) {
      showToast('请选中要删除的节点或连线', 'warn')
      return
    }
    const selectedNodeIds = new Set(selectedNodes.map(n => n.id))
    const selectedEdgeIds = new Set(selectedEdges.map(e => e.id))
    setLocalNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)))
    setLocalEdges(prev => prev.filter(e => !selectedEdgeIds.has(e.id)))
  }, [nodes, edges, setLocalNodes, setLocalEdges, showToast])

  const handleAddNode = useCallback((afterNodeId: string, sourcePort: string, nodeType: string) => {
    const sourceNode = nodes.find(n => n.id === afterNodeId)
    if (!sourceNode) return
    const sourceType = String(sourceNode.data?.originType || '')
    if (!getCompatibleTargets(sourceType).includes(nodeType)) return

    const existingFromNode = edges.filter(e => e.source === afterNodeId).length
    const newNode = createAtomNode(nodeType, {
      x: sourceNode.position.x + existingFromNode * 220 - existingFromNode * Math.min(existingFromNode, 3) * 10,
      y: sourceNode.position.y + 140 + existingFromNode * 20,
    })

    setLocalNodes(nds => nds.concat(newNode))
    const meta = getNodeMeta(nodeType)
    if (meta.inputSchema.length > 0) {
      const targetFirstInput = meta.inputSchema[0]?.name || '__default'
      setLocalEdges(eds => eds.concat(createFlowEdge(afterNodeId, newNode.id, sourcePort, targetFirstInput)))
    }
  }, [nodes, edges, setLocalNodes, setLocalEdges])

  const handleAddParent = useCallback((targetNodeId: string, targetPort: string, nodeType: string) => {
    const targetNode = nodes.find(n => n.id === targetNodeId)
    if (!targetNode) return
    const targetType = String(targetNode.data?.originType || '')
    if (!getCompatibleTargets(nodeType).includes(targetType)) return

    const existingToNode = edges.filter(e => e.target === targetNodeId).length
    const newNode = createAtomNode(nodeType, {
      x: targetNode.position.x + existingToNode * 220 - existingToNode * Math.min(existingToNode, 3) * 10,
      y: targetNode.position.y - 140 + existingToNode * 20,
    })

    setLocalNodes(nds => nds.concat(newNode))
    const meta = getNodeMeta(nodeType)
    if (meta.outputSchema.length > 0) {
      const sourceFirstOutput = meta.outputSchema[0]?.name || '__default'
      setLocalEdges(eds => eds.concat(createFlowEdge(newNode.id, targetNodeId, sourceFirstOutput, targetPort)))
    }
  }, [nodes, edges, setLocalNodes, setLocalEdges])

  const handleEdgeInsert = useCallback((edge: Edge, nodeType: string) => {
    const sourceNode = nodes.find(n => n.id === edge.source)
    const targetNode = nodes.find(n => n.id === edge.target)
    if (!sourceNode || !targetNode) return

    const sourceType = String(sourceNode.data?.originType || '')
    const targetType = String(targetNode.data?.originType || '')
    // 插入节点必须能接上游、且能通向下游
    if (!getCompatibleTargets(sourceType).includes(nodeType)) return
    if (!getCompatibleTargets(nodeType).includes(targetType)) return

    const meta = getNodeMeta(nodeType)
    const newNode = createAtomNode(nodeType, {
      x: (sourceNode.position.x + targetNode.position.x) / 2,
      y: (sourceNode.position.y + targetNode.position.y) / 2,
    })
    const targetFirstInput = meta.inputSchema[0]?.name || '__default'
    const sourceFirstOutput = meta.outputSchema[0]?.name || '__default'

    setLocalEdges(eds => eds.filter(e => e.id !== edge.id).concat([
      createFlowEdge(edge.source, newNode.id, edge.sourceHandle, targetFirstInput),
      createFlowEdge(newNode.id, edge.target, sourceFirstOutput, edge.targetHandle),
    ]))
    setLocalNodes(nds => nds.concat(newNode))
  }, [nodes, setLocalNodes, setLocalEdges])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { afterNodeId: string; sourcePort: string; nodeType: string }
      if (!detail) return
      pushHistory()
      handleAddNode(detail.afterNodeId, detail.sourcePort, detail.nodeType)
    }
    window.addEventListener('flow:add-node', handler)
    return () => window.removeEventListener('flow:add-node', handler)
  }, [handleAddNode, pushHistory])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { targetNodeId: string; targetPort: string; nodeType: string }
      if (!detail) return
      pushHistory()
      handleAddParent(detail.targetNodeId, detail.targetPort, detail.nodeType)
    }
    window.addEventListener('flow:add-parent', handler)
    return () => window.removeEventListener('flow:add-parent', handler)
  }, [handleAddParent, pushHistory])

  const handleDuplicate = useCallback((item: Node, offset: number) => {
    return {
      ...JSON.parse(JSON.stringify(item)),
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      position: { x: item.position.x + offset * 0.1 + 30, y: item.position.y + 30 },
      selected: false,
    } as Node
  }, [])

  const handleCopy = useCallback(() => {
    const selected = nodes.filter(n => n.selected)
    if (selected.length === 0) return
    clipboardRef.current = JSON.parse(JSON.stringify(selected))
  }, [nodes])

  const handlePaste = useCallback(() => {
    if (clipboardRef.current.length === 0) return
    const maxX = Math.max(...nodes.map(n => n.position.x)) + 200
    const clones = clipboardRef.current.map(n => handleDuplicate(n, maxX))
    setLocalNodes(nds => [...nds, ...clones])
  }, [nodes, setLocalNodes, handleDuplicate])

  const handleDuplicateSelected = useCallback(() => {
    const selected = nodes.filter(n => n.selected)
    if (selected.length === 0) return
    const maxX = Math.max(...nodes.map(n => n.position.x)) + 200
    const clones = selected.map(n => handleDuplicate(n, maxX))
    setLocalNodes(nds => [...nds, ...clones])
  }, [nodes, setLocalNodes, handleDuplicate])

  const handleNudge = useCallback((key: string, shiftKey: boolean) => {
    const step = shiftKey ? 10 : 1
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
    if (dx === 0 && dy === 0) return
    setLocalNodes(nds => nds.map(n =>
      n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n,
    ))
  }, [setLocalNodes])

  const handleConnectExisting = useCallback((sourceNodeId: string, targetNodeId: string, targetPort: string) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId)
    if (!sourceNode) return
    const sourceMeta = getNodeMeta(String(sourceNode.data?.originType || ''))
    const sourceFirstOutput = sourceMeta.outputSchema[0]?.name || '__default'
    const connection = normalizeConnectionHandles({
      source: sourceNodeId,
      sourceHandle: sourceFirstOutput,
      target: targetNodeId,
      targetHandle: targetPort,
    }, { nodes, edges })
    if (!isValidFlowConnection(connection, { nodes, edges })) return
    const newEdge: Edge = {
      id: generateId('edge'),
      source: connection.source!,
      sourceHandle: connection.sourceHandle,
      target: connection.target!,
      targetHandle: connection.targetHandle,
      type: 'flow-edge',
      data: { linkType: 'serial', mappings: {} },
    }
    setLocalEdges(eds => eds.concat(newEdge))
  }, [nodes, edges, setLocalEdges])

  return {
    groupSelected,
    ungroupSelected,
    deleteSelected,
    handleAddNode,
    handleAddParent,
    handleEdgeInsert,
    handleCopy,
    handlePaste,
    handleDuplicateSelected,
    handleNudge,
    handleConnectExisting,
    clipboardRef,
  }
}
