/** 工厂离线告警 · 一键再探测 */
import { useState, type MouseEvent } from 'react'
import { heartbeatFactories } from '../utils/externalAgent'

interface Props {
  factoryId: string
  baseUrl?: string
  onDone?: () => void
  compact?: boolean
}

export default function FactoryOfflineRetestButton({
  factoryId,
  baseUrl,
  onDone,
  compact,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)

  const run = async (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!factoryId) return
    setBusy(true)
    setMsg(null)
    setOk(null)
    try {
      const body = await heartbeatFactories({
        factory_ids: [factoryId],
        sync_presence: true,
      })
      const hit = (body.results || []).find(r => r.id === factoryId)
        || (body.results || [])[0]
      const online = hit ? Boolean(hit.ok || hit.online) : body.online > 0
      setOk(online)
      setMsg(
        online
          ? `✓ 已在线${hit?.base_url ? ` · ${hit.base_url}` : ''}`
          : `✗ 仍离线${hit?.error ? ` · ${hit.error}` : ''}`,
      )
      onDone?.()
    } catch (ex) {
      setOk(false)
      setMsg(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="factory-offline-retest" style={{ marginTop: compact ? 4 : 6 }}>
      <button
        type="button"
        className="notion-btn"
        data-testid="factory-offline-retest-btn"
        disabled={busy || !factoryId}
        onClick={(e) => { void run(e) }}
        style={{ fontSize: 11 }}
        title={baseUrl ? `再探测 ${baseUrl}` : '对离线工厂再探测一次'}
      >
        {busy ? '探测中…' : '再探测'}
      </button>
      {msg && (
        <div
          data-testid="factory-offline-retest-result"
          style={{
            marginTop: 4,
            fontSize: 10,
            color: ok ? '#1a7f37' : '#c0392b',
            wordBreak: 'break-word',
          }}
        >
          {msg}
        </div>
      )}
    </div>
  )
}
