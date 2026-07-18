/** 外部 Agent 授权向导 — 审阅 Card / 勾选技能 / 确认接入 / 部署校验 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentCanvasNode } from '../store/agentSlice'
import {
  completeExternalAuth,
  discoverExternalAgent,
} from '../utils/externalAgent'
import {
  verifyExternalAgentDeploy,
  type VerifyResult,
} from '../utils/verifyExternalAgent'

interface Props {
  open: boolean
  node: AgentCanvasNode | null
  onClose: () => void
  onAuthorized?: (node: AgentCanvasNode, verify?: VerifyResult) => void
}

function skillIdsFromNode(node: AgentCanvasNode): string[] {
  const fromCard = (node.agentCard?.skills || [])
    .map(s => (typeof s === 'string' ? s : s?.id))
    .filter((id): id is string => !!id && String(id).trim().length > 0)
  const fromCfg = node.externalConfig?.allowedSkills || []
  if (fromCfg.length && !(fromCfg.length === 1 && fromCfg[0] === '*')) {
    return fromCfg.filter(Boolean)
  }
  return fromCard.length ? fromCard : ['default']
}

export default function ExternalAgentAuthWizard({ open, node, onClose, onAuthorized }: Props) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [localNode, setLocalNode] = useState<AgentCanvasNode | null>(null)
  const [authorizedNode, setAuthorizedNode] = useState<AgentCanvasNode | null>(null)
  const [verify, setVerify] = useState<VerifyResult | null>(null)

  useEffect(() => {
    if (!open || !node) return
    setLocalNode(node)
    setSelected(skillIdsFromNode(node))
    setConfirmed(false)
    setError(null)
    setStep(0)
    setAuthorizedNode(null)
    setVerify(null)
  }, [open, node])

  const skills = useMemo(() => {
    const n = localNode
    if (!n) return [] as Array<{ id: string; name: string; description?: string }>
    const list = n.agentCard?.skills || []
    if (!list.length) return [{ id: 'default', name: 'default' }]
    return list.map(s => {
      if (typeof s === 'string') return { id: s, name: s }
      return { id: s.id || 'default', name: s.name || s.id || 'default', description: s.description }
    })
  }, [localNode])

  const toggle = (id: string) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const refreshCard = useCallback(async () => {
    if (!localNode?.externalConfig?.rpcUrl) return
    setRefreshing(true)
    setError(null)
    try {
      const discovered = await discoverExternalAgent(localNode.externalConfig.rpcUrl)
      const card = discovered.card
      const ids = (card.skills || [])
        .map(s => (typeof s === 'string' ? s : s?.id))
        .filter((id): id is string => !!id)
      setLocalNode(prev => {
        if (!prev) return prev
        return {
          ...prev,
          agentCard: {
            ...(prev.agentCard || { name: prev.label, version: '1.0.0', capabilities: { streaming: false, pushNotifications: false }, skills: [] }),
            ...card,
            name: card.name || prev.label,
            skills: card.skills?.length ? card.skills : prev.agentCard?.skills,
          },
          externalConfig: {
            ...prev.externalConfig!,
            rpcUrl: discovered.rpc_url || prev.externalConfig!.rpcUrl,
            agentId: discovered.identity?.agent_id || prev.externalConfig!.agentId,
            publicKey: discovered.identity?.public_key || prev.externalConfig!.publicKey,
            remoteName: card.name || prev.externalConfig!.remoteName,
          },
        }
      })
      if (ids.length) setSelected(ids)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [localNode])

  const runVerify = useCallback(async (target: AgentCanvasNode) => {
    setBusy(true)
    setError(null)
    try {
      const result = await verifyExternalAgentDeploy(target)
      setVerify(result)
      return result
    } catch (e) {
      const fail: VerifyResult = {
        ok: false,
        steps: [{ id: 'error', label: '校验异常', ok: false, detail: e instanceof Error ? e.message : String(e) }],
      }
      setVerify(fail)
      return fail
    } finally {
      setBusy(false)
    }
  }, [])

  const submit = useCallback(async () => {
    if (!localNode || !confirmed || selected.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const next: AgentCanvasNode = {
        ...localNode,
        externalConfig: {
          ...(localNode.externalConfig || {
            rpcUrl: '', agentId: '', publicKey: '', remoteName: '', authorized: false, allowedSkills: [],
          }),
          authorized: true,
          allowedSkills: selected,
        },
      }
      const done = await completeExternalAuth(next, selected)
      setAuthorizedNode(done)
      setStep(3)
      setBusy(false)
      await runVerify(done)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }, [localNode, confirmed, selected, runVerify])

  const finish = useCallback(() => {
    const n = authorizedNode || localNode
    if (!n) return
    onAuthorized?.(n, verify || undefined)
    onClose()
  }, [authorizedNode, localNode, verify, onAuthorized, onClose])

  if (!open || !localNode) return null

  const ext = localNode.externalConfig

  return createPortal(
    <div
      data-testid="external-auth-wizard"
      style={{
        position: 'fixed', inset: 0, zIndex: 10065,
        background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget && step !== 3) onClose() }}
    >
      <div style={{
        width: 520, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto',
        background: 'var(--bg-primary, #fff)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 20, border: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>外部 Agent 授权</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              审阅 → 技能 → 确认 → 部署校验
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, fontSize: 11, flexWrap: 'wrap' }}>
          {(['审阅', '技能', '确认', '校验'] as const).map((label, i) => (
            <button
              key={label}
              type="button"
              className="notion-btn"
              style={{ fontWeight: step === i ? 600 : 400, opacity: step === i ? 1 : 0.7 }}
              onClick={() => {
                if (i < 3 || authorizedNode) setStep(i as 0 | 1 | 2 | 3)
              }}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {error && <div style={{ marginBottom: 10, color: '#dc2626', fontSize: 12 }}>{error}</div>}

        {step === 0 && (
          <div data-testid="external-auth-review" style={{ fontSize: 12, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{localNode.label}</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
              {localNode.agentCard?.description || '无描述'}
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div>RPC：<code>{ext?.rpcUrl || '—'}</code></div>
              <div style={{ marginTop: 4 }}>远程名：{ext?.remoteName || localNode.agentCard?.name || '—'}</div>
              <div style={{ marginTop: 4 }}>Agent ID：{ext?.agentId || '—'}</div>
              <div style={{ marginTop: 4 }}>状态：{ext?.authorized ? '已授权' : '待授权'}</div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" className="notion-btn" disabled={refreshing} onClick={() => void refreshCard()}>
                {refreshing ? '刷新中…' : '重新探测 Card'}
              </button>
              <button type="button" className="notion-btn primary" onClick={() => setStep(1)}>
                下一步：技能
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div data-testid="external-auth-skills" style={{ fontSize: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button type="button" className="notion-btn" style={{ fontSize: 11 }} onClick={() => setSelected(skills.map(s => s.id))}>
                全选
              </button>
              <button type="button" className="notion-btn" style={{ fontSize: 11 }} onClick={() => setSelected([])}>
                清空
              </button>
              <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>
                已选 {selected.length}/{skills.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflow: 'auto' }}>
              {skills.map(s => (
                <label
                  key={s.id}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-light)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => toggle(s.id)}
                    data-testid={`external-auth-skill-${s.id}`}
                  />
                  <span>
                    <strong>{s.name}</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({s.id})</span>
                    {s.description && (
                      <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{s.description}</div>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" className="notion-btn" onClick={() => setStep(0)}>上一步</button>
              <button
                type="button"
                className="notion-btn primary"
                disabled={selected.length === 0}
                onClick={() => setStep(2)}
              >
                下一步：确认
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div data-testid="external-auth-confirm" style={{ fontSize: 12, lineHeight: 1.55 }}>
            <p style={{ margin: '0 0 10px' }}>
              将把「{localNode.label}」注册为外部 Agent，并授权技能：
              <strong> {selected.join(', ') || '（无）'}</strong>。
            </p>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 12px' }}>
              组织 ACL 启用时，调用还需成员具备 <code>agent:call:external:*</code>。
            </p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                data-testid="external-auth-confirm-check"
              />
              <span>我已审阅对方 Card 与技能范围，确认授权接入本厂编排。</span>
            </label>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" className="notion-btn" onClick={() => setStep(1)}>上一步</button>
              <button
                type="button"
                className="notion-btn primary"
                disabled={!confirmed || busy || selected.length === 0}
                onClick={() => void submit()}
                data-testid="external-auth-submit"
              >
                {busy ? '接入中…' : '注册并授权'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div data-testid="external-auth-verify" style={{ fontSize: 12, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              部署校验
              {verify && (
                <span style={{ marginLeft: 8, color: verify.ok ? '#1a7f37' : '#c0392b', fontWeight: 400 }}>
                  {verify.ok ? '通过' : '未完全通过'}
                </span>
              )}
              {!verify && busy && <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400 }}>校验中…</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(verify?.steps || []).map(s => (
                <div
                  key={s.id}
                  data-testid={`external-auth-verify-${s.id}`}
                  style={{
                    padding: '8px 10px', borderRadius: 6,
                    border: '1px solid var(--border-light)',
                    borderLeft: `3px solid ${s.ok ? '#52c41a' : '#dc2626'}`,
                  }}
                >
                  <strong>{s.ok ? '✓' : '✗'} {s.label}</strong>
                  {s.detail && (
                    <div style={{ color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-word' }}>{s.detail}</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="notion-btn"
                disabled={busy || !authorizedNode}
                onClick={() => authorizedNode && void runVerify(authorizedNode)}
              >
                {busy ? '校验中…' : '重试校验'}
              </button>
              <button
                type="button"
                className="notion-btn primary"
                onClick={finish}
                data-testid="external-auth-finish"
              >
                完成
              </button>
            </div>
            {verify && !verify.ok && (
              <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 11 }}>
                授权已写入；对端不可达时可稍后重试。完成仍会把节点标为已授权。
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
