import { describe, it, expect, beforeEach } from 'vitest'
import settingsReducer, {
  loadSettings, updateProvider, addModel, removeModel,
  setActiveProvider, setDefaultModel, toggleSettings,
} from '../settingsSlice'
import type { Provider } from '../settingsSlice'

const DEFAULT_PROVIDERS: Provider[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', apiKey: '', models: ['claude-3.5-sonnet', 'claude-3.5-haiku'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'] },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'custom', name: '自定义', baseUrl: '', apiKey: '', models: [] },
]

interface SettingsState {
  providers: Provider[]
  activeProvider: string
  defaultModel: string
  visible: boolean
}

describe('settingsSlice', () => {
  let initial: SettingsState

  beforeEach(() => {
    initial = {
      providers: DEFAULT_PROVIDERS.map(p => ({ ...p, models: [...p.models] })),
      activeProvider: 'deepseek',
      defaultModel: 'deepseek-v4-flash',
      visible: false,
    }
  })

  describe('loadSettings', () => {
    it('loads settings from flattened key-value pairs', () => {
      const flat: Record<string, string> = {
        active_provider: 'openai',
        default_model: 'gpt-4o',
        openai_api_key: 'sk-xxx',
        openai_base_url: 'https://custom.openai.com',
        openai_models: 'gpt-4o,gpt-4-turbo',
        deepseek_api_key: 'sk-ds',
        anthropic_models: 'claude-3.5-sonnet,claude-opus',
      }
      const state = settingsReducer(initial, loadSettings(flat))
      expect(state.activeProvider).toBe('openai')
      expect(state.defaultModel).toBe('gpt-4o')
      expect(state.providers.find(p => p.id === 'openai')!.apiKey).toBe('sk-xxx')
      expect(state.providers.find(p => p.id === 'openai')!.baseUrl).toBe('https://custom.openai.com')
      expect(state.providers.find(p => p.id === 'openai')!.models).toEqual(['gpt-4o', 'gpt-4-turbo'])
      expect(state.providers.find(p => p.id === 'deepseek')!.apiKey).toBe('sk-ds')
      expect(state.providers.find(p => p.id === 'anthropic')!.models).toContain('claude-opus')
    })

    it('falls back to defaults when fields are missing', () => {
      const flat: Record<string, string> = {}
      const state = settingsReducer(initial, loadSettings(flat))
      expect(state.activeProvider).toBe('openai')
      expect(state.defaultModel).toBe('gpt-4o')
      expect(state.providers.find(p => p.id === 'openai')!.baseUrl).toBe('https://api.openai.com/v1')
    })
  })

  describe('updateProvider', () => {
    it('updates a field on the specified provider', () => {
      const state = settingsReducer(initial, updateProvider({ id: 'deepseek', field: 'apiKey', value: 'new-deepseek-key' }))
      expect(state.providers.find(p => p.id === 'deepseek')!.apiKey).toBe('new-deepseek-key')
    })

    it('updates baseUrl of a provider', () => {
      const state = settingsReducer(initial, updateProvider({ id: 'openai', field: 'baseUrl', value: 'https://alt.openai.com' }))
      expect(state.providers.find(p => p.id === 'openai')!.baseUrl).toBe('https://alt.openai.com')
    })

    it('does nothing if provider id is not found', () => {
      const state = settingsReducer(initial, updateProvider({ id: 'nonexistent', field: 'apiKey', value: 'x' }))
      expect(state.providers).toEqual(initial.providers)
    })
  })

  describe('addModel', () => {
    it('adds a model to a provider', () => {
      const state = settingsReducer(initial, addModel({ providerId: 'deepseek', model: 'deepseek-new-model' }))
      expect(state.providers.find(p => p.id === 'deepseek')!.models).toContain('deepseek-new-model')
    })

    it('does not add duplicate models', () => {
      const state = settingsReducer(initial, addModel({ providerId: 'deepseek', model: 'deepseek-v4-flash' }))
      expect(state.providers.find(p => p.id === 'deepseek')!.models.length).toBe(4)
    })

    it('does not add empty string model', () => {
      const state = settingsReducer(initial, addModel({ providerId: 'deepseek', model: '' }))
      expect(state.providers.find(p => p.id === 'deepseek')!.models.length).toBe(4)
    })

    it('does nothing if provider does not exist', () => {
      const prevModels = initial.providers.map(p => ({ ...p, models: [...p.models] }))
      const state = settingsReducer(initial, addModel({ providerId: 'missing', model: 'model-x' }))
      expect(state.providers).toEqual(prevModels)
    })
  })

  describe('removeModel', () => {
    it('removes a model from a provider', () => {
      const state = settingsReducer(initial, removeModel({ providerId: 'deepseek', model: 'deepseek-v4-flash' }))
      const models = state.providers.find(p => p.id === 'deepseek')!.models
      expect(models).not.toContain('deepseek-v4-flash')
      expect(models).toHaveLength(3)
    })

    it('does nothing if model not in list', () => {
      const state = settingsReducer(initial, removeModel({ providerId: 'deepseek', model: 'nonexistent-model' }))
      expect(state.providers.find(p => p.id === 'deepseek')!.models.length).toBe(4)
    })

    it('does nothing if provider does not exist', () => {
      const state = settingsReducer(initial, removeModel({ providerId: 'missing', model: 'anything' }))
      expect(state.providers).toEqual(initial.providers)
    })
  })

  describe('setActiveProvider', () => {
    it('sets active provider', () => {
      const state = settingsReducer(initial, setActiveProvider('anthropic'))
      expect(state.activeProvider).toBe('anthropic')
    })
  })

  describe('setDefaultModel', () => {
    it('sets default model', () => {
      const state = settingsReducer(initial, setDefaultModel('gpt-4o'))
      expect(state.defaultModel).toBe('gpt-4o')
    })
  })

  describe('toggleSettings', () => {
    it('toggles visible from false to true', () => {
      const state = settingsReducer(initial, toggleSettings())
      expect(state.visible).toBe(true)
    })

    it('toggles visible from true to false', () => {
      const pre = { ...initial, visible: true }
      const state = settingsReducer(pre, toggleSettings())
      expect(state.visible).toBe(false)
    })
  })
})
