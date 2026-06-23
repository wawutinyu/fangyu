import { defineStore } from 'pinia'
import { ref, computed, markRaw } from 'vue'

export const useFlowStore = defineStore('flow', () => {
  let _lf = null

  const selectedNode = ref(null)
  const configPanelVisible = ref(false)
  const editingConfig = ref(null)
  const configSavedVersion = ref(0)
  const simulationRunning = ref(false)
  const saveTimestamp = ref(0)
  const draggedNode = ref(null)

  // Edge config
  const selectedEdge = ref(null)
  const edgeConfigPanelVisible = ref(false)

  const selectedNodeData = computed(() => {
    if (!selectedNode.value) return null
    return {
      id: selectedNode.value.id,
      name: selectedNode.value.properties?.name || selectedNode.value.text?.value || '',
      type: selectedNode.value.properties?.originType || selectedNode.value.type,
      category: selectedNode.value.properties?.category || '',
      is_group: selectedNode.value.type === 'composite-node',
      config: selectedNode.value.properties?.config || {},
      mappings: selectedNode.value.properties?.mappings || {},
      inner_nodes: selectedNode.value.properties?.inner_nodes || [],
      inner_links: selectedNode.value.properties?.inner_links || [],
    }
  })

  function setSelectedNode(node) {
    selectedNode.value = node
    selectedEdge.value = null
    edgeConfigPanelVisible.value = false
  }

  function openConfigPanel() {
    if (!selectedNode.value) return
    configPanelVisible.value = true
    edgeConfigPanelVisible.value = false
    editingConfig.value = JSON.parse(JSON.stringify(selectedNode.value.properties?.config || {}))
  }

  function updateNodeConfig(config, mappings) {
    if (!selectedNode.value) return
    selectedNode.value.properties.config = { ...config }
    if (mappings) {
      selectedNode.value.properties.mappings = { ...mappings }
    }
    editingConfig.value = { ...config }
    configSavedVersion.value++
  }

  function closeConfig() {
    configPanelVisible.value = false
    edgeConfigPanelVisible.value = false
    selectedNode.value = null
    selectedEdge.value = null
    editingConfig.value = null
  }

  // Edge functions
  function setSelectedEdge(edge) {
    selectedEdge.value = edge
    selectedNode.value = null
    configPanelVisible.value = false
  }

  function openEdgeConfigPanel() {
    edgeConfigPanelVisible.value = true
    configPanelVisible.value = false
  }

  function updateEdgeMappings(mappings) {
    if (!selectedEdge.value || !_lf) return
    selectedEdge.value.properties = {
      ...selectedEdge.value.properties,
      mappings: { ...mappings },
    }
    const edgeModel = _lf.graphModel.edges.find(e => e.id === selectedEdge.value.id)
    if (edgeModel) {
      edgeModel.setProperties(selectedEdge.value.properties)
    }
    configSavedVersion.value++
  }

  function getEdgeMappings() {
    return selectedEdge.value?.properties?.mappings || {}
  }

  function startSimulation() {
    simulationRunning.value = true
  }

  function endSimulation() {
    simulationRunning.value = false
  }

  function setLf(lf) { _lf = markRaw(lf) }
  const lf = computed(() => _lf)

  return {
    lf, setLf,
    selectedNode, configPanelVisible, editingConfig, configSavedVersion, simulationRunning, saveTimestamp, draggedNode,
    selectedNodeData,
    selectedEdge, edgeConfigPanelVisible,
    setSelectedNode, openConfigPanel, updateNodeConfig, closeConfig,
    setSelectedEdge, openEdgeConfigPanel, updateEdgeMappings,
    startSimulation, endSimulation,
  }
})
