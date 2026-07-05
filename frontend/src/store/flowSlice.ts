import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Node, Edge } from 'reactflow'

export interface DragInfo {
  type: string
  name: string
  category: string
}

export interface EditingConfig {
  [key: string]: unknown
}

export interface GlobalPrompts {
  system_prompt: string
  user_prompt_template: string
  context: string
}

export interface FlowState {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  configPanelVisible: boolean
  edgeConfigPanelVisible: boolean
  flowConfigVisible: boolean
  editingConfig: EditingConfig | null
  simulationRunning: boolean
  saveTimestamp: number
  dirty: boolean
  draggedNode: DragInfo | null
  showLogPanel: boolean
  simLogs: SimLog[]
  globalPrompts: GlobalPrompts
}

export interface SimLog {
  nodeId: string
  nodeName: string
  type: 'start' | 'complete' | 'error'
  data: Record<string, unknown>
  time: number
}

const initialState: FlowState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  configPanelVisible: false,
  edgeConfigPanelVisible: false,
  flowConfigVisible: false,
  editingConfig: null,
  simulationRunning: false,
  saveTimestamp: 0,
  dirty: false,
  draggedNode: null,
  showLogPanel: false,
  simLogs: [],
  globalPrompts: { system_prompt: '', user_prompt_template: '', context: '' },
}

export const flowSlice = createSlice({
  name: 'flow',
  initialState,
  reducers: {
    setNodes(state, action: PayloadAction<Node[]>) {
      state.nodes = action.payload
      state.dirty = true
    },
    setEdges(state, action: PayloadAction<Edge[]>) {
      state.edges = action.payload
      state.dirty = true
    },
    selectNode(state, action: PayloadAction<string | null>) {
      state.selectedNodeId = action.payload
      state.selectedEdgeId = null
    },
    selectEdge(state, action: PayloadAction<string | null>) {
      state.selectedEdgeId = action.payload
      state.selectedNodeId = null
    },
    openConfigPanel(state) {
      if (!state.selectedNodeId) return
      state.configPanelVisible = true
      state.edgeConfigPanelVisible = false
      const node = state.nodes.find(n => n.id === state.selectedNodeId)
      if (node?.data?.config) {
        state.editingConfig = JSON.parse(JSON.stringify(node.data.config))
      } else {
        state.editingConfig = {}
      }
    },
    closeConfig(state) {
      state.configPanelVisible = false
      state.edgeConfigPanelVisible = false
      state.flowConfigVisible = false
      state.selectedNodeId = null
      state.selectedEdgeId = null
      state.editingConfig = null
    },
    openFlowConfig(state) {
      state.flowConfigVisible = true
      state.configPanelVisible = false
      state.edgeConfigPanelVisible = false
      state.selectedNodeId = null
      state.selectedEdgeId = null
    },
    updateNodeConfig(state, action: PayloadAction<{ config: Record<string, unknown>; mappings?: Record<string, string>; label?: string; desc?: string }>) {
      const { config, mappings, label, desc } = action.payload
      const node = state.nodes.find(n => n.id === state.selectedNodeId)
      if (node) {
        node.data = { ...node.data, config: { ...config } }
        if (mappings) node.data.mappings = { ...mappings }
        if (label !== undefined) node.data.label = label
        if (desc !== undefined) node.data.desc = desc
        state.editingConfig = { ...config }
        state.dirty = true
        state.saveTimestamp++
      }
    },
    openEdgeConfigPanel(state) {
      state.edgeConfigPanelVisible = true
      state.configPanelVisible = false
    },
    setSimulationRunning(state, action: PayloadAction<boolean>) {
      state.simulationRunning = action.payload
    },
    addSimLog(state, action: PayloadAction<SimLog>) {
      state.simLogs.push(action.payload)
    },
    clearSimLogs(state) {
      state.simLogs = []
    },
    setShowLogPanel(state, action: PayloadAction<boolean>) {
      state.showLogPanel = action.payload
    },
    setGlobalPrompts(state, action: PayloadAction<GlobalPrompts>) {
      state.globalPrompts = action.payload
    },
    setDraggedNode(state, action: PayloadAction<DragInfo | null>) {
      state.draggedNode = action.payload
    },
    importFlow(state, action: PayloadAction<{ nodes: Node[]; edges: Edge[] }>) {
      state.nodes = action.payload.nodes
      state.edges = action.payload.edges
      state.selectedNodeId = null
      state.selectedEdgeId = null
      state.configPanelVisible = false
      state.edgeConfigPanelVisible = false
      state.dirty = true
    },
    updateEdgeConfig(state, action: PayloadAction<{ linkType: string; mappings: Record<string, string> }>) {
      const { linkType, mappings } = action.payload
      const edge = state.edges.find(e => e.id === state.selectedEdgeId)
      if (edge) {
        edge.data = { ...edge.data, linkType, mappings }
        state.dirty = true
        state.saveTimestamp++
      }
    },
    setEdgeData(state, action: PayloadAction<{ edgeId: string; data: Record<string, unknown> }>) {
      const edge = state.edges.find(e => e.id === action.payload.edgeId)
      if (edge) {
        edge.data = { ...edge.data, ...action.payload.data }
      }
    },
    newFlow(state) {
      state.nodes = []
      state.edges = []
      state.selectedNodeId = null
      state.selectedEdgeId = null
      state.configPanelVisible = false
      state.edgeConfigPanelVisible = false
      state.flowConfigVisible = false
      state.globalPrompts = { system_prompt: '', user_prompt_template: '', context: '' }
      state.dirty = false
    },
    markClean(state) {
      state.dirty = false
    },
  },
})

export const {
  setNodes, setEdges, selectNode, selectEdge,
  openConfigPanel, closeConfig, openFlowConfig, updateNodeConfig, updateEdgeConfig, setEdgeData,
  openEdgeConfigPanel,
  setSimulationRunning, addSimLog, clearSimLogs, setShowLogPanel,
  setDraggedNode, importFlow, newFlow, setGlobalPrompts, markClean,
} = flowSlice.actions
export default flowSlice.reducer
