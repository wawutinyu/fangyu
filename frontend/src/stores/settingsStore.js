import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'fangyu-settings'

const DEFAULT_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: '', models: ['claude-3.5-sonnet', 'claude-3.5-haiku'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'] },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'custom', name: '自定义', baseUrl: '', apiKey: '', models: [] },
]

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function persist(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = ref(loadSettings())
  const visible = ref(false)

  const providers = ref((saved.value?.providers || DEFAULT_PROVIDERS).map(p => ({ ...p })))
  const activeProvider = ref(saved.value?.activeProvider || 'openai')
  const defaultModel = ref(saved.value?.defaultModel || 'gpt-4o')

  function getApiKey(providerId) {
    const p = providers.value.find(p => p.id === (providerId || activeProvider.value))
    return p?.apiKey || ''
  }

  function getBaseUrl(providerId) {
    const p = providers.value.find(p => p.id === (providerId || activeProvider.value))
    return p?.baseUrl || ''
  }

  function getModels(providerId) {
    const p = providers.value.find(p => p.id === (providerId || activeProvider.value))
    return p?.models || []
  }

  function getActiveProvider() {
    return providers.value.find(p => p.id === activeProvider.value)
  }

  function updateProvider(id, field, value) {
    const p = providers.value.find(p => p.id === id)
    if (p) { p[field] = value; save() }
  }

  function addModel(providerId, model) {
    const p = providers.value.find(p => p.id === providerId)
    if (p && model && !p.models.includes(model)) { p.models.push(model); save() }
  }

  function removeModel(providerId, model) {
    const p = providers.value.find(p => p.id === providerId)
    if (p) { p.models = p.models.filter(m => m !== model); save() }
  }

  function setActiveProvider(id) {
    activeProvider.value = id; save()
  }

  function setDefaultModel(model) {
    defaultModel.value = model; save()
  }

  function save() {
    persist({
      providers: providers.value.map(p => ({ ...p })),
      activeProvider: activeProvider.value,
      defaultModel: defaultModel.value,
    })
  }

  function toggle() { visible.value = !visible.value }

  return {
    visible, providers, activeProvider, defaultModel,
    getApiKey, getBaseUrl, getModels, getActiveProvider,
    updateProvider, addModel, removeModel,
    setActiveProvider, setDefaultModel,
    toggle, save,
  }
})
