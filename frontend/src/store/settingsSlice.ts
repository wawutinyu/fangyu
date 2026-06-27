import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AppDispatch, RootState } from './index'

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
}

interface SettingsState {
  providers: Provider[]
  activeProvider: string
  defaultModel: string
  visible: boolean
}

const DEFAULT_PROVIDERS: Provider[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', apiKey: '', models: ['claude-3.5-sonnet', 'claude-3.5-haiku'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'] },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'custom', name: '自定义', baseUrl: '', apiKey: '', models: [] },
]

function flatten(providers: Provider[], activeProvider: string, defaultModel: string): Record<string, string> {
  const flat: Record<string, string> = { active_provider: activeProvider, default_model: defaultModel }
  for (const p of providers) {
    flat[`${p.id}_api_key`] = p.apiKey || ''
    flat[`${p.id}_base_url`] = p.baseUrl || ''
    if (p.models.length) flat[`${p.id}_models`] = p.models.join(',')
  }
  return flat
}

function unflatten(flat: Record<string, string>): { providers: Provider[]; activeProvider: string; defaultModel: string } {
  const providers = DEFAULT_PROVIDERS.map(d => ({ ...d }))
  for (const p of providers) {
    p.apiKey = flat[`${p.id}_api_key`] || ''
    p.baseUrl = flat[`${p.id}_base_url`] || p.baseUrl
    const modelsStr = flat[`${p.id}_models`]
    if (modelsStr) p.models = modelsStr.split(',').filter(Boolean)
  }
  return {
    providers,
    activeProvider: flat.active_provider || 'openai',
    defaultModel: flat.default_model || 'gpt-4o',
  }
}

const initialState: SettingsState = {
  providers: DEFAULT_PROVIDERS.map(p => ({ ...p })),
  activeProvider: 'deepseek',
  defaultModel: 'deepseek-v4-flash',
  visible: false,
}

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    loadSettings(state, action: PayloadAction<Record<string, string>>) {
      const data = unflatten(action.payload)
      state.providers = data.providers
      state.activeProvider = data.activeProvider
      state.defaultModel = data.defaultModel
    },
    updateProvider(state, action: PayloadAction<{ id: string; field: string; value: string }>) {
      const p = state.providers.find(p => p.id === action.payload.id)
      if (p) {
        (p as Record<string, unknown>)[action.payload.field] = action.payload.value
      }
    },
    addModel(state, action: PayloadAction<{ providerId: string; model: string }>) {
      const p = state.providers.find(p => p.id === action.payload.providerId)
      if (p && action.payload.model && !p.models.includes(action.payload.model)) {
        p.models.push(action.payload.model)
      }
    },
    removeModel(state, action: PayloadAction<{ providerId: string; model: string }>) {
      const p = state.providers.find(p => p.id === action.payload.providerId)
      if (p) p.models = p.models.filter(m => m !== action.payload.model)
    },
    setActiveProvider(state, action: PayloadAction<string>) {
      state.activeProvider = action.payload
    },
    setDefaultModel(state, action: PayloadAction<string>) {
      state.defaultModel = action.payload
    },
    toggleSettings(state) {
      state.visible = !state.visible
    },
  },
})

export const {
  loadSettings, updateProvider, addModel, removeModel,
  setActiveProvider, setDefaultModel, toggleSettings,
} = settingsSlice.actions
export default settingsSlice.reducer

export async function fetchSettings(dispatch: AppDispatch) {
  try {
    const resp = await fetch('/api/v1/settings/')
    if (!resp.ok) return
    const json = await resp.json()
    dispatch(loadSettings(json.settings || {}))
  } catch { /* ignore */ }
}

export async function saveSettings(getState: () => RootState) {
  const state = getState().settings
  const flat = flatten(state.providers, state.activeProvider, state.defaultModel)
  try {
    await fetch('/api/v1/settings/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: flat }),
    })
  } catch { /* ignore */ }
}
