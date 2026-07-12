import { useState, useCallback, useRef, useEffect } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { getNodeMeta } from '../utils/nodeRegistry'

const NODE_WIDTH = 140
const NODE_HEIGHT = 60

interface Props {
  visible: boolean
  innerNodes: Record<string, unknown>[]
  innerLinks: Record<string, unknown>[]
  onSave: (nodes: Record<string, unknown>[], links: Record<string, unknown>[]) => void
  onClose: () => void
}

let _idCounter = 0
function genId() { return `sub_${Date.now()}_${++_idCounter}` }

export default function SubFlowEditor({ visible, innerNodes, innerLinks, onSave, onClose }: Props) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])
  const [selectedType, setSelectedType] = useState('llm')

  useEffect(() => {
    if (!visible) return
    const nodes: Node[] = (innerNodes || []).map((n, i) => ({
      id: n.id as string,
      type: 'default',
      position: {
        x: ((n.relativeX as number) || i * 180),
        y: ((n.relativeY as number) || 40),
      },
      data: {
        label: `${(n.originType as string) || ''}: ${(n.name as string) || (n.label as string) || (n.originType as string) || 'node'}`,
        originType: n.originType,
        config: n.config || {},
        mappings: n.mappings || {},
      },
    }))
    const edges: Edge[] = (innerLinks || []).map((e, i) => ({
      id: `e_${i}`,
      source: e.sourceNodeId as string,
      target: e.targetNodeId as string,
      type: 'default',
      style: { stroke: '#999' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#999' },
    }))
    setRfNodes(nodes)
    setRfEdges(edges)
  }, [visible, innerNodes, innerLinks, setRfNodes, setRfEdges])

  const onConnect = useCallback((conn: Connection) => {
    setRfEdges(eds => addEdge({
      ...conn,
      type: 'default',
      style: { stroke: '#999' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#999' },
    }, eds))
  }, [setRfEdges])

  const handleAddNode = useCallback(() => {
    const id = genId()
    const meta = getNodeMeta(selectedType)
    const newNode: Node = {
      id,
      type: 'default',
      position: { x: 20 + rfNodes.length * 30, y: 40 + rfNodes.length * 40 },
      data: {
        label: `${meta.name}: ${meta.desc || selectedType}`,
        originType: selectedType,
        config: {},
        mappings: {},
      },
    }
    setRfNodes(nds => [...nds, newNode])
  }, [selectedType, rfNodes.length, setRfNodes])

  const handleRemoveSelected = useCallback(() => {
    setRfNodes(nds => nds.filter(n => !n.selected))
    setRfEdges(eds => eds.filter(e => !e.selected))
  }, [setRfNodes, setRfEdges])

  const handleSave = useCallback(() => {
    const cx = rfNodes.reduce((s, n) => s + n.position.x, 0) / (rfNodes.length || 1)
    const cy = rfNodes.reduce((s, n) => s + n.position.y, 0) / (rfNodes.length || 1)
    const savedNodes = rfNodes.map(n => ({
      id: n.id,
      originType: n.data.originType || '',
      name: (n.data.label as string) || '',
      config: (n.data.config as Record<string, unknown>) || {},
      mappings: (n.data.mappings as Record<string, string>) || {},
      relativeX: n.position.x - cx,
      relativeY: n.position.y - cy,
    }))
    const savedLinks = rfEdges.map(e => ({
      sourceNodeId: e.source,
      targetNodeId: e.target,
      linkType: 'serial',
      mappings: {},
    }))
    onSave(savedNodes, savedLinks)
  }, [rfNodes, rfEdges, onSave])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: '80vw', height: '80vh', background: '#fff', borderRadius: 12,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select className="notion-select" style={{ fontSize: 12, height: 28 }}
              value={selectedType} onChange={e => setSelectedType(e.target.value)}
            >
              {['llm', 'code', 'http', 'json-parse', 'search', 'tool-call', 'variable-set', 'variable-get', 'transform', 'text-process', 'memory-read', 'memory-write', 'condition', 'switch', 'prompt-assembly'].map(t => (
                <option key={t} value={t}>{getNodeMeta(t).name} ({t})</option>
              ))}
            </select>
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={handleAddNode}>+ 添加节点</button>
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={handleRemoveSelected}>删除选中</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={onClose}>取消</button>
            <button className="notion-btn primary" style={{ fontSize: 12 }} onClick={handleSave}>保存</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            deleteKeyCode="Delete"
            multiSelectionKeyCode="Shift"
          >
            <Background color="#f0f0f0" gap={20} />
            <Controls showInteractive={false} />
            <MiniMap style={{ width: 120, height: 80 }} nodeColor="#ddd" />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
