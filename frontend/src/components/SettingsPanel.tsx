import { useState } from 'react'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import { store } from '../store'
import {
  updateProvider, addModel, removeModel, setActiveProvider, setDefaultModel,
  toggleSettings, saveSettings,
} from '../store/settingsSlice'

export default function SettingsPanel() {
  const dispatch = useAppDispatch()
  const { providers, activeProvider, defaultModel, visible } = useAppSelector(s => s.settings)
  const [activeTab, setActiveTab] = useState('api')
  const [showKey, setShowKey] = useState(false)
  const [newModel, setNewModel] = useState('')

  if (!visible) return null

  const currentProvider = providers.find(p => p.id === activeProvider) || providers[0]

  const persistAnd = (action: () => void) => {
    action()
    saveSettings(store.getState as () => ReturnType<typeof store.getState>)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) dispatch(toggleSettings()) }}>
      <div style={{ width: 560, maxHeight: '80vh', background: 'var(--bg-primary)', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>设置</span>
          <button style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
            onClick={() => dispatch(toggleSettings())}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', padding: '0 20px' }}>
            {['api', 'about'].map(tabId => (
              <button key={tabId} style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, border: 'none', background: 'none', color: activeTab === tabId ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderBottom: `2px solid ${activeTab === tabId ? 'var(--text-primary)' : 'transparent'}` }}
                onClick={() => setActiveTab(tabId)}>{tabId === 'api' ? 'API 设置' : '关于'}</button>
            ))}
          </div>

          {activeTab === 'api' && (
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {providers.map(p => (
                  <button key={p.id} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, border: `1px solid ${activeProvider === p.id ? '#37352f' : 'var(--border-color)'}`, borderRadius: 20, background: activeProvider === p.id ? '#37352f' : 'var(--bg-primary)', color: activeProvider === p.id ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => persistAnd(() => dispatch(setActiveProvider(p.id)))}>{p.name}</button>
                ))}
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ marginBottom: 14 }}>
                  <label className="config-label">API Key</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="notion-input" style={{ flex: 1 }} type={showKey ? 'text' : 'password'}
                      value={currentProvider.apiKey}
                      onChange={e => persistAnd(() => dispatch(updateProvider({ id: currentProvider.id, field: 'apiKey', value: e.target.value })))}
                      placeholder="sk-..." />
                    <button style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                      onClick={() => setShowKey(!showKey)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {showKey
                          ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                          : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                        }
                      </svg>
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="config-label">API 地址</label>
                  <input className="notion-input" value={currentProvider.baseUrl}
                    onChange={e => persistAnd(() => dispatch(updateProvider({ id: currentProvider.id, field: 'baseUrl', value: e.target.value })))}
                    placeholder="https://api.openai.com/v1" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="config-label">模型列表</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {currentProvider.models.map(m => (
                      <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', fontSize: 11, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, color: 'var(--text-primary)' }}>
                        {m}
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}
                          onClick={() => persistAnd(() => dispatch(removeModel({ providerId: currentProvider.id, model: m })))}>×</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="notion-input" value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="输入模型名称添加"
                      onKeyUp={e => { if (e.key === 'Enter' && newModel.trim()) { persistAnd(() => dispatch(addModel({ providerId: currentProvider.id, model: newModel.trim() }))); setNewModel('') } }} />
                    <button className="notion-btn" style={{ flexShrink: 0 }}
                      onClick={() => { if (newModel.trim()) { persistAnd(() => dispatch(addModel({ providerId: currentProvider.id, model: newModel.trim() }))); setNewModel('') } }}>添加</button>
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="config-label">默认模型</label>
                  <select className="notion-select" value={defaultModel}
                    onChange={e => persistAnd(() => dispatch(setDefaultModel(e.target.value)))}>
                    <option value="">—</option>
                    {currentProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--border-light)', margin: '12px 0' }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>API Key 保存在后端数据库中，通过后端代理调用 LLM，不会在前端暴露。</div>
            </div>
          )}

          {activeTab === 'about' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>fangyu — AI Flow Canvas</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>可视化 AI 工作流编排工具</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>v1.0.0</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
