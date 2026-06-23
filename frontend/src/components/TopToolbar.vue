<template>
  <div class="top-toolbar">
    <div class="toolbar-left">
      <span class="toolbar-brand">fangyu</span>
    </div>
    <div class="toolbar-center">
      <button class="notion-btn" @click="$emit('new-flow')" title="新建画布">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新建
      </button>
      <button class="notion-btn primary" @click="$emit('save-flow')" title="保存 Ctrl+S">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        保存
      </button>
      <button class="notion-btn" @click="$emit('show-history')" title="保存历史">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        历史
      </button>
      <button class="notion-btn" @click="$emit('import-flow')" title="导入流程JSON">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        导入
      </button>
      <button class="notion-btn" @click="$emit('export-flow')" title="导出流程JSON">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        导出
      </button>
      <div class="toolbar-divider"></div>
      <button class="notion-btn" @click="$emit('group-selected')" title="封装为组合原子">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        组合
      </button>
      <button class="notion-btn" @click="$emit('ungroup-selected')" title="展开组合原子">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>
        展开
      </button>
      <div class="toolbar-divider"></div>
      <button class="notion-btn primary" @click="$emit('simulate')" title="模拟运行">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        模拟运行
      </button>
    </div>
    <div class="toolbar-right">
      <button class="notion-btn toolbar-icon-btn" @click="$emit('open-settings')" title="设置">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      <span class="toolbar-hint">v1.0</span>
    </div>
    <input ref="fileInput" type="file" accept=".json" style="display:none" @change="$emit('file-selected', $event)">
  </div>
</template>

<script setup>
import { ref } from 'vue'

const fileInput = ref(null)

defineEmits(['new-flow', 'save-flow', 'import-flow', 'export-flow', 'group-selected', 'ungroup-selected', 'simulate', 'file-selected', 'show-history', 'open-settings'])

function triggerFileInput() {
  fileInput.value?.click()
}

defineExpose({ triggerFileInput })
</script>

<style scoped>
.top-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  user-select: none;
  flex-shrink: 0;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 100px;
}
.toolbar-brand {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}
.toolbar-center {
  display: flex;
  align-items: center;
  gap: 4px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 100px;
  justify-content: flex-end;
}
.toolbar-hint {
  font-size: 11px;
  color: var(--text-muted);
}
.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 4px;
}
</style>
