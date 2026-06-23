<template>
  <div class="save-history-overlay" @click.self="$emit('close')">
    <div class="save-history-panel">
      <div class="panel-header">
        <span class="panel-title">项目与保存历史</span>
        <button class="panel-close" @click="$emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="panel-body">

        <div class="section-header">
          <span>项目</span>
          <button class="small-btn" @click="handleNewProject">+ 新建</button>
        </div>
        <div class="project-list">
          <div v-for="p in store.projects" :key="p.id"
            class="project-item"
            :class="{ active: p.id === store.currentProjectId }"
            @click="handleSwitchProject(p)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span class="project-name">{{ p.name }}</span>
            <span class="project-count">{{ p.saves.length }}</span>
          </div>
        </div>

        <div class="section-header" style="margin-top:12px">
          <span>保存历史</span>
          <button class="small-btn primary" @click="handleSaveNow">保存当前</button>
        </div>
        <div v-if="!store.currentProject" class="empty-hint">请先创建一个项目</div>
        <div v-else-if="savesByDate.length === 0" class="empty-hint">暂无保存记录</div>
        <div v-else v-for="g in savesByDate" :key="g.date" class="date-group">
          <div class="date-label">{{ g.date }}</div>
          <div v-for="s in g.items" :key="s.id" class="save-item" :class="{ active: activeId === s.id }">
            <div class="save-info" @click="handleRestore(s)">
              <span class="save-name">{{ s.name }}</span>
              <span class="save-time">{{ formatTime(s.time) }}</span>
            </div>
            <button class="save-del" @click="handleDelete(s)" title="删除">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSaveStore } from '../stores/saveStore'
import { convertToExportFormat, convertFromExportFormat } from '../utils/flowHelper'

const emit = defineEmits(['close', 'restore'])
const props = defineProps({ lf: Object })
const store = useSaveStore()
const activeId = ref(null)

const savesByDate = computed(() => {
  if (!store.currentProject) return []
  const map = {}
  for (const s of store.currentProject.saves) {
    const date = new Date(s.time).toLocaleDateString('zh-CN')
    if (!map[date]) map[date] = []
    map[date].push(s)
  }
  return Object.entries(map).map(([date, items]) => ({ date, items }))
})

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function handleNewProject() {
  const name = window.prompt('输入项目名称：', `项目 ${store.projects.length + 1}`)
  if (!name?.trim()) return
  const p = store.createProject(name.trim())
  activeId.value = null
}

function handleSwitchProject(p) {
  if (p.id === store.currentProjectId) return
  if (props.lf) {
    const data = convertToExportFormat(props.lf)
    if (data.nodes?.length) {
      store.addSave('切换前自动保存', data)
    }
  }
  store.switchProject(p.id)
  const latest = p.saves[0]
  if (latest) {
    emit('restore', latest.data)
  } else {
    emit('restore', { nodes: [], links: [] })
  }
  activeId.value = null
}

function handleSaveNow() {
  if (!props.lf) return
  const data = convertToExportFormat(props.lf)
  if (!data.nodes?.length) { alert('画布为空'); return }
  const name = window.prompt('输入保存名称：', `保存 ${(store.currentProject?.saves.length || 0) + 1}`)
  if (!name?.trim()) return
  const last = store.currentProject?.saves[0]
  if (last && JSON.stringify(last.data) === JSON.stringify(data)) {
    alert('内容无变化，未保存'); return
  }
  store.addSave(name.trim(), data)
  activeId.value = store.currentProject?.saves[0]?.id || null
}

function handleRestore(s) {
  if (!confirm(`确定恢复到「${s.name}」吗？`)) return
  activeId.value = s.id
  emit('restore', s.data)
}

function handleDelete(s) {
  if (!confirm(`删除「${s.name}」？`)) return
  store.deleteSave(s.id)
}
</script>

<style scoped>
.save-history-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.2); z-index: 1000;
  display: flex; justify-content: flex-end;
}
.save-history-panel {
  width: 340px; height: 100%; background: var(--bg-primary);
  border-left: 1px solid var(--border-color); display: flex; flex-direction: column;
  animation: slideIn 0.15s ease;
}
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--border-color);
}
.panel-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.panel-close {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; border-radius: 4px; cursor: pointer; color: var(--text-muted);
}
.panel-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.panel-body { flex: 1; overflow-y: auto; padding: 12px 16px; }

.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.section-header span { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.small-btn {
  font-size: 11px; padding: 2px 8px; border: 1px solid var(--border-color);
  border-radius: 4px; background: transparent; cursor: pointer; color: var(--text-muted);
}
.small-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.small-btn.primary { border-color: #37352f; color: #37352f; font-weight: 500; }
.small-btn.primary:hover { background: #37352f; color: #fff; }

.project-list { display: flex; flex-direction: column; gap: 2px; }
.project-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-radius: 6px; cursor: pointer;
  color: var(--text-primary); font-size: 13px;
}
.project-item:hover { background: var(--bg-hover); }
.project-item.active { background: #f0f0ee; font-weight: 600; }
.project-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.project-count { font-size: 11px; color: var(--text-muted); }

.empty-hint { text-align: center; color: var(--text-muted); font-size: 12px; padding: 30px 0; }
.date-group { margin-bottom: 12px; }
.date-label { font-size: 11px; font-weight: 600; color: var(--text-muted); padding: 4px 0; }
.save-item {
  display: flex; align-items: center; gap: 4px; padding: 8px; border-radius: 6px;
  margin-bottom: 4px; transition: background 0.1s;
}
.save-item:hover { background: var(--bg-hover); }
.save-item.active { background: var(--bg-hover); }
.save-info { flex: 1; cursor: pointer; min-width: 0; }
.save-name {
  display: block; font-size: 13px; font-weight: 500; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.save-time { font-size: 11px; color: var(--text-muted); }
.save-del {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; border-radius: 4px; cursor: pointer;
  color: var(--text-muted); opacity: 0; transition: opacity 0.1s;
}
.save-item:hover .save-del { opacity: 1; }
.save-del:hover { color: #e74c3c; background: #fef0ef; }
</style>
