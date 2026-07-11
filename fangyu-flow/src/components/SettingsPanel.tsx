import { useState, useEffect, useCallback } from 'react'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import { store } from '../store'
import {
  updateProvider, addModel, removeModel, setActiveProvider, setDefaultModel,
  toggleSettings, saveSettings,
} from '../store/settingsSlice'
import { CONSTITUTION_POLICY_TEMPLATES, applyPolicyTemplate } from '../utils/constitutionTemplates'

interface ConstitutionPolicy {
  id: string
  enabled?: boolean
  description?: string
  when?: { node_type?: string }
  assert?: { field?: string; op?: string; value?: unknown }
  on_fail?: { rule?: string; action?: 'warn' | 'deny'; message?: string }
}

interface ConstitutionData {
  name?: string
  enabled?: boolean
  values?: string[]
  forbidden_actions?: string[]
  require_audit?: boolean
  policies?: ConstitutionPolicy[]
}

export default function SettingsPanel() {
  const dispatch = useAppDispatch()
  const { providers, activeProvider, defaultModel, visible } = useAppSelector(s => s.settings)
  const [activeTab, setActiveTab] = useState('api')
  const [showKey, setShowKey] = useState(false)
  const [newModel, setNewModel] = useState('')
  const [constitution, setConstitution] = useState<ConstitutionData | null>(null)
  const [draftPolicies, setDraftPolicies] = useState<ConstitutionPolicy[]>([])
  const [auditEntries, setAuditEntries] = useState<{ event: string; ts: number; details?: Record<string, unknown> }[]>([])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const loadConstitution = useCallback(() => {
    fetch('/api/v1/constitution').then(r => r.json()).then((data: ConstitutionData) => {
      setConstitution(data)
      setDraftPolicies(data.policies || [])
    }).catch(() => {})
    fetch('/api/v1/constitution/audit?limit=20').then(r => r.json()).then(d => setAuditEntries(d.entries || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!visible || activeTab !== 'constitution') return
    loadConstitution()
  }, [visible, activeTab, loadConstitution])

  if (!visible) return null

  const currentProvider = providers.find(p => p.id === activeProvider) || providers[0]

  const persistAnd = (action: () => void) => {
    action()
    saveSettings(store.getState as () => ReturnType<typeof store.getState>)
  }

  const updatePolicy = (idx: number, patch: Partial<ConstitutionPolicy>) => {
    setDraftPolicies(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }

  const updatePolicyOnFail = (idx: number, patch: Partial<ConstitutionPolicy['on_fail']>) => {
    setDraftPolicies(prev => prev.map((p, i) => i === idx ? { ...p, on_fail: { ...p.on_fail, ...patch } } : p))
  }

  const addPolicy = () => {
    const id = `policy-${Date.now()}`
    setDraftPolicies(prev => [...prev, {
      id,
      enabled: true,
      description: '新策略',
      when: { node_type: 'llm' },
      assert: { field: 'config.model', op: 'nonempty' },
      on_fail: { rule: id, action: 'warn', message: '策略未通过: {label}' },
    }])
  }

  const applyTemplate = (templateId: string) => {
    const added = applyPolicyTemplate(CONSTITUTION_POLICY_TEMPLATES, templateId, draftPolicies)
    if (added.length === 0) {
      setSaveMsg('模板已存在或未找到')
      return
    }
    setDraftPolicies(prev => [...prev, ...added])
    setSaveMsg(`已应用模板: ${added[0].id}`)
  }

  const removePolicy = (idx: number) => {
    setDraftPolicies(prev => prev.filter((_, i) => i !== idx))
  }

  const saveConstitution = async () => {
    if (!constitution) return
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch('/api/v1/constitution', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...constitution, policies: draftPolicies }),
      })
      const data = await res.json()
      if (data.constitution) {
        setConstitution(data.constitution)
        setDraftPolicies(data.constitution.policies || [])
        setSaveMsg('已保存')
        loadConstitution()
      } else {
        setSaveMsg('保存失败')
      }
    } catch {
      setSaveMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) dispatch(toggleSettings()) }}>
      <div style={{ width: 640, maxHeight: '85vh', background: 'var(--bg-primary)', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>设置</span>
          <button style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
            onClick={() => dispatch(toggleSettings())}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', padding: '0 20px' }}>
            {['api', 'constitution', 'about'].map(tabId => (
              <button key={tabId} style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, border: 'none', background: 'none', color: activeTab === tabId ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderBottom: `2px solid ${activeTab === tabId ? 'var(--text-primary)' : 'transparent'}` }}
                onClick={() => setActiveTab(tabId)}>{tabId === 'api' ? 'API 设置' : tabId === 'constitution' ? '宪法' : '关于'}</button>
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

          {activeTab === 'constitution' && (
            <div style={{ padding: '16px 20px 20px' }}>
              {!constitution ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>加载中...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{constitution.name || '宪法'}</div>
                      <div style={{ fontSize: 11, color: constitution.enabled ? '#52c41a' : '#fa8c16', marginTop: 4 }}>
                        {constitution.enabled ? '已启用' : '已禁用'}
                      </div>
                    </div>
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={constitution.enabled !== false}
                        onChange={e => setConstitution({ ...constitution, enabled: e.target.checked })} />
                      启用宪法
                    </label>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>核心价值观</div>
                    {(constitution.values || []).map((v, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '4px 0', color: 'var(--text-primary)' }}>• {v}</div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>禁止行为（deny）</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(constitution.forbidden_actions || []).map(a => (
                        <span key={a} style={{ fontSize: 11, padding: '2px 8px', background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 12, color: '#cf1322' }}>{a}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>策略模板</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {CONSTITUTION_POLICY_TEMPLATES.map(tpl => (
                        <button key={tpl.id} className="notion-btn" style={{ fontSize: 11, padding: '4px 10px' }}
                          title={tpl.description}
                          onClick={() => applyTemplate(tpl.id)}>
                          + {tpl.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>可组合策略 ({draftPolicies.length})</div>
                      <button className="notion-btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={addPolicy}>+ 添加</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                      {draftPolicies.map((p, idx) => (
                        <div key={p.id || idx} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 10, background: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <input type="checkbox" checked={p.enabled !== false}
                              onChange={e => updatePolicy(idx, { enabled: e.target.checked })} />
                            <input className="notion-input" style={{ flex: 1, fontSize: 12, fontWeight: 600 }}
                              value={p.id} onChange={e => updatePolicy(idx, { id: e.target.value })} />
                            <select className="notion-select" style={{ width: 88, fontSize: 11 }}
                              value={p.on_fail?.action || 'deny'}
                              onChange={e => updatePolicyOnFail(idx, { action: e.target.value as 'warn' | 'deny' })}>
                              <option value="deny">deny</option>
                              <option value="warn">warn</option>
                            </select>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322', fontSize: 16 }}
                              onClick={() => removePolicy(idx)}>×</button>
                          </div>
                          <input className="notion-input" style={{ fontSize: 11, marginBottom: 6, width: '100%' }}
                            placeholder="描述" value={p.description || ''}
                            onChange={e => updatePolicy(idx, { description: e.target.value })} />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                            <input className="notion-input" placeholder="when.node_type"
                              value={p.when?.node_type || ''}
                              onChange={e => updatePolicy(idx, { when: { ...p.when, node_type: e.target.value } })} />
                            <input className="notion-input" placeholder="assert.field"
                              value={p.assert?.field || ''}
                              onChange={e => updatePolicy(idx, { assert: { ...p.assert, field: e.target.value } })} />
                            <select className="notion-select" value={p.assert?.op || 'truthy'}
                              onChange={e => updatePolicy(idx, { assert: { ...p.assert, op: e.target.value } })}>
                              {['truthy', 'nonempty', 'eq', 'neq', 'in', 'not_in', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte'].map(op => (
                                <option key={op} value={op}>{op}</option>
                              ))}
                            </select>
                            <input className="notion-input" placeholder="assert.value (JSON)"
                              value={p.assert?.value !== undefined ? JSON.stringify(p.assert.value) : ''}
                              onChange={e => {
                                try {
                                  const v = e.target.value ? JSON.parse(e.target.value) : undefined
                                  updatePolicy(idx, { assert: { ...p.assert, value: v } })
                                } catch { /* ignore while typing */ }
                              }} />
                          </div>
                          <input className="notion-input" style={{ fontSize: 11, marginTop: 6, width: '100%' }}
                            placeholder="on_fail.message"
                            value={p.on_fail?.message || ''}
                            onChange={e => updatePolicyOnFail(idx, { message: e.target.value })} />
                        </div>
                      ))}
                      {draftPolicies.length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>暂无策略，点击「添加」创建</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <button className="notion-btn" disabled={saving} onClick={saveConstitution}>
                      {saving ? '保存中…' : '保存宪法'}
                    </button>
                    {saveMsg && <span style={{ fontSize: 11, color: saveMsg === '已保存' ? '#52c41a' : '#cf1322' }}>{saveMsg}</span>}
                  </div>

                  <div style={{ marginBottom: 14, fontSize: 11, color: 'var(--text-muted)' }}>
                    deny 阻断执行 · warn 仅警告并写入审计 · 配置持久化到 data/constitution.json
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>最近审计 ({auditEntries.length})</div>
                    <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 11, fontFamily: 'monospace' }}>
                      {auditEntries.length === 0 && <div style={{ color: 'var(--text-muted)' }}>暂无记录</div>}
                      {auditEntries.map((e, i) => (
                        <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                          {new Date(e.ts * 1000).toLocaleTimeString()} · {e.event}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
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
