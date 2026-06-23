<template>
  <div class="node-library">
    <div class="library-header">
      <span class="section-title">原子组件库</span>
      <div class="library-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" v-model="searchQuery" placeholder="搜索组件..." />
      </div>
    </div>
    <div class="library-categories">
      <div v-for="cat in filteredCategories" :key="cat.name" class="category-group">
        <div class="category-header" @click="toggleCategory(cat.name)">
          <svg :style="{ transform: collapsed[cat.name] ? 'rotate(-90deg)' : 'rotate(0deg)' }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="category-dot" :style="{ background: cat.color }"></span>
          <span class="category-name">{{ cat.name }}</span>
          <span class="category-count">{{ cat.nodes.length }}</span>
        </div>
        <div v-if="!collapsed[cat.name]" class="category-nodes">
          <div
            v-for="node in cat.nodes"
            :key="node.type"
            class="library-node"
            @pointerdown.prevent.stop="onDndStart($event, node, cat)"
          >
            <div class="node-icon" :style="{ background: cat.bgColor, borderColor: cat.color }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="cat.color" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div class="node-info">
              <span class="node-name">{{ node.name }}</span>
              <span class="node-desc">{{ node.desc }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="filteredCategories.length === 0" class="empty-search">
        未找到匹配组件
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useFlowStore } from '../stores/flowStore'
import { NODE_CATEGORIES, getNodeMeta, getDefaultConfig } from '../utils/nodeRegistry'

const store = useFlowStore()
const searchQuery = ref('')
const collapsed = ref({})

NODE_CATEGORIES.forEach(c => { collapsed.value[c.name] = false })

const filteredCategories = computed(() => {
  if (!searchQuery.value.trim()) return NODE_CATEGORIES
  const q = searchQuery.value.toLowerCase().trim()
  return NODE_CATEGORIES.map(cat => ({
    ...cat,
    nodes: cat.nodes.filter(n => n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q))
  })).filter(cat => cat.nodes.length > 0)
})

function toggleCategory(name) {
  collapsed.value[name] = !collapsed.value[name]
}

let dragGhost = null

function onDndStart(event, node, cat) {
  event.preventDefault()
  const lf = store.lf
  if (!lf) return

  const meta = getNodeMeta(node.type)
  store.draggedNode = { type: node.type, name: node.name, category: cat.name }

  // 创建一个带样式的鬼影元素跟随鼠标
  dragGhost = document.createElement('div')
  dragGhost.textContent = node.name
  dragGhost.setAttribute('data-drag-ghost', '')
  Object.assign(dragGhost.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    padding: '6px 14px',
    borderRadius: '6px',
    border: '2px solid ' + cat.color,
    background: cat.bgColor,
    color: '#333',
    fontSize: '13px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    opacity: '0.92',
    left: (event.clientX + 16) + 'px',
    top: (event.clientY + 16) + 'px',
  })
  document.documentElement.appendChild(dragGhost)

  const onMove = (e) => {
    dragGhost.style.left = (e.clientX + 16) + 'px'
    dragGhost.style.top = (e.clientY + 16) + 'px'
  }

  const onUp = (e) => {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    if (dragGhost) { dragGhost.remove(); dragGhost = null }

    const rootEl = lf.graphModel?.rootEl
    if (!rootEl) { store.draggedNode = null; return }

    const rect = rootEl.getBoundingClientRect()
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      const point = lf.graphModel.getPointByClient({ x: e.clientX, y: e.clientY })
      const pos = point.canvasOverlayPosition
      lf.addNode({
        type: 'atom-node',
        x: pos.x,
        y: pos.y,
        text: node.name,
        properties: {
          originType: node.type,
          name: meta.name,
          category: cat.name,
          is_group: false,
          config: getDefaultConfig(node.type),
          inner_nodes: [],
          inner_links: [],
        },
      })
    }
    store.draggedNode = null
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
}
</script>

<style scoped>
.node-library {
  width: var(--sidebar-width);
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.library-header {
  padding: 8px 10px 4px;
  border-bottom: 1px solid var(--border-light);
}
.library-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin: 6px 4px 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--text-primary);
  background: transparent;
}
.search-input::placeholder { color: var(--text-muted); }

.library-categories {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.category-group { margin-bottom: 2px; }

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.category-header:hover { background: var(--bg-hover); }

.category-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.category-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
}
.category-count {
  font-size: 11px;
  color: var(--text-muted);
}

.category-nodes {
  padding: 2px 8px 4px;
}

.library-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: grab;
  transition: background 0.1s;
}
.library-node:active { cursor: grabbing; }
.library-node:hover { background: var(--bg-hover); }

.node-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.node-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.node-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.node-desc {
  font-size: 10px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-search {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
