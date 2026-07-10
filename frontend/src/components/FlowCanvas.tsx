import React, { forwardRef, useImperativeHandle, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import AtomNode from './AtomNode'
import CompositeNode from './CompositeNode'
import FlowEdge from './FlowEdge'
import NodePicker from './NodePicker'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { store } from '../store'
import { setNodes, setEdges, setEdgeData, selectEdge, openEdgeConfigPanel } from '../store/flowSlice'
import { selectNode, openConfigPanel } from '../store/flowSlice'
import { getNodeMeta, getCompatibleTargets, getDefaultConfig, getAllNodeTypes, filterUniqueTypes } from '../utils/nodeRegistry'
import { generateId, convertFromExportFormat, convertToExportFormat } from '../utils/flowHelper'
import { Executor } from '../utils/executor'
import { runLocalFlow, type PendingInteraction } from '../utils/localExecutor'
import { generatePythonCode } from '../utils/codeGenerator'
import { saveRunRecord } from './RunHistory'

const nodeTypes = {
  'atom-node': AtomNode,
  'composite-node': CompositeNode,
}

const edgeTypes = {
  'flow-edge': FlowEdge,
}

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

export interface FlowCanvasHandle {
  newFlow: () => void
  importFlow: (data: unknown) => void
  exportFlow: () => unknown
  restoreFromSave: (data: unknown) => void
  runSimulation: (autoResolveInput?: boolean) => void
  getNodesAndEdges: () => { nodes: Node[]; edges: Edge[] }
  exportCode: () => string
  groupSelected: () => void
  ungroupSelected: () => void
  updateEdgeData: (edgeId: string, data: Record<string, unknown>) => void
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  undo: () => void
  redo: () => void
  deleteSelected: () => void
  deleteNodeById: (id: string) => void
  deleteEdgeById: (id: string) => void
  showResults: (results: Array<{ nodeId: string; nodeName: string; output: Record<string, unknown> }>) => void
}

let rfInstance: ReactFlowInstance | null = null

export function getReactFlowInstance() {
  return rfInstance
}

function FlowCanvasInner(_: unknown, ref: React.Ref<FlowCanvasHandle>) {
  const dispatch = useAppDispatch()
  const [nodes, setLocalNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setLocalEdges, onEdgesChange] = useEdgesState([] as Edge[])
  const [, setSimProgress] = React.useState(0)
  const [toast, setToast] = React.useState<{ msg: string; type: string } | null>(null)
  const [simResults, setSimResults] = React.useState<{ nodeName: string; output: Record<string, unknown> }[] | null>(null)
  const rfInstanceRef = React.useRef<ReactFlowInstance | null>(null)
  const existingNodeTypes = useAppSelector(s => s.flow.nodes.map(n => n.data?.originType as string))
  const edgeInsertableTypes = React.useMemo(() => {
    return filterUniqueTypes(getAllNodeTypes().filter(type => {
      const meta = getNodeMeta(type)
      return meta.inputSchema.length > 0 && meta.outputSchema.length > 0
    }), existingNodeTypes)
  }, [existingNodeTypes])

  const [edgeInsert, setEdgeInsert] = React.useState<{
    visible: boolean; edge: Edge | null; clientX: number; clientY: number
  }>({ visible: false, edge: null, clientX: 0, clientY: 0 })

  const [pendingInteraction, setPendingInteraction] = React.useState<PendingInteraction | null>(null)
  const [interactionMinimized, setInteractionMinimized] = React.useState(false)

  const historyRef = React.useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const historyIdxRef = React.useRef(-1)
  const skipHistoryRef = React.useRef(false)

  const pushHistory = React.useCallback(() => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return }
    historyIdxRef.current++
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current)
    historyRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
    if (historyRef.current.length > 50) {
      historyRef.current.shift()
      historyIdxRef.current--
    }
  }, [nodes, edges])

  const showToast = React.useCallback((msg: string, type: string) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const nodesRef = React.useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = React.useRef(edges)
  edgesRef.current = edges

  useImperativeHandle(ref, () => ({
    newFlow() {
      pushHistory()
      setLocalNodes([])
      setLocalEdges([])
      dispatch(selectNode(null))
    },
    importFlow(data: unknown) {
      pushHistory()
      try {
        let { nodes: importedNodes, edges: importedEdges } = convertFromExportFormat(data as Parameters<typeof convertFromExportFormat>[0])
        // Auto-fill missing sourceHandle/targetHandle
        importedEdges = importedEdges.map(e => {
          const src = importedNodes.find(n => n.id === e.source)
          const tgt = importedNodes.find(n => n.id === e.target)
          if (!e.sourceHandle && src) {
            const srcMeta = getNodeMeta((src.data?.originType as string) || '')
            e = { ...e, sourceHandle: srcMeta.outputSchema[0]?.name }
          }
          if (!e.targetHandle && tgt) {
            const tgtMeta = getNodeMeta((tgt.data?.originType as string) || '')
            e = { ...e, targetHandle: tgtMeta.inputSchema[0]?.name }
          }
          return e
        })
        setLocalNodes(importedNodes)
        setLocalEdges(importedEdges)
        dispatch(selectNode(null))
        showToast('导入成功', 'success')
      } catch {
        alert('导入失败：流程数据格式不正确')
      }
    },
    exportFlow() {
      return convertToExportFormat(nodesRef.current, edgesRef.current)
    },
    restoreFromSave(data: unknown) {
      pushHistory()
      if (!data || !(data as Record<string, unknown>).nodes) {
        setLocalNodes([])
        setLocalEdges([])
        return
      }
      const { nodes: restoredNodes, edges: restoredEdges } = convertFromExportFormat(data as Parameters<typeof convertFromExportFormat>[0])
      setLocalNodes(restoredNodes)
      setLocalEdges(restoredEdges)
      showToast('已恢复', 'info')
    },
        async runSimulation(autoResolveInput?: boolean) {
      const curNodes = nodesRef.current
      const curEdges = edgesRef.current
      if (curNodes.length === 0) return
      setSimProgress(0)
      setPendingInteraction(null)
      setLocalNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, _simulating: false, _output: null, _status: null } })))
      const result = await runLocalFlow(curNodes, curEdges, {
        autoResolveInput,
        breakpoints: store.getState().flow.breakpoints,
        onProgress: (nodeId, status) => {
          setLocalNodes(prev => prev.map(n => ({
            ...n,
            data: { ...n.data, _simulating: n.id === nodeId && status === 'running' },
          })))
        },
        onPending: (interaction) => {
          setPendingInteraction(interaction)
        },
      })
      setSimProgress(100)
      setPendingInteraction(null)
      const results = result.results.map(r => ({ nodeId: r.nodeId, nodeName: r.nodeName, output: r.output || {} }))
      setSimResults(results.map(r => ({ nodeName: r.nodeName, output: r.output })))
      setLocalNodes(nds => nds.map(n => {
        const res = results.find(r => r.nodeId === n.id)
        return { ...n, data: { ...n.data, _simulating: false, _output: res?.output || null, _status: 'done' as const } }
      }))
      saveRunRecord({
        id: `run_${Date.now()}`,
        time: Date.now(),
        success: result.success,
        nodeCount: result.results.length,
        results: results.map(r => ({ nodeName: r.nodeName, output: r.output })),
        error: result.error,
      })
      if (result.success) {
        showToast(`运行完成，${result.results.length} 个节点已执行`, 'success')
      } else {
        showToast(result.error || '运行中止', 'warn')
      }
    },
    showResults(results) {
      setSimResults(results.map(r => ({ nodeName: r.nodeName, output: r.output })))
      setLocalNodes(nds => nds.map(n => {
        const res = results.find(r => r.nodeId === n.id)
        return { ...n, data: { ...n.data, _simulating: false, _output: res?.output || null, _status: 'done' as const } }
      }))
    },
    getNodesAndEdges() {
      return { nodes: nodesRef.current, edges: edgesRef.current }
    },
    exportCode() {
      const state = store.getState().flow
      return generatePythonCode(nodesRef.current, edgesRef.current, { globalPrompts: state.globalPrompts })
    },
    groupSelected() {
      pushHistory()
      const curNodes = nodesRef.current
      const curEdges = edgesRef.current
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
    },
    ungroupSelected() {
      pushHistory()
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
      const incoming = edges.filter(e => e.target === compositeId)
      const outgoing = edges.filter(e => e.source === compositeId)

      const firstId = restoredNodes[0].id
      const lastId = restoredNodes[restoredNodes.length - 1].id

      setLocalEdges(
        edges
          .filter(e => e.source !== compositeId && e.target !== compositeId)
          .concat(incoming.map(e => ({ ...e, target: firstId })))
          .concat(outgoing.map(e => ({ ...e, source: lastId })))
          .concat(restoredEdges),
      )
      setLocalNodes(nds => nds.filter(n => n.id !== compositeId).concat(restoredNodes))
      showToast(`已展开为 ${restoredNodes.length} 个节点`, 'success')
    },
    deleteSelected() {
      const selectedNodes = nodes.filter(n => n.selected)
      const selectedEdges = edges.filter(e => e.selected)
      if (selectedNodes.length === 0 && selectedEdges.length === 0) {
        showToast('请选中要删除的节点或连线', 'warn')
        return
      }
      pushHistory()
      const selectedNodeIds = new Set(selectedNodes.map(n => n.id))
      const selectedEdgeIds = new Set(selectedEdges.map(e => e.id))
      setLocalNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)))
      setLocalEdges(prev => prev.filter(e => !selectedEdgeIds.has(e.id)))
      dispatch(selectNode(null))
      showToast(`已删除 ${selectedNodes.length} 个节点、${selectedEdges.length} 条连线`, 'info')
    },
    deleteNodeById(id: string) {
      pushHistory()
      setLocalNodes(prev => prev.filter(n => n.id !== id))
      setLocalEdges(prev => prev.filter(e => e.source !== id && e.target !== id))
      dispatch(selectNode(null))
      showToast('已删除节点', 'info')
    },
    deleteEdgeById(id: string) {
      pushHistory()
      setLocalEdges(prev => prev.filter(e => e.id !== id))
      dispatch(selectNode(null))
      showToast('已删除连线', 'info')
    },
    undo() {
      if (historyIdxRef.current <= 0) { showToast('没有可撤销的操作', 'warn'); return }
      historyIdxRef.current--
      const entry = historyRef.current[historyIdxRef.current]
      skipHistoryRef.current = true
      setLocalNodes(entry.nodes)
      setLocalEdges(entry.edges)
      showToast('已撤销', 'info')
    },
    redo() {
      if (historyIdxRef.current >= historyRef.current.length - 1) { showToast('没有可重做的操作', 'warn'); return }
      historyIdxRef.current++
      const entry = historyRef.current[historyIdxRef.current]
      skipHistoryRef.current = true
      setLocalNodes(entry.nodes)
      setLocalEdges(entry.edges)
      showToast('已重做', 'info')
    },
    updateNodeData(nodeId: string, data: Record<string, unknown>) {
      pushHistory()
      setLocalNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ))
    },
  }), [nodes, edges, dispatch, setLocalNodes, setLocalEdges, showToast])

  const onInit = React.useCallback((instance: ReactFlowInstance) => {
    rfInstanceRef.current = instance
    rfInstance = instance
  }, [])

  const isValidConnection = React.useCallback((connection: Connection) => {
    if (connection.source === connection.target) return false
    const sourceNode = nodes.find(n => n.id === connection.source)
    const targetNode = nodes.find(n => n.id === connection.target)
    if (!sourceNode || !targetNode) return false

    const sourceMeta = getNodeMeta((sourceNode.data?.originType as string) || '')
    const targetMeta = getNodeMeta((targetNode.data?.originType as string) || '')

    const sourcePorts = sourceMeta.outputSchema
    const targetPorts = targetMeta.inputSchema

    if (sourcePorts.length === 0 || targetPorts.length === 0) return false

    const existingCount = edges.filter(e => e.target === connection.target).length
    const requiredCount = targetMeta.inputSchema.filter(p => p.required).length
    if (requiredCount > 0 && existingCount >= requiredCount) return false

    const sourceType = sourcePorts[0]?.type || 'any'
    const targetType = targetPorts[existingCount]?.type || 'any'

    if (sourceType === 'any' || targetType === 'any') return true

    return sourceType === targetType
  }, [nodes, edges])

  const onConnect = React.useCallback((connection: Connection) => {
    pushHistory()
    const edgeId = generateId('edge')
    setLocalEdges(eds => addEdge({
      ...connection,
      id: edgeId,
      type: 'flow-edge',
      data: { linkType: 'serial', mappings: {} },
    }, eds))
    dispatch(setEdgeData({ edgeId, data: { linkType: 'serial', mappings: {} } }))
  }, [setLocalEdges, dispatch, pushHistory])

  const onNodeClick = React.useCallback((_: React.MouseEvent, node: Node) => {
    dispatch(selectNode(node.id))
    setSelectedEdgeIdLocal(null)
  }, [dispatch])

  const handleEdgeInsert = React.useCallback((edge: Edge, nodeType: string) => {
    const sourceNode = nodes.find(n => n.id === edge.source)
    const targetNode = nodes.find(n => n.id === edge.target)
    if (!sourceNode || !targetNode) return

    const meta = getNodeMeta(nodeType)
    const newNode = createAtomNode(nodeType, {
      x: (sourceNode.position.x + targetNode.position.x) / 2,
      y: (sourceNode.position.y + targetNode.position.y) / 2,
    })
    const targetFirstInput = meta.inputSchema[0]?.name || '__default'
    const sourceFirstOutput = meta.outputSchema[0]?.name || '__default'

    pushHistory()
    setLocalEdges(eds => eds.filter(e => e.id !== edge.id).concat([
      createFlowEdge(edge.source, newNode.id, edge.sourceHandle, targetFirstInput),
      createFlowEdge(newNode.id, edge.target, sourceFirstOutput, edge.targetHandle),
    ]))
    setLocalNodes(nds => nds.concat(newNode))
    setEdgeInsert({ visible: false, edge: null, clientX: 0, clientY: 0 })
  }, [nodes, setLocalNodes, setLocalEdges, pushHistory])

  const onEdgeClick = React.useCallback((event: React.MouseEvent, edge: Edge) => {
    setEdgeInsert({ visible: true, edge, clientX: event.clientX, clientY: event.clientY })
    dispatch(selectEdge(edge.id))
    setSelectedEdgeIdLocal(edge.id)
  }, [dispatch])

  const onEdgeDoubleClick = React.useCallback((_: React.MouseEvent, edge: Edge) => {
    dispatch(selectEdge(edge.id))
    setSelectedEdgeIdLocal(edge.id)
    dispatch(openEdgeConfigPanel())
  }, [dispatch])

  const onNodeDoubleClick = React.useCallback((_: React.MouseEvent, node: Node) => {
    dispatch(selectNode(node.id))
    dispatch(openConfigPanel())
  }, [dispatch])

  const onPaneClick = React.useCallback(() => {
    dispatch(selectNode(null))
    setSelectedEdgeIdLocal(null)
  }, [dispatch])

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const typeStr = event.dataTransfer.getData('application/reactflow')
    if (!typeStr || !rfInstanceRef.current) return

    const { type } = JSON.parse(typeStr)
    const position = rfInstanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const newNode = createAtomNode(type, position)
    pushHistory()
    setLocalNodes(nds => nds.concat(newNode))
  }, [setLocalNodes, pushHistory])

  const reduxEdges = useAppSelector(s => s.flow.edges)
  const reduxSaveTimestamp = useAppSelector(s => s.flow.saveTimestamp)
  const [selectedEdgeId, setSelectedEdgeIdLocal] = React.useState<string | null>(null)

  React.useEffect(() => {
    dispatch(setNodes(nodes))
    dispatch(setEdges(edges))
  }, [edges, nodes, dispatch])

  React.useEffect(() => {
    if (reduxSaveTimestamp > 0) {
      const updatedEdge = reduxEdges.find(e => e.id === selectedEdgeId)
      if (updatedEdge && updatedEdge.data) {
        setLocalEdges(prev => prev.map(e =>
          e.id === updatedEdge.id ? { ...e, data: { ...e.data, ...updatedEdge.data } } : e,
        ))
      }
    }
  }, [reduxSaveTimestamp, reduxEdges, selectedEdgeId, setLocalEdges])

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { afterNodeId: string; sourcePort: string; nodeType: string }
      if (!detail || !rfInstanceRef.current) return
      const sourceNode = nodes.find(n => n.id === detail.afterNodeId)
      if (!sourceNode) return

      const existingFromNode = edges.filter(e => e.source === detail.afterNodeId).length
      const newNode = createAtomNode(detail.nodeType, {
        x: sourceNode.position.x + existingFromNode * 220 - existingFromNode * Math.min(existingFromNode, 3) * 10,
        y: sourceNode.position.y + 140 + existingFromNode * 20,
      })

      pushHistory()
      setLocalNodes(nds => nds.concat(newNode))
      const meta = getNodeMeta(detail.nodeType)
      if (meta.inputSchema.length > 0) {
        const targetFirstInput = meta.inputSchema[0]?.name || '__default'
        setLocalEdges(eds => eds.concat(createFlowEdge(detail.afterNodeId, newNode.id, detail.sourcePort, targetFirstInput)))
      }
    }
    window.addEventListener('flow:add-node', handler)
    return () => window.removeEventListener('flow:add-node', handler)
  }, [nodes, edges, setLocalNodes, setLocalEdges, pushHistory])

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { targetNodeId: string; targetPort: string; nodeType: string }
      if (!detail || !rfInstanceRef.current) return

      const targetNode = nodes.find(n => n.id === detail.targetNodeId)
      if (!targetNode) return

      const existingToNode = edges.filter(e => e.target === detail.targetNodeId).length
      const newNode = createAtomNode(detail.nodeType, {
        x: targetNode.position.x + existingToNode * 220 - existingToNode * Math.min(existingToNode, 3) * 10,
        y: targetNode.position.y - 140 + existingToNode * 20,
      })

      pushHistory()
      setLocalNodes(nds => nds.concat(newNode))
      const meta = getNodeMeta(detail.nodeType)
      if (meta.outputSchema.length > 0) {
        const sourceFirstOutput = meta.outputSchema[0]?.name || '__default'
        setLocalEdges(eds => eds.concat(createFlowEdge(newNode.id, detail.targetNodeId, sourceFirstOutput, detail.targetPort)))
      }
    }
    window.addEventListener('flow:add-parent', handler)
    return () => window.removeEventListener('flow:add-parent', handler)
  }, [nodes, edges, setLocalNodes, setLocalEdges, pushHistory])

  const [connectTarget, setConnectTarget] = React.useState<{
    nodeId: string; port: string; clientX: number; clientY: number
  } | null>(null)

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { targetNodeId: string; targetPort: string }
      if (!detail) return
      setConnectTarget({ nodeId: detail.targetNodeId, port: detail.targetPort, clientX: 0, clientY: 0 })
    }
    window.addEventListener('flow:connect-to-input', handler)
    return () => window.removeEventListener('flow:connect-to-input', handler)
  }, [])

  const compatibleExistingNodes = React.useMemo(() => {
    if (!connectTarget) return []
    const targetNode = nodes.find(n => n.id === connectTarget.nodeId)
    if (!targetNode) return []
    const targetOriginType = targetNode.data?.originType as string
    return nodes.filter(n => {
      if (n.id === connectTarget.nodeId) return false
      const sourceOriginType = n.data?.originType as string
      if (!sourceOriginType) return false

      if (getCompatibleTargets(sourceOriginType).includes(targetOriginType)) return true

      const sourceMeta = getNodeMeta(sourceOriginType)
      const targetMeta = getNodeMeta(targetOriginType)
      if (!sourceMeta || !targetMeta) return false
      if (sourceMeta.outputSchema.length === 0 || targetMeta.inputSchema.length === 0) return false
      const srcTypes = sourceMeta.outputSchema.map(p => p.type)
      const tgtTypes = targetMeta.inputSchema.map(p => p.type)
      return srcTypes.some(st => st === 'any' || tgtTypes.some(tt => tt === 'any' || tt === st))
    })
  }, [connectTarget, nodes])

  const handleConnectExistingSelect = React.useCallback((sourceNodeId: string) => {
    if (!connectTarget) return
    const sourceNode = nodes.find(n => n.id === sourceNodeId)
    if (!sourceNode) return
    const sourceOriginType = sourceNode.data?.originType as string
    const sourceMeta = getNodeMeta(sourceOriginType)
    const sourceFirstOutput = sourceMeta.outputSchema[0]?.name || '__default'
    const newEdge: Edge = {
      id: generateId('edge'),
      source: sourceNodeId,
      sourceHandle: sourceFirstOutput,
      target: connectTarget.nodeId,
      targetHandle: connectTarget.port,
      type: 'flow-edge',
      data: { linkType: 'serial', mappings: {} },
    }
    pushHistory()
    setLocalEdges(eds => eds.concat(newEdge))
    setConnectTarget(null)
  }, [connectTarget, nodes, setLocalEdges, pushHistory])

  const connectTargetNode = connectTarget ? nodes.find(n => n.id === connectTarget.nodeId) : null
  const [connectPickerRect, setConnectPickerRect] = React.useState<{ left: number; top: number } | null>(null)
  React.useEffect(() => {
    if (!connectTarget || !connectTargetNode || !rfInstanceRef.current) {
      setConnectPickerRect(null)
      return
    }
    const vp = rfInstanceRef.current.getViewport()
    const screenX = connectTargetNode.position.x * vp.zoom + vp.x
    const screenY = connectTargetNode.position.y * vp.zoom + vp.y
    setConnectPickerRect({ left: screenX + 80, top: screenY })
  }, [connectTarget, connectTargetNode])

  const clipboardRef = React.useRef<Node[]>([])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if focus is in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const selected = nodes.filter(n => n.selected)

      // Ctrl+C: copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selected.length === 0) return
        clipboardRef.current = JSON.parse(JSON.stringify(selected))
        return
      }

      // Ctrl+V: paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        if (clipboardRef.current.length === 0) return
        const maxX = Math.max(...nodes.map(n => n.position.x)) + 200
        const clones = clipboardRef.current.map(n => ({
          ...JSON.parse(JSON.stringify(n)),
          id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          position: { x: n.position.x + maxX * 0.1 + 30, y: n.position.y + 30 },
          selected: false,
        }))
        pushHistory()
        setLocalNodes(nds => [...nds, ...clones])
        return
      }

      if (selected.length === 0) return

      // Ctrl+D: duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        const maxX = Math.max(...nodes.map(n => n.position.x)) + 200
        const clones = selected.map(n => ({
          ...JSON.parse(JSON.stringify(n)),
          id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          position: { x: n.position.x + maxX * 0.1 + 30, y: n.position.y + 30 },
          selected: false,
        }))
        pushHistory()
        setLocalNodes(nds => [...nds, ...clones])
        return
      }

      // Arrow keys: nudge
      const step = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowUp') { e.preventDefault(); setLocalNodes(nds => nds.map(n => n.selected ? { ...n, position: { x: n.position.x, y: n.position.y - step } } : n)) }
      if (e.key === 'ArrowDown') { e.preventDefault(); setLocalNodes(nds => nds.map(n => n.selected ? { ...n, position: { x: n.position.x, y: n.position.y + step } } : n)) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setLocalNodes(nds => nds.map(n => n.selected ? { ...n, position: { x: n.position.x - step, y: n.position.y } } : n)) }
      if (e.key === 'ArrowRight') { e.preventDefault(); setLocalNodes(nds => nds.map(n => n.selected ? { ...n, position: { x: n.position.x + step, y: n.position.y } } : n)) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nodes, setLocalNodes, pushHistory])

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#fcfcfb' }}>
      {toast && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          padding: '6px 16px', borderRadius: 8, fontSize: 13,
          background: toast.type === 'warn' ? '#fff7e6' : toast.type === 'error' ? '#fff2f0' : '#f0f5ff',
          color: toast.type === 'warn' ? '#d46b08' : toast.type === 'error' ? '#ff4d4f' : '#1d39c4',
          border: `1px solid ${toast.type === 'warn' ? '#ffd591' : toast.type === 'error' ? '#ffccc7' : '#adc6ff'}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}
      {simResults && (
        <div style={{
          position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          padding: 16, minWidth: 360, maxWidth: 500,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>模拟运行结果</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 14 }}
              onClick={() => setSimResults(null)}>✕</button>
          </div>
          {simResults.map((r, i) => (
            <div key={i} style={{ marginBottom: 8, padding: 8, background: '#f8f8f6', borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>{r.nodeName}</div>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#333' }}>
                {JSON.stringify(r.output, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
      {nodes.length === 0 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          color: '#bfbeba', pointerEvents: 'none', zIndex: 5,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.5 }}>
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <div style={{ fontSize: 14, fontWeight: 500 }}>空画布</div>
          <div style={{ fontSize: 12 }}>从左侧面板拖拽节点到此处开始搭建流程</div>
        </div>
      )}
      {edgeInsert.visible && edgeInsert.edge && createPortal(
        <NodePicker
          compatibleTypes={edgeInsertableTypes}
          anchorRect={{ left: edgeInsert.clientX, top: edgeInsert.clientY, right: edgeInsert.clientX, bottom: edgeInsert.clientY, width: 0, height: 0, x: edgeInsert.clientX, y: edgeInsert.clientY } as DOMRect}
          onSelect={(nodeType) => edgeInsert.edge && handleEdgeInsert(edgeInsert.edge, nodeType)}
          onClose={() => setEdgeInsert({ visible: false, edge: null, clientX: 0, clientY: 0 })}
        />,
        document.body
      )}
      {pendingInteraction && !interactionMinimized && (
        <InteractionPanel
          interaction={pendingInteraction}
          onResolve={() => setPendingInteraction(null)}
          onMinimize={() => setInteractionMinimized(true)}
        />
      )}
      {pendingInteraction && interactionMinimized && (
        <div onClick={() => setInteractionMinimized(false)}
          style={{
            position: 'absolute', right: 8, bottom: 8, zIndex: 50,
            background: '#fff', borderRadius: 8, padding: '6px 12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer', fontSize: 12, color: '#666',
            border: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: pendingInteraction.type === 'approval' ? '#faad14' : '#1890ff',
            display: 'inline-block',
          }} />
          {pendingInteraction.type === 'approval' ? '待审批' : '待输入'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
      )}
      {connectTarget && compatibleExistingNodes.length > 0 && connectPickerRect && createPortal(
        <div style={{
          position: 'fixed', left: connectPickerRect.left, top: connectPickerRect.top, zIndex: 9999,
          background: '#fff', borderRadius: 8, padding: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', border: '1px solid #e8e8e8',
          minWidth: 180, maxHeight: 240, overflowY: 'auto',
        }}>
          <div style={{ padding: '4px 8px', fontSize: 11, color: '#9b9a97', fontWeight: 600, borderBottom: '1px solid #f0f0ee', marginBottom: 2 }}>选择已有节点连接</div>
          {compatibleExistingNodes.map(n => (
            <div key={n.id}
              onClick={() => handleConnectExistingSelect(n.id)}
              style={{
                padding: '6px 8px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, color: '#333',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#52c41a', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{n.data?.label as string || n.id}</span>
              <span style={{ fontSize: 10, color: '#b0b0ae', fontFamily: 'monospace' }}>{n.data?.originType as string}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
      {connectTarget && compatibleExistingNodes.length === 0 && createPortal(
        <div style={{
          position: 'fixed', left: connectPickerRect?.left || 100, top: connectPickerRect?.top || 100, zIndex: 9999,
          background: '#fff', borderRadius: 8, padding: '12px 16px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', border: '1px solid #e8e8e8',
          fontSize: 12, color: '#9b9a97',
        }}>
          没有可连接的已有节点
          <div style={{ marginTop: 8, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button className="notion-btn" onClick={() => setConnectTarget(null)} style={{ fontSize: 11 }}>关闭</button>
          </div>
        </div>,
        document.body
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onInit={onInit}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        snapToGrid
        snapGrid={[10, 10]}
      >
        <Background color="#e9e9e7" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeColor="#37352f"
          nodeColor="#fff"
          nodeBorderRadius={4}
          style={{ border: '1px solid #e9e9e7' }}
        />
      </ReactFlow>
    </div>
  )
}

function InteractionPanel({ interaction, onResolve, onMinimize }: { interaction: PendingInteraction; onResolve: () => void; onMinimize: () => void }) {
  const [reason, setReason] = React.useState('')
  const [inputValue, setInputValue] = React.useState('')

  const handleApprove = () => {
    interaction.resolve({ action: 'approved', reason, modifiedData: interaction.inputData })
    onResolve()
  }
  const handleReject = () => {
    interaction.resolve({ action: 'rejected', reason: reason || '用户拒绝' })
    onResolve()
  }
  const handleInputSubmit = () => {
    interaction.resolve({ value: inputValue })
    onResolve()
  }
  const handleBreakpointResume = () => {
    interaction.resolve(null)
    onResolve()
  }

  return (
    <div className="interaction-panel" style={{
      position: 'absolute', right: 8, top: 8, bottom: 8, width: 300, zIndex: 50,
      background: '#fff', borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      animation: 'slideInRight 0.2s ease-out',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderBottom: '1px solid #f0f0ee',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: interaction.type === 'approval' ? '#faad14' : interaction.type === 'breakpoint' ? '#722ed1' : '#1890ff',
            display: 'inline-block',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#37352f' }}>
            {interaction.type === 'approval' ? '人工审批' : interaction.type === 'breakpoint' ? '断点暂停' : '用户输入'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onMinimize}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9b9a97', display: 'flex' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      <div style={{ padding: '8px 12px', fontSize: 11, color: '#9b9a97', borderBottom: '1px solid #f0f0ee' }}>
        {interaction.nodeName}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {interaction.type === 'breakpoint' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 40 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#722ed1" stroke="none"><circle cx="12" cy="12" r="10"/><rect x="9" y="6" width="2" height="12" rx="1" fill="#fff"/><rect x="13" y="6" width="2" height="12" rx="1" fill="#fff"/></svg>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#37352f' }}>已暂停于断点</div>
            <div style={{ fontSize: 11, color: '#9b9a97' }}>点击继续执行下一个节点</div>
            <button className="notion-btn primary" onClick={handleBreakpointResume} style={{ marginTop: 8, fontSize: 13, padding: '6px 24px' }}>
              继续执行
            </button>
          </div>
        ) : interaction.type === 'approval' ? (
          <>
            {interaction.config.message && (
              <div style={{ fontSize: 12, color: '#333', marginBottom: 10, padding: 8, background: '#f5f5f5', borderRadius: 6, lineHeight: 1.5 }}>
                {interaction.config.message as string}
              </div>
            )}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>待审数据</div>
            <pre style={{
              fontSize: 11, background: '#fafafa', padding: 8, borderRadius: 6,
              maxHeight: 200, overflow: 'auto', marginBottom: 10, whiteSpace: 'pre-wrap',
              border: '1px solid #eee',
            }}>
              {JSON.stringify(interaction.inputData, null, 2)}
            </pre>
            <textarea
              className="notion-input"
              placeholder="拒绝原因（可选）"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              style={{ width: '100%', marginBottom: 10, resize: 'vertical', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="notion-btn" onClick={handleReject}
                style={{ borderColor: '#ff4d4f', color: '#ff4d4f', fontSize: 12 }}>
                拒绝
              </button>
              <button className="notion-btn" onClick={handleApprove}
                style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff', fontSize: 12 }}>
                同意
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4 }}>请输入值</div>
            <textarea
              className="notion-input"
              placeholder={(interaction.config.default_value as string) || '输入...'}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              rows={4}
              style={{ width: '100%', marginBottom: 10, resize: 'vertical', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="notion-btn" onClick={handleInputSubmit}
                style={{ background: '#1890ff', borderColor: '#1890ff', color: '#fff', fontSize: 12 }}>
                提交
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default forwardRef(FlowCanvasInner)
