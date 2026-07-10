import { describe, it, expect, beforeEach } from 'vitest'
import flowReducer, {
  setNodes, setEdges, selectNode, selectEdge,
  openConfigPanel, closeConfig, openFlowConfig, updateNodeConfig,
  openEdgeConfigPanel, setSimulationRunning, addSimLog, clearSimLogs,
  setShowLogPanel, setGlobalPrompts, toggleBreakpoint, clearBreakpoints,
  setDraggedNode, importFlow, updateEdgeConfig, setEdgeData,
  newFlow, markClean,
  type FlowState, type SimLog, type DragInfo, type GlobalPrompts,
} from '../flowSlice'
import type { Node, Edge } from 'reactflow'

function makeNode(id: string, label = 'Node', config: Record<string, unknown> = {}): Node {
  return { id, type: 'atom-node', position: { x: 0, y: 0 }, data: { label, config } }
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, type: 'flow-edge', data: {} }
}

describe('flowSlice', () => {
  let initial: FlowState

  beforeEach(() => {
    initial = {
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
      breakpoints: [],
      draggedNode: null,
      showLogPanel: false,
      simLogs: [],
      globalPrompts: { system_prompt: '', user_prompt_template: '', context: '' },
    }
  })

  describe('setNodes', () => {
    it('replaces nodes and marks dirty', () => {
      const nodes = [makeNode('n1'), makeNode('n2')]
      const state = flowReducer(initial, setNodes(nodes))
      expect(state.nodes).toEqual(nodes)
      expect(state.dirty).toBe(true)
    })
  })

  describe('setEdges', () => {
    it('replaces edges and marks dirty', () => {
      const edges = [makeEdge('e1', 'n1', 'n2')]
      const state = flowReducer(initial, setEdges(edges))
      expect(state.edges).toEqual(edges)
      expect(state.dirty).toBe(true)
    })
  })

  describe('selectNode', () => {
    it('sets selectedNodeId and clears selectedEdgeId', () => {
      const withEdge = { ...initial, selectedEdgeId: 'e1' }
      const state = flowReducer(withEdge, selectNode('n1'))
      expect(state.selectedNodeId).toBe('n1')
      expect(state.selectedEdgeId).toBeNull()
    })

    it('sets selectedNodeId to null', () => {
      const withNode = { ...initial, selectedNodeId: 'n1' }
      const state = flowReducer(withNode, selectNode(null))
      expect(state.selectedNodeId).toBeNull()
    })
  })

  describe('selectEdge', () => {
    it('sets selectedEdgeId and clears selectedNodeId', () => {
      const withNode = { ...initial, selectedNodeId: 'n1' }
      const state = flowReducer(withNode, selectEdge('e1'))
      expect(state.selectedEdgeId).toBe('e1')
      expect(state.selectedNodeId).toBeNull()
    })
  })

  describe('openConfigPanel', () => {
    it('does nothing when no node selected', () => {
      const state = flowReducer(initial, openConfigPanel())
      expect(state.configPanelVisible).toBe(false)
    })

    it('opens panel and copies config from selected node', () => {
      const node = makeNode('n1', 'Test', { key: 'value', nested: { a: 1 } })
      const pre = { ...initial, nodes: [node], selectedNodeId: 'n1' }
      const state = flowReducer(pre, openConfigPanel())
      expect(state.configPanelVisible).toBe(true)
      expect(state.edgeConfigPanelVisible).toBe(false)
      expect(state.editingConfig).toEqual({ key: 'value', nested: { a: 1 } })
      expect(state.editingConfig).not.toBe(node.data.config)
    })

    it('sets empty editingConfig when node has no config', () => {
      const node = makeNode('n1', 'Test', undefined!)
      const pre = { ...initial, nodes: [node], selectedNodeId: 'n1' }
      const state = flowReducer(pre, openConfigPanel())
      expect(state.editingConfig).toEqual({})
    })
  })

  describe('closeConfig', () => {
    it('resets all panel visibility and selection state', () => {
      const pre = {
        ...initial,
        configPanelVisible: true,
        edgeConfigPanelVisible: true,
        flowConfigVisible: true,
        selectedNodeId: 'n1',
        selectedEdgeId: 'e1',
        editingConfig: { some: 'data' },
      }
      const state = flowReducer(pre, closeConfig())
      expect(state.configPanelVisible).toBe(false)
      expect(state.edgeConfigPanelVisible).toBe(false)
      expect(state.flowConfigVisible).toBe(false)
      expect(state.selectedNodeId).toBeNull()
      expect(state.selectedEdgeId).toBeNull()
      expect(state.editingConfig).toBeNull()
    })
  })

  describe('openFlowConfig', () => {
    it('opens flow config and closes all other panels', () => {
      const pre = {
        ...initial,
        configPanelVisible: true,
        edgeConfigPanelVisible: true,
        selectedNodeId: 'n1',
        selectedEdgeId: 'e1',
      }
      const state = flowReducer(pre, openFlowConfig())
      expect(state.flowConfigVisible).toBe(true)
      expect(state.configPanelVisible).toBe(false)
      expect(state.edgeConfigPanelVisible).toBe(false)
      expect(state.selectedNodeId).toBeNull()
      expect(state.selectedEdgeId).toBeNull()
    })
  })

  describe('updateNodeConfig', () => {
    it('updates config on selected node and sets dirty', () => {
      const node = makeNode('n1', 'Old', { oldKey: 'oldVal' })
      const pre = { ...initial, nodes: [node], selectedNodeId: 'n1' }
      const state = flowReducer(pre, updateNodeConfig({ config: { newKey: 'newVal' } }))
      expect(state.nodes[0].data.config).toEqual({ newKey: 'newVal' })
      expect(state.editingConfig).toEqual({ newKey: 'newVal' })
      expect(state.dirty).toBe(true)
      expect(state.saveTimestamp).toBe(1)
    })

    it('updates mappings when provided', () => {
      const node = makeNode('n1', 'Test')
      const pre = { ...initial, nodes: [node], selectedNodeId: 'n1' }
      const state = flowReducer(pre, updateNodeConfig({ config: {}, mappings: { a: 'b' } }))
      expect(state.nodes[0].data.mappings).toEqual({ a: 'b' })
    })

    it('updates label when provided', () => {
      const node = makeNode('n1', 'Old Label')
      const pre = { ...initial, nodes: [node], selectedNodeId: 'n1' }
      const state = flowReducer(pre, updateNodeConfig({ config: {}, label: 'New Label' }))
      expect(state.nodes[0].data.label).toBe('New Label')
    })

    it('updates desc when provided', () => {
      const node = makeNode('n1', 'Test')
      const pre = { ...initial, nodes: [node], selectedNodeId: 'n1' }
      const state = flowReducer(pre, updateNodeConfig({ config: {}, desc: 'Description' }))
      expect(state.nodes[0].data.desc).toBe('Description')
    })

    it('does nothing when selectedNodeId does not match any node', () => {
      const node = makeNode('n1')
      const pre = { ...initial, nodes: [node], selectedNodeId: 'n2' }
      const state = flowReducer(pre, updateNodeConfig({ config: { key: 'val' } }))
      expect(state.dirty).toBe(false)
      expect(state.saveTimestamp).toBe(0)
    })
  })

  describe('openEdgeConfigPanel', () => {
    it('opens edge config and closes node config panel', () => {
      const pre = { ...initial, configPanelVisible: true }
      const state = flowReducer(pre, openEdgeConfigPanel())
      expect(state.edgeConfigPanelVisible).toBe(true)
      expect(state.configPanelVisible).toBe(false)
    })
  })

  describe('setSimulationRunning', () => {
    it('sets simulationRunning to true', () => {
      const state = flowReducer(initial, setSimulationRunning(true))
      expect(state.simulationRunning).toBe(true)
    })

    it('sets simulationRunning to false', () => {
      const pre = { ...initial, simulationRunning: true }
      const state = flowReducer(pre, setSimulationRunning(false))
      expect(state.simulationRunning).toBe(false)
    })
  })

  describe('addSimLog', () => {
    it('appends a log to simLogs', () => {
      const log: SimLog = { nodeId: 'n1', nodeName: 'Node1', type: 'start', data: {}, time: 100 }
      const state = flowReducer(initial, addSimLog(log))
      expect(state.simLogs).toHaveLength(1)
      expect(state.simLogs[0]).toEqual(log)
    })

    it('appends multiple logs in order', () => {
      const log1: SimLog = { nodeId: 'n1', nodeName: 'A', type: 'start', data: {}, time: 1 }
      const log2: SimLog = { nodeId: 'n2', nodeName: 'B', type: 'complete', data: {}, time: 2 }
      const s1 = flowReducer(initial, addSimLog(log1))
      const s2 = flowReducer(s1, addSimLog(log2))
      expect(s2.simLogs).toHaveLength(2)
      expect(s2.simLogs[0]).toEqual(log1)
      expect(s2.simLogs[1]).toEqual(log2)
    })
  })

  describe('clearSimLogs', () => {
    it('clears all simulation logs', () => {
      const pre = { ...initial, simLogs: [{ nodeId: 'n1', nodeName: 'A', type: 'error', data: {}, time: 0 }] }
      const state = flowReducer(pre, clearSimLogs())
      expect(state.simLogs).toEqual([])
    })
  })

  describe('setShowLogPanel', () => {
    it('shows log panel', () => {
      const state = flowReducer(initial, setShowLogPanel(true))
      expect(state.showLogPanel).toBe(true)
    })

    it('hides log panel', () => {
      const pre = { ...initial, showLogPanel: true }
      const state = flowReducer(pre, setShowLogPanel(false))
      expect(state.showLogPanel).toBe(false)
    })
  })

  describe('setGlobalPrompts', () => {
    it('sets global prompts', () => {
      const prompts: GlobalPrompts = { system_prompt: 'sys', user_prompt_template: 'user', context: 'ctx' }
      const state = flowReducer(initial, setGlobalPrompts(prompts))
      expect(state.globalPrompts).toEqual(prompts)
    })
  })

  describe('toggleBreakpoint', () => {
    it('adds a breakpoint when not present', () => {
      const state = flowReducer(initial, toggleBreakpoint('n1'))
      expect(state.breakpoints).toContain('n1')
    })

    it('removes a breakpoint when already present', () => {
      const pre = { ...initial, breakpoints: ['n1', 'n2'] }
      const state = flowReducer(pre, toggleBreakpoint('n1'))
      expect(state.breakpoints).toEqual(['n2'])
    })
  })

  describe('clearBreakpoints', () => {
    it('clears all breakpoints', () => {
      const pre = { ...initial, breakpoints: ['n1', 'n2', 'n3'] }
      const state = flowReducer(pre, clearBreakpoints())
      expect(state.breakpoints).toEqual([])
    })
  })

  describe('setDraggedNode', () => {
    it('sets dragged node info', () => {
      const drag: DragInfo = { type: 'llm', name: 'LLM Node', category: 'ai' }
      const state = flowReducer(initial, setDraggedNode(drag))
      expect(state.draggedNode).toEqual(drag)
    })

    it('clears dragged node info', () => {
      const pre = { ...initial, draggedNode: { type: 'llm', name: 'LLM', category: 'ai' } }
      const state = flowReducer(pre, setDraggedNode(null))
      expect(state.draggedNode).toBeNull()
    })
  })

  describe('importFlow', () => {
    it('imports nodes and edges and resets selection', () => {
      const nodes = [makeNode('n1'), makeNode('n2')]
      const edges = [makeEdge('e1', 'n1', 'n2')]
      const pre = { ...initial, selectedNodeId: 'old', selectedEdgeId: 'old', configPanelVisible: true, edgeConfigPanelVisible: true }
      const state = flowReducer(pre, importFlow({ nodes, edges }))
      expect(state.nodes).toEqual(nodes)
      expect(state.edges).toEqual(edges)
      expect(state.selectedNodeId).toBeNull()
      expect(state.selectedEdgeId).toBeNull()
      expect(state.configPanelVisible).toBe(false)
      expect(state.edgeConfigPanelVisible).toBe(false)
      expect(state.dirty).toBe(true)
    })
  })

  describe('updateEdgeConfig', () => {
    it('updates edge config when selected edge exists', () => {
      const edge = makeEdge('e1', 'n1', 'n2')
      const pre = { ...initial, edges: [edge], selectedEdgeId: 'e1' }
      const state = flowReducer(pre, updateEdgeConfig({ linkType: 'parallel', mappings: { in: 'out' } }))
      expect(state.edges[0].data.linkType).toBe('parallel')
      expect(state.edges[0].data.mappings).toEqual({ in: 'out' })
      expect(state.dirty).toBe(true)
      expect(state.saveTimestamp).toBe(1)
    })

    it('does nothing when selected edge does not exist', () => {
      const pre = { ...initial, edges: [makeEdge('e1', 'n1', 'n2')], selectedEdgeId: 'e2' }
      const state = flowReducer(pre, updateEdgeConfig({ linkType: 'parallel', mappings: {} }))
      expect(state.dirty).toBe(false)
    })
  })

  describe('setEdgeData', () => {
    it('merges data into existing edge', () => {
      const edge = { ...makeEdge('e1', 'n1', 'n2'), data: { existing: 'val' } }
      const pre = { ...initial, edges: [edge] }
      const state = flowReducer(pre, setEdgeData({ edgeId: 'e1', data: { additional: 'data' } }))
      expect(state.edges[0].data).toEqual({ existing: 'val', additional: 'data' })
    })

    it('does nothing when edge not found', () => {
      const pre = { ...initial, edges: [makeEdge('e1', 'n1', 'n2')] }
      const state = flowReducer(pre, setEdgeData({ edgeId: 'e2', data: { key: 'val' } }))
      expect(state.edges[0].data).toEqual({})
    })
  })

  describe('newFlow', () => {
    it('resets everything to initial state', () => {
      const pre = {
        ...initial,
        nodes: [makeNode('n1')],
        edges: [makeEdge('e1', 'n1', 'n2')],
        selectedNodeId: 'n1',
        selectedEdgeId: 'e1',
        configPanelVisible: true,
        edgeConfigPanelVisible: true,
        flowConfigVisible: true,
        globalPrompts: { system_prompt: 'sys', user_prompt_template: 'user', context: 'ctx' },
        dirty: true,
      }
      const state = flowReducer(pre, newFlow())
      expect(state.nodes).toEqual([])
      expect(state.edges).toEqual([])
      expect(state.selectedNodeId).toBeNull()
      expect(state.selectedEdgeId).toBeNull()
      expect(state.configPanelVisible).toBe(false)
      expect(state.edgeConfigPanelVisible).toBe(false)
      expect(state.flowConfigVisible).toBe(false)
      expect(state.globalPrompts).toEqual({ system_prompt: '', user_prompt_template: '', context: '' })
      expect(state.dirty).toBe(false)
    })
  })

  describe('markClean', () => {
    it('sets dirty to false', () => {
      const pre = { ...initial, dirty: true }
      const state = flowReducer(pre, markClean())
      expect(state.dirty).toBe(false)
    })
  })
})
