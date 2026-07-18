import React, { useCallback, useEffect, useState } from 'react'
import { CONSTITUTION_POLICY_TEMPLATES, applyPolicyTemplate } from '../utils/constitutionTemplates'
import { explainAuditEntry } from '../utils/lawExplain'

interface ConstitutionData {
  name?: string
  version?: string
  enabled?: boolean
  values?: string[]
  forbidden_actions?: string[]
  forbidden_node_types?: string[]
  require_audit?: boolean
  policies?: Policy[]
}

interface Policy {
  id: string
  description?: string
  enabled?: boolean
  when?: { node_type?: string; node_type_in?: string[] }
  assert?: { field?: string; op?: string; value?: unknown }
  on_fail?: { action?: 'warn' | 'deny'; message?: string }
}

interface AuditEntry {
  ts?: number
  event?: string
  details?: Record<string, unknown>
  hash?: string
}

/** 方隅·律 — 宪法 / 审计一等门面 */
export default function LawPanel() {
  const [constitution, setConstitution] = useState<ConstitutionData | null>(null)
  const [draftPolicies, setDraftPolicies] = useState<Policy[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [chain, setChain] = useState<{ valid?: boolean; checked?: number; reason?: string } | null>(null)
  const [forbidAction, setForbidAction] = useState('')
  const [forbidNode, setForbidNode] = useState('')
  const [bundleDir, setBundleDir] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [c, a, v] = await Promise.all([
        fetch('/api/v1/constitution').then(r => r.json()),
        fetch('/api/v1/constitution/audit?limit=80').then(r => r.json()),
        fetch('/api/v1/constitution/audit/verify?limit=200').then(r => r.json()),
      ])
      setConstitution(c)
      setDraftPolicies(c.policies || [])
      setAudit(a.entries || [])
      setChain(v)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const save = async () => {
    if (!constitution) return
    setSaving(true)
    setMsg(null)
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
      }
      setMsg('已保存')
      await reload()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const applyTemplate = (id: string) => {
    const added = applyPolicyTemplate(CONSTITUTION_POLICY_TEMPLATES, id, draftPolicies)
    if (added.length === 0) {
      setMsg('模板已存在或未找到')
      return
    }
    setDraftPolicies(prev => [...prev, ...added])
    setMsg(null)
  }

  return (
    <div
      data-testid="law-panel"
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>方隅·律</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            宪法约束 · 审计链 · 策略 — 社会的「法律」门面
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {chain && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: chain.valid ? '#16a34a' : '#dc2626',
          }}>
            审计链 {chain.valid ? '完整' : '异常'}（检查 {chain.checked ?? 0}）
          </span>
        )}
        <button type="button" className="notion-btn" style={{ fontSize: 11 }} onClick={reload}>刷新</button>
        <button
          type="button"
          className="notion-btn primary"
          style={{ fontSize: 11, opacity: saving ? 0.6 : 1 }}
          disabled={saving || !constitution}
          onClick={save}
        >
          {saving ? '保存中…' : '保存宪法'}
        </button>
      </div>

      {error && <div style={{ padding: 12, color: '#dc2626', fontSize: 12 }}>{error}</div>}
      {msg && <div style={{ padding: '8px 16px', fontSize: 12, color: '#16a34a' }}>{msg}</div>}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {!constitution ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中…</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{constitution.name || '宪法'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    v{constitution.version || '1.0'} · {constitution.enabled !== false ? '已启用' : '已禁用'}
                  </div>
                </div>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={constitution.enabled !== false}
                    onChange={e => setConstitution({ ...constitution, enabled: e.target.checked })}
                  />
                  启用
                </label>
              </div>

              <section style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>核心价值观</div>
                {(constitution.values || []).map((v, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '3px 0' }}>• {v}</div>
                ))}
              </section>

              <section style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>禁止行为</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {(constitution.forbidden_actions || []).map(a => (
                    <span key={a} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 12,
                      background: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      {a}
                      <button
                        type="button"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cf1322', padding: 0 }}
                        onClick={() => setConstitution({
                          ...constitution,
                          forbidden_actions: (constitution.forbidden_actions || []).filter(x => x !== a),
                        })}
                      >×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="notion-input"
                    style={{ flex: 1, fontSize: 11 }}
                    placeholder="新增禁止行为 id"
                    value={forbidAction}
                    onChange={e => setForbidAction(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      const v = forbidAction.trim()
                      if (!v) return
                      const cur = constitution.forbidden_actions || []
                      if (!cur.includes(v)) {
                        setConstitution({ ...constitution, forbidden_actions: [...cur, v] })
                      }
                      setForbidAction('')
                    }}
                  />
                  <button
                    type="button"
                    className="notion-btn"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      const v = forbidAction.trim()
                      if (!v) return
                      const cur = constitution.forbidden_actions || []
                      if (!cur.includes(v)) {
                        setConstitution({ ...constitution, forbidden_actions: [...cur, v] })
                      }
                      setForbidAction('')
                    }}
                  >添加</button>
                </div>
              </section>

              <section style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>禁止节点类型</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {(constitution.forbidden_node_types || []).map(a => (
                    <span key={a} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 12,
                      background: '#fff7e6', border: '1px solid #ffd591', color: '#d46b08',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      {a}
                      <button
                        type="button"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#d46b08', padding: 0 }}
                        onClick={() => setConstitution({
                          ...constitution,
                          forbidden_node_types: (constitution.forbidden_node_types || []).filter(x => x !== a),
                        })}
                      >×</button>
                    </span>
                  ))}
                  {!(constitution.forbidden_node_types || []).length && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>（空 = 不额外禁节点类型）</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="notion-input"
                    style={{ flex: 1, fontSize: 11 }}
                    placeholder="如 shell / code_exec"
                    value={forbidNode}
                    onChange={e => setForbidNode(e.target.value)}
                  />
                  <button
                    type="button"
                    className="notion-btn"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      const v = forbidNode.trim()
                      if (!v) return
                      const cur = constitution.forbidden_node_types || []
                      if (!cur.includes(v)) {
                        setConstitution({ ...constitution, forbidden_node_types: [...cur, v] })
                      }
                      setForbidNode('')
                    }}
                  >添加</button>
                </div>
              </section>

              <section style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Bundle 宪法</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="notion-input"
                    style={{ flex: 1, minWidth: 160, fontSize: 11 }}
                    placeholder="Bundle 目录绝对路径"
                    value={bundleDir}
                    onChange={e => setBundleDir(e.target.value)}
                  />
                  <button
                    type="button"
                    className="notion-btn"
                    style={{ fontSize: 11 }}
                    disabled={saving || !bundleDir.trim()}
                    onClick={async () => {
                      setSaving(true)
                      setMsg(null)
                      try {
                        const res = await fetch('/api/v1/constitution/from-bundle', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ bundle_dir: bundleDir.trim() }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.detail || '加载失败')
                        setConstitution(data.constitution)
                        setDraftPolicies(data.constitution?.policies || [])
                        setMsg('已从 Bundle 载入平台宪法')
                      } catch (e) {
                        setMsg(e instanceof Error ? e.message : String(e))
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >从 Bundle 载入</button>
                  <button
                    type="button"
                    className="notion-btn"
                    style={{ fontSize: 11 }}
                    disabled={saving || !bundleDir.trim()}
                    onClick={async () => {
                      setSaving(true)
                      setMsg(null)
                      try {
                        const res = await fetch('/api/v1/constitution/to-bundle', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            bundle_dir: bundleDir.trim(),
                            constitution: { ...constitution, policies: draftPolicies },
                          }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.detail || '写入失败')
                        setMsg(`已写入 ${data.path}`)
                      } catch (e) {
                        setMsg(e instanceof Error ? e.message : String(e))
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >写入 Bundle</button>
                </div>
              </section>

              <section style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>策略模板</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CONSTITUTION_POLICY_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      className="notion-btn"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      title={tpl.description}
                      onClick={() => applyTemplate(tpl.id)}
                    >
                      + {tpl.name}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  可组合策略（{draftPolicies.length}）
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {draftPolicies.map((p, idx) => (
                    <div key={p.id || idx} style={{
                      border: '1px solid var(--border-color)', borderRadius: 8, padding: 10,
                      background: 'var(--bg-secondary)', fontSize: 11,
                    }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={p.enabled !== false}
                          onChange={e => {
                            const next = [...draftPolicies]
                            next[idx] = { ...p, enabled: e.target.checked }
                            setDraftPolicies(next)
                          }}
                        />
                        <strong style={{ flex: 1 }}>{p.id}</strong>
                        <span style={{
                          color: (p.on_fail?.action || 'deny') === 'deny' ? '#dc2626' : '#ca8a04',
                        }}>
                          {p.on_fail?.action || 'deny'}
                        </span>
                        <button
                          type="button"
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}
                          onClick={() => setDraftPolicies(draftPolicies.filter((_, i) => i !== idx))}
                        >×</button>
                      </div>
                      {p.description && <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>{p.description}</div>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        <div style={{
          width: 360, maxWidth: '45vw', borderLeft: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)',
        }}>
          <div style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--border-color)' }}>
            审计日志
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }} data-testid="law-audit">
            {audit.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>暂无审计</div>
            )}
            {audit.map((entry, i) => {
              const plain = explainAuditEntry(entry)
              return (
              <div key={`${entry.ts}-${i}`} style={{
                padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                fontSize: 11, lineHeight: 1.4,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{plain.title}</strong>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {entry.ts ? new Date(entry.ts * 1000).toLocaleString() : ''}
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>{plain.plain}</div>
                <div style={{ marginTop: 4, color: '#2563eb' }}>下一步：{plain.nextStep}</div>
                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 10 }}>{entry.event}</div>
              </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
