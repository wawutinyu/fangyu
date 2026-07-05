import { useCallback, useRef } from 'react'
import ReactFlow, {
  Background, Controls,
  useNodesState, useEdgesState,
  addEdge, type Connection, type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import AgentNode from './AgentNode'
import RouterNode from './RouterNode'
import GroupNode from './GroupNode'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import { addAgentNode, addAgentEdge, selectAgentNode, moveAgentNode } from '../store/agentSlice'
import type { AgentCanvasNode } from '../store/agentSlice'
import type { AgentCard, TrustConfig } from '../utils/a2aProtocol'

const nodeTypes = { 'a2a-agent': AgentNode, 'a2a-router': RouterNode, 'a2a-group': GroupNode }

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

export default function AgentCanvas() {
  const dispatch = useAppDispatch()
  const storeNodes = useAppSelector(s => s.agent.nodes)
  const storeEdges = useAppSelector(s => s.agent.edges)

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
    label: 'subscribe',
  })))

  const prevStore = useRef('')
  const storeKey = JSON.stringify({ nodes: storeNodes, edges: storeEdges })
  if (storeKey !== prevStore.current) {
    prevStore.current = storeKey
  }

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return
    const id = `ae_${Date.now()}`
    dispatch(addAgentEdge({ id, source: conn.source, target: conn.target }))
    setEdges(eds => addEdge({ ...conn, id, type: 'smoothstep', animated: true, style: { stroke: '#722ed1', strokeDasharray: '6 3' }, label: 'subscribe' }, eds))
  }, [dispatch, setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    dispatch(selectAgentNode(node.id))
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
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      agentCard: { ...defaultAgentCard, name: `智能体 ${_agentIdCounter}` },
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

  const selectedNodeId = useAppSelector(s => s.agent.selectedNodeId)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Agent 编排画布</span>
        <button onClick={addNewAgent} style={{
          padding: '4px 14px', background: '#722ed1', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}>+ 智能体</button>
        <button onClick={addNewRouter} style={{
          padding: '4px 14px', background: '#fa8c16', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}>+ 路由器</button>
        <button onClick={addNewGroup} style={{
          padding: '4px 14px', background: '#d3adf7', color: '#722ed1',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}>+ 编组</button>
        {selectedNodeId && <span style={{ fontSize: 12, color: '#888' }}>已选: {selectedNodeId}</span>}
      </div>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
