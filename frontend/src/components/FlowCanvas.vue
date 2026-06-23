<template>
  <div class="flow-canvas-wrapper">
    <div ref="canvasContainer" class="flow-canvas-container"></div>
    <div v-if="store.simulationRunning" class="simulation-bar">
      <span>运行中...</span>
      <div class="sim-progress">
        <div class="sim-progress-bar" :style="{ width: simProgress + '%' }"></div>
      </div>
      <span>{{ simProgress }}%</span>
      <button class="notion-btn" @click="stopSimulation" style="font-size:11px;padding:2px 8px">停止</button>
    </div>
    <div v-if="!store.simulationRunning && simLogs.length > 0" class="sim-log-toggle" :class="{ active: showLogPanel }" @click="showLogPanel = !showLogPanel">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      <span>运行日志 ({{ simLogs.length }})</span>
    </div>
    <div v-if="showLogPanel && simLogs.length > 0" class="log-panel">
      <div class="log-header">
        <span class="log-title">执行日志</span>
        <button class="log-close" @click="showLogPanel = false">×</button>
      </div>
      <div class="log-list">
        <div v-for="(log, i) in simLogs" :key="i" class="log-item" :class="'log-' + log.type">
          <span class="log-badge" :class="'badge-' + log.type">{{ log.type === 'start' ? '▶' : log.type === 'complete' ? '✓' : '✗' }}</span>
          <span class="log-node">{{ log.nodeName }}</span>
          <span class="log-detail">
            <template v-if="log.type === 'start'">输入: {{ formatLogData(log.data.inputs) }}</template>
            <template v-else-if="log.type === 'complete'">输出: {{ formatLogData(log.data.outputs) }}</template>
            <template v-else-if="log.type === 'error'">错误: {{ log.data.error }}</template>
          </span>
        </div>
      </div>
    </div>
    <div v-if="toast.msg" class="canvas-toast" :class="toast.type">{{ toast.msg }}</div>
    <div v-if="!canvasReady" class="canvas-loading">
      <span>正在初始化画布...</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import LogicFlow from '@logicflow/core'
import '@logicflow/core/dist/index.css'
import { useFlowStore } from '../stores/flowStore'
import { registerCustomNodes } from '../plugins/customNodes'
import { registerCustomEdges } from '../plugins/customEdges'
import { convertToExportFormat, convertFromExportFormat, generateId, getExecutionOrder, offsetPosition } from '../utils/flowHelper'
import { Executor } from '../utils/executor'
import { useSaveStore } from '../stores/saveStore'

const canvasContainer = ref(null)
const store = useFlowStore()
const saveStore = useSaveStore()
const canvasReady = ref(false)
const simProgress = ref(0)
const simLogs = ref([])
const showLogPanel = ref(false)
const toast = ref({ msg: '', type: 'info' })

let lf = null
let executor = null
let simTimer = null
let currentSimIndex = 0
let simNodeIds = []
let toastTimer = null

onMounted(() => {
  initLogicFlow()
})

onUnmounted(() => {
  stopSimulation()
  clearTimeout(toastTimer)
  document.removeEventListener('keydown', handleKeyDown)
  lf?.destroy()
})

defineExpose({ getLf, importFlow, exportFlow, newFlow, groupSelected, ungroupSelected, runSimulation, getCanvasData, saveFlow, restoreFromSave })

function handleKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveFlow()
  }
}

function showToast(msg, type) {
  clearTimeout(toastTimer)
  toast.value = { msg, type: type || 'info' }
  toastTimer = setTimeout(() => { toast.value = { msg: '', type: 'info' } }, 2500)
}

function saveFlow() {
  if (!lf) return
  saveStore.ensureCurrentProject()
  const data = convertToExportFormat(lf)
  if (!data.nodes?.length) { showToast('画布为空，无法保存', 'warn'); return }

  const dataStr = JSON.stringify(data)
  const last = saveStore.currentProject?.saves?.[0]
  if (last && JSON.stringify(last.data) === dataStr) {
    showToast('内容无变化，未保存', 'warn')
    return
  }

  const suggested = saveStore.currentProject
    ? `保存 ${(saveStore.currentProject.saves.length || 0) + 1}`
    : '我的流程'
  const name = window.prompt('输入保存名称：', suggested)
  if (!name?.trim()) return

  saveStore.addSave(name.trim(), data)
  showToast(`「${name.trim()}」保存成功`, 'success')
}

function restoreFromSave(saveData) {
  if (!lf) return
  if (!saveData.nodes?.length && !saveData.links?.length) {
    lf.clearData()
    lf.render({ nodes: [], edges: [] })
    return
  }
  const { nodes, edges } = convertFromExportFormat(saveData)
  lf.clearData()
  lf.render({ nodes, edges })
  showToast('已恢复', 'info')
}

function initLogicFlow() {
  if (!canvasContainer.value) return

  lf = new LogicFlow({
    container: canvasContainer.value,
    grid: { type: 'dot', size: 10, visible: true },
    stopZoomGraph: false,
    stopScrollGraph: false,
    edgeType: 'flow-edge',
    adjustEdge: true,
    adjustNodePosition: true,
    allowRotate: false,
    textEdit: false,
    nodeTextEdit: false,
    edgeTextEdit: false,
    edgeGenerator: (sourceNode, targetNode) => {
      return { type: 'flow-edge', properties: { linkType: 'serial' } }
    },
  })

  registerCustomNodes(lf)
  registerCustomEdges(lf)

  lf.render({ nodes: [], edges: [] })

  document.addEventListener('keydown', handleKeyDown)

  lf.on('node:click', ({ data }) => {
    store.setSelectedNode({ ...data, properties: { ...data.properties } })
  })

  lf.on('node:dblclick', ({ data }) => {
    if (data.type === 'composite-node') {
      ungroupCompositeNode(data.id)
    } else {
      store.setSelectedNode({ ...data, properties: { ...data.properties } })
      store.openConfigPanel()
    }
  })

  lf.on('node:delete', () => {
    const sel = store.selectedNode
    if (sel && !lf.graphModel.nodes.some(n => n.id === sel.id)) {
      store.closeConfig()
    }
  })

  lf.on('edge:click', ({ data }) => {
    // Show edge configuration panel with mapping options
    const sourceNode = lf.graphModel.nodes.find(n => n.id === data.sourceNodeId)
    const targetNode = lf.graphModel.nodes.find(n => n.id === data.targetNodeId)
    if (sourceNode && targetNode) {
      store.setSelectedEdge({
        id: data.id,
        sourceNodeId: data.sourceNodeId,
        targetNodeId: data.targetNodeId,
        properties: { ...(data.properties || {}) },
        sourceNodeName: sourceNode.text?.value || sourceNode.id,
        targetNodeName: targetNode.text?.value || targetNode.id,
        sourceType: sourceNode.properties?.originType || sourceNode.type,
        targetType: targetNode.properties?.originType || targetNode.type,
      })
      store.openEdgeConfigPanel()
    }
  })

  lf.on('blank:click', () => {
    store.closeConfig()
  })

  lf.on('node:dragstart', () => {
    lf.graphModel.setPartial(true)
  })

  lf.on('node:drop', () => {
    lf.graphModel.setPartial(false)
  })

  lf.setDefaultEdgeType('flow-edge')
  store.setLf(lf)
  canvasReady.value = true
}

function openNodeConfig(nodeData) {
  const nodeModel = lf.graphModel.nodes.find(n => n.id === nodeData.id)
  if (!nodeModel) return
  store.setSelectedNode({
    id: nodeModel.id,
    type: nodeModel.type,
    properties: { ...nodeModel.properties },
    text: nodeModel.text ? { value: nodeModel.text.value } : null,
  })
  store.openConfigPanel()
}

watch(() => store.configSavedVersion, () => {
  if (!store.selectedNode || !lf) return
  const nodeModel = lf.graphModel.nodes.find(n => n.id === store.selectedNode.id)
  if (nodeModel) {
    nodeModel.setProperties({
      ...nodeModel.properties,
      config: { ...store.editingConfig },
      mappings: { ...((store.selectedNode.properties?.mappings) || {}) },
    })
  }
})

function getLf() { return lf }

function getCanvasData() {
  return lf ? lf.getGraphData() : null
}

function newFlow() {
  if (!lf) return
  lf.clearData()
  lf.render({ nodes: [], edges: [] })
  store.closeConfig()
}

function importFlow(flowData) {
  if (!lf) return
  try {
    const { nodes, edges } = convertFromExportFormat(flowData)
    lf.render({ nodes, edges })
    store.closeConfig()
  } catch (err) {
    console.error('导入失败:', err)
    alert('导入失败：流程数据格式不正确')
  }
}

function exportFlow() {
  if (!lf) return null
  return convertToExportFormat(lf)
}

function groupSelected() {
  if (!lf) return
  const selected = lf.getSelectElements()
  const nodes = selected.nodes || []
  const edges = selected.edges || []

  if (nodes.length < 2) {
    alert('请框选至少2个节点以封装为组合原子')
    return
  }

  const innerNodes = nodes.map(n => {
    const props = n.properties || {}
    return {
      id: n.id,
      type: props.originType || n.type,
      name: props.name || '',
      category: props.category || '',
      is_group: false,
      inner_nodes: [],
      inner_links: [],
      config: props.config || {},
      position: { x: n.x, y: n.y }
    }
  })

  const innerLinks = edges.map(e => ({
    id: e.id,
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    linkType: e.properties?.linkType || 'serial'
  }))

  const avgX = innerNodes.reduce((s, n) => s + n.position.x, 0) / innerNodes.length
  const avgY = innerNodes.reduce((s, n) => s + n.position.y, 0) / innerNodes.length
  const groupId = generateId('group')

  lf.deleteNode(nodes[0].id)
  for (let i = 1; i < nodes.length; i++) lf.deleteNode(nodes[i].id)
  edges.forEach(e => lf.deleteEdge(e.id))

  lf.addNode({
    id: groupId,
    type: 'composite-node',
    x: avgX,
    y: avgY,
    properties: {
      originType: 'composite',
      name: '组合原子',
      category: '',
      is_group: true,
      inner_nodes: innerNodes,
      inner_links: innerLinks,
      config: { timeout: 3000, retry_times: 1 },
    },
    text: {
      value: '组合原子',
      x: avgX,
      y: avgY + 50,
    }
  })
}

function ungroupSelected() {
  if (!lf) return
  const selected = lf.getSelectElements()
  const nodes = selected.nodes || []
  const compositeNodes = nodes.filter(n => n.type === 'composite-node')
  if (compositeNodes.length === 0) {
    alert('请选中一个组合原子节点')
    return
  }
  compositeNodes.forEach(n => ungroupCompositeNode(n.id))
}

function ungroupCompositeNode(groupId) {
  if (!lf) return
  const nodeModel = lf.graphModel.nodes.find(n => n.id === groupId)
  if (!nodeModel || nodeModel.type !== 'composite-node') return

  const props = nodeModel.properties
  const innerNodes = props.inner_nodes || []
  const innerLinks = props.inner_links || []

  if (innerNodes.length === 0) return

  const offsetNodes = offsetPosition(innerNodes, nodeModel.x, nodeModel.y)

  lf.deleteNode(groupId)

  const nodeIdMap = {}
  offsetNodes.forEach(n => {
    const newId = generateId('node')
    nodeIdMap[n.id] = newId
    lf.addNode({
      id: newId,
      type: 'atom-node',
      x: n.position.x,
      y: n.position.y,
      properties: {
        originType: n.type,
        name: n.name,
        category: n.category,
        is_group: false,
        config: n.config || {},
        inner_nodes: [],
        inner_links: [],
      },
      text: {
        value: n.name,
        x: n.position.x,
        y: n.position.y + 40,
      }
    })
  })

  innerLinks.forEach(e => {
    const newSource = nodeIdMap[e.sourceNodeId]
    const newTarget = nodeIdMap[e.targetNodeId]
    if (newSource && newTarget) {
      lf.addEdge({
        id: generateId('link'),
        type: 'flow-edge',
        sourceNodeId: newSource,
        targetNodeId: newTarget,
        properties: { linkType: e.linkType || 'serial' }
      })
    }
  })

  store.closeConfig()
}

function runSimulation() {
  if (!lf) return
  const data = lf.getGraphData()
  const nodes = data.nodes || []
  if (nodes.length === 0) return

  store.startSimulation()
  simProgress.value = 0
  simLogs.value = []

  executor = new Executor(lf)
  executor.run().then(result => {
    simLogs.value = result.logs || []
    store.endSimulation()
    simProgress.value = 100
    if (result.success) {
      showToast(`运行完成，${result.results.length} 个节点已执行`, 'success')
    } else {
      showToast(result.error || '运行中止', 'warn')
    }
  })
}

function formatLogData(data) {
  if (!data) return '—'
  if (typeof data === 'string') return data.slice(0, 100)
  const str = JSON.stringify(data)
  return str.length > 100 ? str.slice(0, 100) + '…' : str
}

function stopSimulation() {
  if (executor) {
    executor.abort()
    executor = null
  }
  store.endSimulation()
  simProgress.value = 0
  if (lf) {
    lf.graphModel.nodes.forEach(n => n.setProperties({ _simulating: false }))
  }
}

watch(() => store.simulationRunning, (running) => {
  if (!running) stopSimulation()
})
</script>

<style scoped>
.flow-canvas-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: #fcfcfb;
}

.flow-canvas-container {
  width: 100%;
  height: 100%;
}
:deep(.lf-canvas-overlay) {
  background: #fcfcfb;
}
.flow-canvas-wrapper[data-dragging="true"] {
  background: #f5f5f3;
}
.flow-canvas-wrapper:deep(.lf-canvas-overlay) {
  pointer-events: auto;
}
.simulation-bar {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 12px;
  z-index: 100;
}
.sim-progress {
  width: 120px;
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  overflow: hidden;
}
.sim-progress-bar {
  height: 100%;
  background: #37352f;
  border-radius: 2px;
  transition: width 0.3s;
}
.canvas-toast {
  position: absolute;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 18px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  animation: toastIn 0.2s ease;
}
.canvas-toast.info { background: #37352f; color: #fff; }
.canvas-toast.success { background: #52c41a; color: #fff; }
.canvas-toast.warn { background: #fa8c16; color: #fff; }
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.sim-log-toggle {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  z-index: 100;
  transition: all 0.15s;
}
.sim-log-toggle:hover { background: var(--bg-hover); }
.sim-log-toggle.active { background: #f0f0ee; }

.log-panel {
  position: absolute;
  bottom: 44px;
  right: 12px;
  width: 400px;
  max-height: 320px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.15s ease;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
}
.log-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.log-close {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; color: var(--text-muted); padding: 0 4px; line-height: 1;
}
.log-close:hover { color: var(--text-primary); }
.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
}
.log-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--border-light);
  line-height: 1.5;
}
.log-item:last-child { border-bottom: none; }
.log-badge {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  margin-top: 1px;
}
.badge-start { background: #e6f7ff; color: #1890ff; }
.badge-complete { background: #f6ffed; color: #52c41a; }
.badge-error { background: #fff2f0; color: #ff4d4f; }
.log-node {
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  flex-shrink: 0;
  font-family: inherit;
}
.log-detail {
  color: var(--text-muted);
  word-break: break-all;
  font-family: inherit;
}

.canvas-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-muted);
  background: #fcfcfb;
}
</style>
