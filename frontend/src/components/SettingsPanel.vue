<template>
  <div v-if="settings.visible" class="settings-overlay" @click.self="settings.toggle()">
    <div class="settings-modal">
      <div class="settings-header">
        <span class="settings-title">设置</span>
        <button class="settings-close" @click="settings.toggle()">×</button>
      </div>
      <div class="settings-body">
        <div class="settings-tabs">
          <button v-for="tab in tabs" :key="tab.id" class="tab-btn" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
            {{ tab.name }}
          </button>
        </div>

        <!-- API Providers Tab -->
        <div v-if="activeTab === 'api'" class="tab-content">
          <div class="provider-tabs">
            <button v-for="p in settings.providers" :key="p.id" class="provider-btn" :class="{ active: settings.activeProvider === p.id }" @click="settings.setActiveProvider(p.id)">
              {{ p.name }}
            </button>
          </div>

          <div class="provider-config">
            <div class="config-row">
              <label class="config-label">API Key</label>
              <div class="password-input-wrapper">
                <input :type="showKey ? 'text' : 'password'" class="notion-input"
                  :value="currentProvider.apiKey"
                  @input="settings.updateProvider(currentProvider.id, 'apiKey', $event.target.value)"
                  placeholder="sk-..." />
                <button class="toggle-key-btn" @click="showKey = !showKey">
                  <svg v-if="!showKey" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
            </div>
            <div class="config-row">
              <label class="config-label">API 地址</label>
              <input class="notion-input"
                :value="currentProvider.baseUrl"
                @input="settings.updateProvider(currentProvider.id, 'baseUrl', $event.target.value)"
                placeholder="https://api.openai.com/v1" />
            </div>
            <div class="config-row">
              <label class="config-label">模型列表</label>
              <div class="model-list">
                <span v-for="m in currentProvider.models" :key="m" class="model-tag">
                  {{ m }}
                  <button class="model-tag-del" @click="settings.removeModel(currentProvider.id, m)">×</button>
                </span>
              </div>
              <div class="add-model-row">
                <input class="notion-input" v-model="newModel" placeholder="输入模型名称添加" @keyup.enter="addModel" />
                <button class="notion-btn" @click="addModel" style="flex-shrink:0">添加</button>
              </div>
            </div>
            <div class="config-row">
              <label class="config-label">默认模型</label>
              <select class="notion-select" :value="settings.defaultModel" @change="settings.setDefaultModel($event.target.value)">
                <option value="">—</option>
                <option v-for="m in currentProvider.models" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>

          <div class="config-divider"></div>
          <div class="config-hint">
            API Key 仅保存在本地浏览器 localStorage 中，不会上传到任何服务器。
          </div>
        </div>

        <!-- About Tab -->
        <div v-if="activeTab === 'about'" class="tab-content about-tab">
          <div class="about-info">
            <h3>fangyu — AI Flow Canvas</h3>
            <p>可视化 AI 工作流编排工具</p>
            <p class="about-version">v1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

const settings = useSettingsStore()
const activeTab = ref('api')
const showKey = ref(false)
const newModel = ref('')

const tabs = [
  { id: 'api', name: 'API 设置' },
  { id: 'about', name: '关于' },
]

const currentProvider = computed(() => {
  return settings.providers.find(p => p.id === settings.activeProvider) || settings.providers[0]
})

function addModel() {
  const m = newModel.value.trim()
  if (m) { settings.addModel(currentProvider.value.id, m); newModel.value = '' }
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-modal {
  width: 560px;
  max-height: 80vh;
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border-color);
}
.settings-title {
  font-size: 16px;
  font-weight: 700;
}
.settings-close {
  background: none;
  border: none;
  font-size: 22px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.settings-close:hover { color: var(--text-primary); }
.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}
.settings-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  padding: 0 20px;
}
.tab-btn {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.tab-btn.active {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}
.tab-btn:hover { color: var(--text-primary); }
.tab-content { padding: 16px 20px 20px; }
.provider-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.provider-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.provider-btn.active {
  background: #37352f;
  color: #fff;
  border-color: #37352f;
}
.provider-btn:hover:not(.active) { background: var(--bg-hover); }
.provider-config { margin-bottom: 8px; }
.config-row { margin-bottom: 14px; }
.config-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}
.password-input-wrapper {
  display: flex;
  gap: 4px;
}
.password-input-wrapper .notion-input { flex: 1; }
.toggle-key-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
}
.toggle-key-btn:hover { background: var(--bg-hover); color: var(--text-secondary); }
.model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.model-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  font-size: 11px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
}
.model-tag-del {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-muted);
  padding: 0;
  line-height: 1;
}
.model-tag-del:hover { color: #e74c3c; }
.add-model-row {
  display: flex;
  gap: 4px;
}
.config-divider {
  height: 1px;
  background: var(--border-light);
  margin: 12px 0;
}
.config-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
.about-tab { text-align: center; padding: 40px 20px; }
.about-info h3 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.about-info p { font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
.about-version { font-size: 12px; color: var(--text-muted); margin-top: 16px; }
</style>
