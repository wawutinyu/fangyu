import { useCallback, useRef, useEffect, useState } from 'react'
import ReactFlow, {
  Background, Controls,
  useNodesState, useEdgesState,
  addEdge, type Connection, type Node,
  ConnectionMode,
} from 'reactflow'
import 'reactflow/dist/style.css'
import AgentNode from './AgentNode'
import ExternalAgentNode from './ExternalAgentNode'
import RouterNode from './RouterNode'
import GroupNode from './GroupNode'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import { addAgentNode, addAgentEdge, selectAgentNode, selectAgentEdge, moveAgentNode, removeAgentNode, removeAgentEdge, updateAgentEdge, loadAgents, clearAgents } from '../store/agentSlice'
import type { AgentCanvasNode } from '../store/agentSlice'
import type { AgentCard, TrustConfig } from '../utils/a2aProtocol'
import { buildAgentSocietyDemo } from '../utils/demoAgents'
import { downloadAgentBundle, type BundleRunbook } from '../utils/exportAgentBundle'

const nodeTypes = { 'a2a-agent': AgentNode, 'a2a-external': ExternalAgentNode, 'a2a-router': RouterNode, 'a2a-group': GroupNode }

const defaultAgentCard: AgentCard = {
  name: '新智能体', version: '1.0.0',
  capabilities: { streaming: false, pushNotifications: false },
  skills: [], defaultInterface: { type: 'in-memory' },
}

const defaultTrust: TrustConfig = {
  enabled: true, algorithm: 'Ed25519', anchorSource: 'auto',
  policies: [], revocationList: [], auditEnabled: true, auditPath: './audit.log',
}

let _agentIdCounter = 0
function genAgentId() { return `agent_${++_agentIdCounter}` }

let _routerIdCounter = 0
function genRouterId() { return `router_${++_routerIdCounter}` }
let _groupIdCounter = 0
function genGroupId() { return `group_${++_groupIdCounter}` }

let _externalIdCounter = 0
function genExternalId() { return `ext_${++_externalIdCounter}` }

export default function AgentCanvas() {
  const dispatch = useAppDispatch()
  const storeNodes = useAppSelector(s => s.agent.nodes)
  const storeEdges = useAppSelector(s => s.agent.edges)
  const [runbook, setRunbook] = useState<BundleRunbook | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes.map(n => ({
    id: n.id,
    type: n.type || 'a2a-agent',
    position: n.position,
    data: n,
  })))
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges.map(e => ({
    id: e.id, source: e.source, target: e.target,
    type: 'smoothstep', animated: true,
    style: { stroke: '#722ed1', strokeDasharray: '6 3' },
    label: e.label || 'subscribe',
  })))

  const prevStore = useRef('')
  const storeKey = JSON.stringify({ nodes: storeNodes, edges: storeEdges })
  useEffect(() => {
    if (storeKey === prevStore.current) return
    prevStore.current = storeKey
    setNodes(storeNodes.map(n => ({
      id: n.id,
      type: n.type || 'a2a-agent',
      position: n.position,
      data: n,
    })))
    setEdges(storeEdges.map(e => ({
      id: e.id, source: e.source, target: e.target,
      type: 'smoothstep', animated: true,
      style: { stroke: '#722ed1', strokeDasharray: '6 3' },
      label: e.label || 'subscribe',
    })))
  }, [storeKey, storeNodes, storeEdges, setNodes, setEdges])

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return
    const id = `ae_${Date.now()}`
    dispatch(addAgentEdge({ id, source: conn.source, target: conn.target }))
    setEdges(eds => addEdge({ ...conn, id, type: 'smoothstep', animated: true, style: { stroke: '#722ed1', strokeDasharray: '6 3' }, label: 'subscribe' }, eds))
  }, [dispatch, setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    dispatch(selectAgentNode(node.id))
  }, [dispatch])

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: { id: string }) => {
    dispatch(selectAgentEdge(edge.id))
  }, [dispatch])

  const onPaneClick = useCallback(() => {
    dispatch(selectAgentNode(null))
  }, [dispatch])

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    dispatch(moveAgentNode({ id: node.id, position: node.position }))
  }, [dispatch])

  const addNewAgent = useCallback(() => {
    const id = genAgentId()
    const node: AgentCanvasNode = {
      id, label: `智能体 ${_agentIdCounter}`, type: 'a2a-agent',
      agentKind: 'worker',
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      agentCard: {
        ...defaultAgentCard,
        name: `智能体 ${_agentIdCounter}`,
        metadata: { agentKind: 'worker', workerOnly: true },
        interfaces: { user: { enabled: false }, a2a: { enabled: true } },
      },
      trust: { ...defaultTrust },
      timeout: 30000, retryCount: 0, lifecycle: 'sync',
      pushNotificationUrl: '', tenantId: '', extensions: {},
    }
    dispatch(addAgentNode(node))
    setNodes(nds => [...nds, { id: node.id, type: 'a2a-agent', position: node.position, data: node }])
  }, [dispatch, setNodes])

  const addNewRouter = useCallback(() => {
    const id = genRouterId()
    const node: AgentCanvasNode = {
      id, label: `路由器 ${_routerIdCounter}`, type: 'a2a-router',
      position: { x: 200 + Math.random() * 300, y: 300 + Math.random() * 200 },
      routingRules: [],
      defaultTarget: '',
    }
    dispatch(addAgentNode(node))
    setNodes(nds => [...nds, { id: node.id, type: 'a2a-router', position: node.position, data: node }])
  }, [dispatch, setNodes])

  const addNewGroup = useCallback(() => {
    const id = genGroupId()
    const node: AgentCanvasNode = {
      id, label: `编组 ${_groupIdCounter}`, type: 'a2a-group',
      position: { x: 150 + Math.random() * 200, y: 150 + Math.random() * 200 },
    }
    dispatch(addAgentNode(node))
    setNodes(nds => [...nds, { id: node.id, type: 'a2a-group', position: node.position, data: { ...node, childIds: [] } }])
  }, [dispatch, setNodes])

  const addNewExternal = useCallback(() => {
    const id = genExternalId()
    const node: AgentCanvasNode = {
      id, label: `外部 Agent ${_externalIdCounter}`, type: 'a2a-external',
      position: { x: 250 + Math.random() * 300, y: 100 + Math.random() * 200 },
      agentCard: {
        name: `外部 Agent ${_externalIdCounter}`,
        version: '1.0.0',
        capabilities: { streaming: false, pushNotifications: false },
        skills: [{ id: 'default', name: 'default' }],
        defaultInterface: { type: 'a2a' },
        metadata: { external: true },
      },
      externalConfig: {
        rpcUrl: 'http://127.0.0.1:9001/rpc',
        agentId: '',
        publicKey: '',
        remoteName: '',
        authorized: false,
        allowedSkills: ['*'],
      },
    }
    dispatch(addAgentNode(node))
    setNodes(nds => [...nds, { id: node.id, type: 'a2a-external', position: node.position, data: node }])
  }, [dispatch, setNodes])

  const selectedNodeId = useAppSelector(s => s.agent.selectedNodeId)
  const selectedEdgeId = useAppSelector(s => s.agent.selectedEdgeId)

  const loadDemo = useCallback(() => {
    if (storeNodes.length > 0 && !window.confirm('将清空当前 Agent 画布并加载 Demo，是否继续？')) return
    dispatch(clearAgents())
    const demo = buildAgentSocietyDemo()
    dispatch(loadAgents(demo))
    setNodes(demo.nodes.map(n => ({ id: n.id, type: n.type || 'a2a-agent', position: n.position, data: n })))
    setEdges(demo.edges.map(e => ({
      id: e.id, source: e.source, target: e.target,
      type: 'smoothstep', animated: true,
      style: { stroke: '#722ed1', strokeDasharray: '6 3' },
      label: e.label || 'subscribe',
    })))
  }, [dispatch, setNodes, setEdges, storeNodes.length])

  const deleteSelected = useCallback(() => {
    if (selectedNodeId) {
      dispatch(removeAgentNode(selectedNodeId))
      setNodes(nds => nds.filter(n => n.id !== selectedNodeId))
      setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
    } else if (selectedEdgeId) {
      dispatch(removeAgentEdge(selectedEdgeId))
      setEdges(eds => eds.filter(e => e.id !== selectedEdgeId))
    }
  }, [dispatch, selectedNodeId, selectedEdgeId, setNodes, setEdges])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedNodeId || selectedEdgeId)) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteSelected, selectedNodeId, selectedEdgeId])

  const exportSelectedBundle = useCallback(async () => {
    const agent = storeNodes.find(n => n.id === selectedNodeId && n.type === 'a2a-agent')
    if (!agent?.agentCard) {
      alert('请先选中一个智能体节点')
      return
    }
    try {
      const book = await downloadAgentBundle(agent, { requireEnvelope: true })
      setRunbook(book)
    } catch (e: unknown) {
      alert(`导出 Bundle 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [selectedNodeId, storeNodes])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {runbook && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setRunbook(null)}>
          <div style={{
            background: '#fff', borderRadius: 10, padding: 20, maxWidth: 560, width: '90%',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Agent 已导出 — 运行指引</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
              解压 <code>{runbook.name}_agent.zip</code>，双击 <code>{runbook.name}.exe</code> 启动（同目录需保留 <code>{runbook.name}.bundle</code> 文件夹）
            </div>
            {([
              ['1. 校验', runbook.validate],
              ['2. 启动 daemon', runbook.run],
              ['3. 健康检查', runbook.health],
              ['4. 调用 RPC', runbook.rpcExample],
            ] as const).map(([label, cmd]) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
                <code style={{
                  display: 'block', background: '#f5f5f5', padding: '8px 10px',
                  borderRadius: 6, fontSize: 11, wordBreak: 'break-all',
                }}>{cmd}</code>
              </div>
            ))}
            <button onClick={() => setRunbook(null)} style={{
              marginTop: 8, padding: '6px 16px', background: '#531dab', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            }}>知道了</button>
          </div>
        </div>
      )}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Agent 编排画布</span>
        <button onClick={addNewAgent} style={{
          padding: '4px 14px', background: '#722ed1', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}>+ 智能体</button>
        <button onClick={addNewExternal} style={{
          padding: '4px 14px', background: '#fa8c16', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}>+ 外部 Agent</button>
        <button onClick={addNewRouter} style={{
          padding: '4px 14px', background: '#fa8c16', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}>+ 路由器</button>
        <button onClick={addNewGroup} style={{
          padding: '4px 14px', background: '#d3adf7', color: '#722ed1',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}>+ 编组</button>
        <button onClick={loadDemo} style={{
          padding: '4px 14px', background: '#13c2c2', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}>加载 AI 社会 Demo</button>
        {selectedNodeId && storeNodes.find(n => n.id === selectedNodeId)?.type === 'a2a-agent' && (
          <button onClick={exportSelectedBundle} style={{
            padding: '4px 14px', background: '#531dab', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          }}>导出 exe</button>
        )}
        {selectedNodeId && <span style={{ fontSize: 12, color: '#888' }}>已选: {selectedNodeId}</span>}
        {(selectedNodeId || selectedEdgeId) && (
          <button onClick={deleteSelected} style={{
            padding: '4px 14px', background: '#e53e3e', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          }}>删除</button>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
