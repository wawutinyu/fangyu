<template>
  <div class="app-layout">
    <TopToolbar
      ref="toolbarRef"
      @new-flow="handleNewFlow"
      @save-flow="handleSaveFlow"
      @show-history="handleShowHistory"
      @import-flow="handleImportClick"
      @export-flow="handleExportFlow"
      @group-selected="handleGroupSelected"
      @ungroup-selected="handleUngroupSelected"
      @simulate="handleSimulate"
      @file-selected="handleFileSelected"
      @open-settings="settingsStore.toggle()"
    />
    <div class="main-area">
      <NodeLibrary />
      <FlowCanvas ref="canvasRef" />
      <ConfigPanel />
    </div>
    <ChatInterface :lf="canvasRef?.getLf()" />
    <SaveHistory
      v-if="saveStore.historyVisible"
      :lf="canvasRef?.getLf()"
      @close="saveStore.historyVisible = false"
      @restore="handleRestore"
    />
    <SettingsPanel />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TopToolbar from './components/TopToolbar.vue'
import NodeLibrary from './components/NodeLibrary.vue'
import FlowCanvas from './components/FlowCanvas.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import SaveHistory from './components/SaveHistory.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ChatInterface from './components/ChatInterface.vue'
import { useSaveStore } from './stores/saveStore'
import { useSettingsStore } from './stores/settingsStore'

const canvasRef = ref(null)
const toolbarRef = ref(null)
const saveStore = useSaveStore()
const settingsStore = useSettingsStore()

function handleNewFlow() {
  if (!confirm('新建将清空当前画布，是否继续？')) return
  canvasRef.value?.newFlow()
}

function handleSaveFlow() {
  canvasRef.value?.saveFlow()
}

function handleShowHistory() {
  canvasRef.value?.saveFlow()
  saveStore.toggleHistory()
}

function handleRestore(saveData) {
  canvasRef.value?.restoreFromSave(saveData)
  saveStore.historyVisible = false
}

function handleImportClick() {
  toolbarRef.value?.triggerFileInput()
}

function handleFileSelected(event) {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      canvasRef.value?.importFlow(data)
    } catch {
      alert('导入失败：无效的 JSON 文件')
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

function handleExportFlow() {
  const flowData = canvasRef.value?.exportFlow()
  if (!flowData || flowData.nodes.length === 0) {
    alert('画布为空，请先添加节点')
    return
  }
  const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `flow_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleGroupSelected() {
  canvasRef.value?.groupSelected()
}

function handleUngroupSelected() {
  canvasRef.value?.ungroupSelected()
}

function handleSimulate() {
  canvasRef.value?.runSimulation()
}
</script>

<style>
@import './styles/global.css';

.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}
.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
