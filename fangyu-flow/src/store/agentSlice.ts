import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AgentCard, TrustConfig, RoutingRule, AgentKind } from '../utils/a2aProtocol'
import type { ExternalAgentConfig } from '../utils/externalAgent'

export interface AgentCanvasNode {
  id: string
  label: string
  type: 'a2a-agent' | 'a2a-external' | 'a2a-router' | 'a2a-group'
  agentKind?: AgentKind
  externalConfig?: ExternalAgentConfig
  position: { x: number; y: number }
  agentCard?: AgentCard
  trust?: TrustConfig
  skillFlows?: Record<string, { nodes: unknown[]; edges: unknown[] }>
  timeout?: number
  retryCount?: number
  lifecycle?: 'sync' | 'async' | 'streaming'
  pushNotificationUrl?: string
  tenantId?: string
  extensions?: Record<string, string>
  routingRules?: RoutingRule[]
  defaultTarget?: string
}

export interface AgentCanvasEdge {
  id: string; source: string; target: string
  sourceSkill?: string; targetSkill?: string; label?: string
}

interface AgentState {
  nodes: AgentCanvasNode[]
  edges: AgentCanvasEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
}

const initialState: AgentState = {
  nodes: [], edges: [],
  selectedNodeId: null, selectedEdgeId: null,
}

const agentSlice = createSlice({
  name: 'agent',
  initialState,
  reducers: {
    addAgentNode(state, action: PayloadAction<AgentCanvasNode>) { state.nodes.push(action.payload) },
    updateAgentNode(state, action: PayloadAction<{ id: string; data: Partial<AgentCanvasNode> }>) {
      const n = state.nodes.find(n => n.id === action.payload.id)
      if (n) Object.assign(n, action.payload.data)
    },
    removeAgentNode(state, action: PayloadAction<string>) {
      state.nodes = state.nodes.filter(n => n.id !== action.payload)
      state.edges = state.edges.filter(e => e.source !== action.payload && e.target !== action.payload)
    },
    moveAgentNode(state, action: PayloadAction<{ id: string; position: { x: number; y: number } }>) {
      const n = state.nodes.find(n => n.id === action.payload.id)
      if (n) n.position = action.payload.position
    },
    addAgentEdge(state, action: PayloadAction<AgentCanvasEdge>) { state.edges.push(action.payload) },
    removeAgentEdge(state, action: PayloadAction<string>) {
      state.edges = state.edges.filter(e => e.id !== action.payload)
    },
    updateAgentEdge(state, action: PayloadAction<{ id: string; data: Partial<AgentCanvasEdge> }>) {
      const e = state.edges.find(e => e.id === action.payload.id)
      if (e) Object.assign(e, action.payload.data)
    },
    selectAgentNode(state, action: PayloadAction<string | null>) {
      state.selectedNodeId = action.payload; state.selectedEdgeId = null
    },
    selectAgentEdge(state, action: PayloadAction<string | null>) {
      state.selectedEdgeId = action.payload; state.selectedNodeId = null
    },
    clearAgentSelection(state) { state.selectedNodeId = null; state.selectedEdgeId = null },
    updateAgentCard(state, action: PayloadAction<{ nodeId: string; card: AgentCard }>) {
      const n = state.nodes.find(n => n.id === action.payload.nodeId)
      if (n) n.agentCard = action.payload.card
    },
    updateAgentTrust(state, action: PayloadAction<{ nodeId: string; trust: TrustConfig }>) {
      const n = state.nodes.find(n => n.id === action.payload.nodeId)
      if (n) n.trust = action.payload.trust
    },
    updateRoutingRules(state, action: PayloadAction<{ nodeId: string; rules: RoutingRule[]; defaultTarget?: string }>) {
      const n = state.nodes.find(n => n.id === action.payload.nodeId)
      if (n) { n.routingRules = action.payload.rules; n.defaultTarget = action.payload.defaultTarget }
    },
    updateSkillFlow(state, action: PayloadAction<{ nodeId: string; skillId: string; flow: { nodes: unknown[]; edges: unknown[] } }>) {
      const n = state.nodes.find(n => n.id === action.payload.nodeId)
      if (n) {
        if (!n.skillFlows) n.skillFlows = {}
        n.skillFlows[action.payload.skillId] = action.payload.flow
      }
    },
    clearSkillFlow(state, action: PayloadAction<{ nodeId: string; skillId: string }>) {
      const n = state.nodes.find(n => n.id === action.payload.nodeId)
      if (n?.skillFlows) delete n.skillFlows[action.payload.skillId]
    },
    loadAgents(state, action: PayloadAction<{ nodes: AgentCanvasNode[]; edges: AgentCanvasEdge[] }>) {
      state.nodes = action.payload.nodes; state.edges = action.payload.edges
    },
    clearAgents(state) { state.nodes = []; state.edges = []; state.selectedNodeId = null; state.selectedEdgeId = null },
  },
})

export const {
  addAgentNode, updateAgentNode, removeAgentNode, moveAgentNode,
  addAgentEdge, removeAgentEdge, updateAgentEdge, selectAgentNode, selectAgentEdge,
  clearAgentSelection, updateAgentCard, updateAgentTrust,
  updateRoutingRules, loadAgents, clearAgents, updateSkillFlow, clearSkillFlow,
} = agentSlice.actions
export default agentSlice.reducer
