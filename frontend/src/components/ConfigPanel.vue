<template>
  <div class="config-panel" :class="{ visible: store.configPanelVisible || store.edgeConfigPanelVisible }">
    <div class="panel-header">
      <span class="section-title">节点配置</span>
      <button class="panel-close" @click="store.closeConfig()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div v-if="store.selectedNodeData" class="panel-body">
      <div class="config-section meta-section">
        <div class="meta-row">
          <span class="meta-badge" :style="{ background: meta.categoryColor + '18', color: meta.categoryColor, borderColor: meta.categoryColor }">{{ meta.category }}</span>
          <span class="meta-type">{{ meta.type }}</span>
        </div>
        <div class="meta-name">{{ meta.name }}</div>
        <div class="meta-desc">{{ meta.desc }}</div>
      </div>

      <div class="config-divider"></div>

      <!-- I/O Ports -->
      <div class="ports-section">
        <div v-if="meta.inputSchema.length > 0" class="port-group">
          <div class="port-group-label">输入端口</div>
          <div v-for="port in meta.inputSchema" :key="port.name" class="port-item input-port">
            <span class="port-dot"></span>
            <span class="port-name">{{ port.name }}</span>
            <span class="port-type">{{ port.type }}</span>
            <span v-if="port.required" class="port-required">必填</span>
          </div>
        </div>
        <div v-if="meta.outputSchema.length > 0" class="port-group">
          <div class="port-group-label">输出端口</div>
          <div v-for="port in meta.outputSchema" :key="port.name" class="port-item output-port">
            <span class="port-dot"></span>
            <span class="port-name">{{ port.name }}</span>
            <span class="port-type">{{ port.type }}</span>
          </div>
        </div>
      </div>

      <div class="config-divider"></div>

      <!-- Dynamic Config Fields -->
      <div class="fields-section">
        <div v-for="field in configFields" :key="field.key" class="config-section">
          <label class="config-label">{{ field.label }}</label>

          <input v-if="field.type === 'input'" class="notion-input"
            :value="localConfig[field.key]" @input="update(field.key, $event.target.value)"
            :placeholder="field.placeholder" />

          <input v-if="field.type === 'number'" class="notion-input" type="number"
            :value="localConfig[field.key]" @input="update(field.key, Number($event.target.value))"
            :min="field.min" :max="field.max" :step="field.step" />

          <textarea v-if="field.type === 'textarea'" class="notion-textarea"
            :value="localConfig[field.key]" @input="update(field.key, $event.target.value)"
            :placeholder="field.placeholder" :rows="field.rows || 3"></textarea>

          <div v-if="field.type === 'code'" class="code-editor-wrapper">
            <textarea class="notion-textarea code-area"
              :value="localConfig[field.key]" @input="update(field.key, $event.target.value)"
              :placeholder="field.placeholder" :rows="field.rows || 6" spellcheck="false"></textarea>
          </div>

          <select v-if="field.type === 'select'" class="notion-select"
            :value="localConfig[field.key]" @change="update(field.key, $event.target.value)">
            <option v-for="opt in field.options" :key="opt" :value="opt">{{ String(opt) }}</option>
          </select>

          <div v-if="field.type === 'key-value'" class="kv-editor">
            <div v-for="(val, key, idx) in localConfig[field.key] || {}" :key="idx" class="kv-row">
              <input class="notion-input kv-input" :value="key" @input="renameKv(field.key, key, $event.target.value)" placeholder="键" />
              <input class="notion-input kv-input" :value="val" @input="updateKv(field.key, key, $event.target.value)" placeholder="值" />
              <button class="kv-del" @click="deleteKv(field.key, key)">×</button>
            </div>
            <button class="kv-add" @click="addKv(field.key)">+ 添加</button>
          </div>
        </div>
      </div>

      <!-- Variable Mapping -->
      <div v-if="upstreamOutputs.length > 0" class="config-divider"></div>
      <div v-if="upstreamOutputs.length > 0" class="config-section">
        <label class="config-label">变量映射</label>
        <div class="mapping-hint">上游节点输出映射到当前节点输入</div>
        <div v-for="port in meta.inputSchema" :key="port.name" class="mapping-row">
          <span class="mapping-target">{{ port.name }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted)"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <select class="notion-select mapping-select"
            :value="mappings[port.name] || ''"
            @change="updateMapping(port.name, $event.target.value)">
            <option value="">— 不映射 —</option>
            <option v-for="out in upstreamOutputs" :key="out" :value="out">{{ out }}</option>
          </select>
        </div>
      </div>

      <div class="config-divider"></div>
      <button class="notion-btn save-btn" @click="saveConfig">保存配置</button>
    </div>

    <!-- Edge Config Panel -->
    <div v-else-if="store.edgeConfigPanelVisible && store.selectedEdge" class="panel-body">
      <div class="config-section meta-section">
        <div class="meta-row">
          <span class="meta-badge" style="background:#f0f0ee;color:#666;border-color:#ddd">连线</span>
        </div>
        <div class="meta-name" style="font-size:13px">
          {{ store.selectedEdge.sourceNodeName }} → {{ store.selectedEdge.targetNodeName }}
        </div>
      </div>

      <div class="config-divider"></div>

      <div class="config-section">
        <label class="config-label">连线类型</label>
        <select class="notion-select" :value="edgeLinkType" @change="updateEdgeLinkType($event.target.value)">
          <option value="serial">串行（实线）</option>
          <option value="branch">分支（虚线橙色）</option>
          <option value="parallel">并行（点线紫色）</option>
        </select>
      </div>

      <div class="config-divider"></div>

      <div class="config-section">
        <label class="config-label">变量映射</label>
        <div class="mapping-hint">将上游节点输出映射到下游节点输入</div>
        <div v-for="port in edgeTargetInputs" :key="port.name" class="mapping-row">
          <span class="mapping-target">{{ port.name }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted)"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <select class="notion-select mapping-select"
            :value="edgeMappings[port.name] || ''"
            @change="updateEdgeMapping(port.name, $event.target.value)">
            <option value="">— 不映射 —</option>
            <option v-for="out in edgeSourceOutputs" :key="out" :value="out">{{ out }}</option>
          </select>
        </div>
        <div v-if="edgeTargetInputs.length === 0" class="mapping-hint">下游节点无需输入</div>
      </div>

      <div class="config-divider"></div>
      <button class="notion-btn save-btn" @click="saveEdgeConfig">保存连线配置</button>
    </div>

    <div v-else class="panel-empty">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-muted)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>双击节点或点击连线进行配置</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, shallowRef } from 'vue'
import { useFlowStore } from '../stores/flowStore'
import { getNodeMeta, getOutputSchema, getInputSchema } from '../utils/nodeRegistry'

const store = useFlowStore()
const localConfig = ref({})
const mappings = ref({})
const meta = shallowRef({ inputSchema: [], outputSchema: [], configSchema: [] })

const configFields = computed(() => meta.value.configSchema || [])

const upstreamOutputs = ref([])

// Edge config state
const edgeMappings = ref({})
const edgeLinkType = ref('serial')
const edgeSourceOutputs = ref([])
const edgeTargetInputs = ref([])

watch(() => store.selectedEdge, (edge) => {
  if (!edge) { edgeMappings.value = {}; return }
  edgeMappings.value = { ...(edge.properties?.mappings || {}) }
  edgeLinkType.value = edge.properties?.linkType || 'serial'
  // Compute source outputs and target inputs
  const lf = store.lf
  if (lf) {
    const sourceNode = lf.graphModel.nodes.find(n => n.id === edge.sourceNodeId)
    const targetNode = lf.graphModel.nodes.find(n => n.id === edge.targetNodeId)
    if (sourceNode) {
      const srcMeta = getNodeMeta(sourceNode.properties?.originType || sourceNode.type)
      edgeSourceOutputs.value = (srcMeta.outputSchema || []).map(p => p.name)
    }
    if (targetNode) {
      const tgtMeta = getNodeMeta(targetNode.properties?.originType || targetNode.type)
      edgeTargetInputs.value = (tgtMeta.inputSchema || []).map(p => ({ name: p.name, required: p.required }))
    }
  }
}, { deep: true })

function updateEdgeLinkType(val) {
  edgeLinkType.value = val
  const lf = store.lf
  if (lf && store.selectedEdge) {
    const edgeModel = lf.graphModel.edges.find(e => e.id === store.selectedEdge.id)
    if (edgeModel) {
      edgeModel.setProperties({ ...edgeModel.properties, linkType: val })
    }
  }
}

function updateEdgeMapping(portName, source) {
  edgeMappings.value[portName] = source
  edgeMappings.value = { ...edgeMappings.value }
}

function saveEdgeConfig() {
  store.updateEdgeMappings({ ...edgeMappings.value })
}

function buildUpstreamOutputs() {
  const lf = store.lf
  if (!lf || !store.selectedNode) { upstreamOutputs.value = []; return }
  const nodeId = store.selectedNode.id
  const edges = lf.getGraphData().edges || []
  const upstreamIds = edges.filter(e => e.targetNodeId === nodeId).map(e => e.sourceNodeId)
  const outputs = []
  for (const uid of upstreamIds) {
    const upstreamNode = lf.graphModel.nodes.find(n => n.id === uid)
    if (!upstreamNode) continue
    const upMeta = getNodeMeta(upstreamNode.properties?.originType || upstreamNode.type)
    for (const port of upMeta.outputSchema || []) {
      outputs.push(`${upstreamNode.text?.value || uid}.${port.name}`)
    }
  }
  upstreamOutputs.value = outputs
}

watch(() => store.selectedNodeData, (data) => {
  if (!data) { meta.value = { inputSchema: [], outputSchema: [], configSchema: [] }; return }
  const nodeMeta = getNodeMeta(data.type)
  meta.value = nodeMeta
  const config = data.config || {}
  const defaults = {}
  for (const field of nodeMeta.configSchema) {
    defaults[field.key] = config[field.key] ?? field.default
  }
  localConfig.value = { ...defaults }
  mappings.value = data.mappings || {}
  buildUpstreamOutputs()
}, { immediate: true })

watch(() => store.selectedNode?.id, () => {
  if (store.selectedNode) buildUpstreamOutputs()
})

function update(key, value) {
  localConfig.value[key] = value
}

function updateKv(fieldKey, oldKey, newValue) {
  const obj = { ...localConfig.value[fieldKey] }
  obj[oldKey] = newValue
  localConfig.value[fieldKey] = obj
  localConfig.value = { ...localConfig.value }
}

function renameKv(fieldKey, oldKey, newKey) {
  const obj = { ...localConfig.value[fieldKey] }
  obj[newKey] = obj[oldKey]
  if (newKey !== oldKey) delete obj[oldKey]
  localConfig.value[fieldKey] = obj
  localConfig.value = { ...localConfig.value }
}

function deleteKv(fieldKey, key) {
  const obj = { ...localConfig.value[fieldKey] }
  delete obj[key]
  localConfig.value[fieldKey] = obj
  localConfig.value = { ...localConfig.value }
}

function addKv(fieldKey) {
  const obj = { ...localConfig.value[fieldKey] }
  obj[''] = ''
  localConfig.value[fieldKey] = obj
  localConfig.value = { ...localConfig.value }
}

function updateMapping(portName, source) {
  mappings.value[portName] = source
}

function saveConfig() {
  store.updateNodeConfig({ ...localConfig.value }, { ...mappings.value })
}
</script>

<style scoped>
.config-panel {
  width: var(--panel-width);
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
  flex-shrink: 0;
}
.config-panel:not(.visible) {
  width: 0;
  border-left: none;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 4px;
  border-bottom: 1px solid var(--border-light);
}
.panel-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  display: flex;
}
.panel-close:hover { background: var(--bg-hover); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}

/* Meta section */
.meta-section { margin-bottom: 4px; }
.meta-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.meta-badge {
  font-size: 10px; font-weight: 600; padding: 1px 8px;
  border-radius: 10px; border: 1px solid;
}
.meta-type { font-size: 11px; color: var(--text-muted); font-family: monospace; }
.meta-name { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.meta-desc { font-size: 11px; color: var(--text-secondary); }

/* Ports */
.ports-section { margin-bottom: 4px; }
.port-group { margin-bottom: 8px; }
.port-group-label {
  font-size: 10px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
}
.port-item {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 6px; border-radius: 4px; font-size: 12px; margin-bottom: 2px;
}
.port-item:hover { background: var(--bg-hover); }
.port-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.input-port .port-dot { background: #1890ff; }
.output-port .port-dot { background: #52c41a; }
.port-name { font-weight: 500; color: var(--text-primary); flex: 1; }
.port-type { font-size: 10px; color: var(--text-muted); font-family: monospace; }
.port-required { font-size: 9px; color: #ff4d4f; background: #fff2f0; padding: 0 4px; border-radius: 3px; }

/* Fields */
.fields-section { margin-bottom: 4px; }
.config-section { margin-bottom: 12px; }
.config-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}
.config-divider {
  height: 1px;
  background: var(--border-color);
  margin: 14px 0;
}

/* Form elements */
.notion-textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-primary);
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}
.notion-textarea:focus { border-color: #37352f; }

.code-area {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.5;
  tab-size: 2;
}

.notion-select {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-primary);
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
}
.notion-select:focus { border-color: #37352f; }

.kv-editor { display: flex; flex-direction: column; gap: 4px; }
.kv-row { display: flex; gap: 4px; align-items: center; }
.kv-input { flex: 1; }
.kv-del {
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: var(--text-muted); cursor: pointer;
  border-radius: 4px; font-size: 14px; flex-shrink: 0;
}
.kv-del:hover { background: #fef0ef; color: #e74c3c; }
.kv-add {
  font-size: 11px; padding: 2px 8px; border: 1px dashed var(--border-color);
  border-radius: 4px; background: transparent; cursor: pointer; color: var(--text-muted); width: fit-content;
}
.kv-add:hover { border-color: #37352f; color: #37352f; }

/* Mapping */
.mapping-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; }
.mapping-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
}
.mapping-target {
  font-size: 12px; font-weight: 500; color: var(--text-primary);
  min-width: 60px; font-family: monospace;
}
.mapping-select { flex: 1; }

.save-btn { width: 100%; justify-content: center; }

.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
