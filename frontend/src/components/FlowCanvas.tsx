import React, { forwardRef, useImperativeHandle } from 'react'
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
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { setNodes, setEdges, setEdgeData, selectEdge, openEdgeConfigPanel } from '../store/flowSlice'
import { selectNode, openConfigPanel } from '../store/flowSlice'
import { getNodeMeta, getDefaultConfig } from '../utils/nodeRegistry'
import { generateId, convertFromExportFormat, convertToExportFormat } from '../utils/flowHelper'
import { Executor } from '../utils/executor'

const nodeTypes = {
  'atom-node': AtomNode,
  'composite-node': CompositeNode,
}

const edgeTypes = {
  'flow-edge': FlowEdge,
}

export interface FlowCanvasHandle {
  newFlow: () => void
  importFlow: (data: unknown) => void
  exportFlow: () => unknown
  restoreFromSave: (data: unknown) => void
  runSimulation: () => void
  getNodesAndEdges: () => { nodes: Node[]; edges: Edge[] }
  groupSelected: () => void
  ungroupSelected: () => void
  updateEdgeData: (edgeId: string, data: Record<string, unknown>) => void
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  undo: () => void
  redo: () => void
  deleteSelected: () => void
  deleteNodeById: (id: string) => void
  deleteEdgeById: (id: string) => void
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
  const rfInstanceRef = React.useRef<ReactFlowInstance | null>(null)

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
        const { nodes: importedNodes, edges: importedEdges } = convertFromExportFormat(data as Parameters<typeof convertFromExportFormat>[0])
        setLocalNodes(importedNodes)
        setLocalEdges(importedEdges)
        dispatch(selectNode(null))
        showToast('导入成功', 'success')
      } catch {
        alert('导入失败：流程数据格式不正确')
      }
    },
    exportFlow() {
      return convertToExportFormat(nodes, edges)
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
    async runSimulation() {
      if (nodes.length === 0) return
      setSimProgress(0)
      setLocalNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, _simulating: false } })))
      const flowData = convertToExportFormat(nodes, edges)
      const executor = new Executor(flowData.nodes, flowData.links)
      executor.setExternalInputs({})
      executor.onNodeProgress((nodeId, status) => {
        setLocalNodes(prev => prev.map(n => ({
          ...n,
          data: { ...n.data, _simulating: n.id === nodeId && status === 'running' },
        })))
      })
      executor.run().then(result => {
        setSimProgress(100)
        setLocalNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, _simulating: false } })))
        if (result.success) {
          showToast(`运行完成，${result.results.length} 个节点已执行`, 'success')
        } else {
          showToast(result.error || '运行中止', 'warn')
        }
      })
    },
    getNodesAndEdges() {
      return { nodes, edges }
    },
    groupSelected() {
      pushHistory()
      const selected = nodes.filter(n => n.selected)
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

      const innerEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target))
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

      setLocalEdges(edges
        .filter(e => !selectedIds.has(e.source) || !selectedIds.has(e.target))
        .map(e => {
          if (selectedIds.has(e.target) && !selectedIds.has(e.source)) return { ...e, target: compositeId }
          if (selectedIds.has(e.source) && !selectedIds.has(e.target)) return { ...e, source: compositeId }
          return e
        }),
      )
      setLocalNodes(nds => nds.filter(n => !selectedIds.has(n.id)).concat(newNode))
      showToast(`已组合 ${selected.length} 个节点`, 'success')
    },
    updateEdgeData(edgeId: string, data: Record<string, unknown>) {
      pushHistory()
      setLocalEdges(prev => prev.map(e =>
        e.id === edgeId ? { ...e, data: { ...e.data, ...data } } : e,
      ))
    },
    updateNodeData(nodeId: string, data: Record<string, unknown>) {
      pushHistory()
      setLocalNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ))
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
          is_group: false,
          inner_nodes: [],
          inner_links: [],
          config: n.config as Record<string, unknown>,
          mappings: (n.mappings as Record<string, string>) || {},
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

    const sourceMeta = getNodeMeta((sourceNode.data?.originType as string) || 'start')
    const targetMeta = getNodeMeta((targetNode.data?.originType as string) || 'start')

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

  const onEdgeClick = React.useCallback((_: React.MouseEvent, edge: Edge) => {
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

    const { type, name, category } = JSON.parse(typeStr)
    const meta = getNodeMeta(type)
    const position = rfInstanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const id = generateId('node')
    const newNode: Node = {
      id,
      type: 'atom-node',
      position,
      data: {
        originType: type,
        name: meta.name,
        category,
        label: name,
        is_group: false,
        config: getDefaultConfig(type),
        mappings: {},
        inner_nodes: [],
        inner_links: [],
      },
    }
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

      const meta = getNodeMeta(detail.nodeType)
      const id = generateId('node')
      const newNode: Node = {
        id,
        type: 'atom-node',
        position: { x: sourceNode.position.x, y: sourceNode.position.y + 140 },
        data: {
          originType: detail.nodeType,
          name: meta.name,
          category: meta.category,
          label: meta.name,
          is_group: false,
          config: getDefaultConfig(detail.nodeType),
          mappings: {},
          inner_nodes: [],
          inner_links: [],
        },
      }

      const targetFirstInput = meta.inputSchema[0]?.name || '__default'
      const newEdge: Edge = {
        id: generateId('edge'),
        source: detail.afterNodeId,
        sourceHandle: detail.sourcePort,
        target: id,
        targetHandle: targetFirstInput,
        type: 'flow-edge',
        data: { linkType: 'serial', mappings: {} },
      }

      pushHistory()
      setLocalNodes(nds => nds.concat(newNode))
      setLocalEdges(eds => eds.concat(newEdge))
    }
    window.addEventListener('flow:add-node', handler)
    return () => window.removeEventListener('flow:add-node', handler)
  }, [nodes, setLocalNodes, setLocalEdges, pushHistory])

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

export default forwardRef(FlowCanvasInner)
