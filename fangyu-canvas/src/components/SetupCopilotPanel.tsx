import React, { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AgentCanvasNode } from '../store/agentSlice'
import { authorizeExternalAgent, registerExternalAgent } from '../utils/externalAgent'

interface PreviewPayload {
  discover: {
    rpc_url: string
    card: Record<string, unknown>
    identity?: { agent_id?: string; public_key?: string; require_envelope?: boolean } | null
  }
  preview: {
    name: string
    plain: string
    confirm_prompt: string
    risks: string[]
    skills: string[]
    agent_id?: string
    has_identity: boolean
  }
}

interface Props {
  open: boolean
  onClose: () => void
  onRegistered?: (node: AgentCanvasNode) => void
}

export default function SetupCopilotPanel({ open, onClose, onRegistered }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PreviewPayload | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const preview = useCallback(async () => {
    setLoading(true)
    setError(null)
    setData(null)
    setConfirmed(false)
    try {
      const res = await fetch('/api/v1/setup/copilot/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rpc_url: url.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [url])

  const authorize = useCallback(async () => {
    if (!data || !confirmed) return
    setBusy(true)
    setError(null)
    try {
      const card = data.discover.card as {
        name?: string
        description?: string
        skills?: Array<{ id: string; name: string; description?: string }>
      }
      const identity = data.discover.identity || {}
      const nodeId = `ext_${(identity.agent_id || card.name || 'agent').toString().replace(/\W+/g, '_').slice(0, 24)}`
      const node: AgentCanvasNode = {
        id: nodeId,
        label: data.preview.name,
        type: 'a2a-external',
        position: { x: 120, y: 180 },
        agentCard: {
          name: data.preview.name,
          description: String(card.description || ''),
          version: '1.0.0',
          capabilities: { streaming: false, pushNotifications: false },
          skills: (card.skills || []).map(s => ({
            id: s.id,
            name: s.name,
            description: s.description || '',
          })),
          defaultInterface: { type: 'http', url: data.discover.rpc_url },
        },
        externalConfig: {
          rpcUrl: data.discover.rpc_url,
          agentId: String(identity.agent_id || nodeId),
          publicKey: String(identity.public_key || ''),
          remoteName: data.preview.name,
          authorized: true,
          allowedSkills: ['*'],
        },
      }
      await registerExternalAgent(node)
      await authorizeExternalAgent(node.id, true, ['*'])
      onRegistered?.(node)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [data, confirmed, onRegistered, onClose])

  if (!open) return null

  return createPortal(
    <div
      data-testid="setup-copilot-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 10060,
        background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 520, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto',
        background: 'var(--bg-primary, #fff)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 20, border: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Setup Copilot</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>粘贴外部 Agent URL → 人话确认 → 授权接入</div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <input
          data-testid="setup-copilot-url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:9001 或 .../rpc"
          style={{
            width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8,
            border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'inherit',
          }}
        />
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="button" className="notion-btn primary" disabled={loading || !url.trim()} onClick={preview}>
            {loading ? '发现中…' : '发现并生成确认文案'}
          </button>
        </div>

        {error && <div style={{ marginTop: 10, color: '#dc2626', fontSize: 12 }}>{error}</div>}

        {data && (
          <div data-testid="setup-copilot-preview" style={{ marginTop: 14, fontSize: 12, lineHeight: 1.55 }}>
            <pre style={{
              whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, padding: 12,
              background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)',
            }}>{data.preview.plain}</pre>
            {data.preview.risks.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong>风险提示</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {data.preview.risks.map(r => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
              <span>{data.preview.confirm_prompt}</span>
            </label>
            <button
              type="button"
              className="notion-btn primary"
              style={{ marginTop: 12, opacity: confirmed && !busy ? 1 : 0.5 }}
              disabled={!confirmed || busy}
              onClick={authorize}
            >
              {busy ? '接入中…' : '确认授权并加入画布'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
