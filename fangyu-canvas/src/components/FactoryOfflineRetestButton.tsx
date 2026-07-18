/** 工厂离线 · 单厂 / 批量再探测 */
import { useState, type MouseEvent } from 'react'
import { heartbeatFactories } from '../utils/externalAgent'
import { emitPresenceEvent } from '../utils/presenceApi'

export function offlineFactoryIds(
  factories: Array<{ id?: string; online?: boolean | null }>,
): string[] {
  return factories
    .filter(f => f.id && f.online === false)
    .map(f => String(f.id))
}

interface Props {
  factoryId?: string
  factoryIds?: string[]
  baseUrl?: string
  label?: string
  onDone?: () => void
  compact?: boolean
  /** 写观事件；默认批量时写入 */
  emitPresence?: boolean
}

export default function FactoryOfflineRetestButton({
  factoryId,
  factoryIds,
  baseUrl,
  label,
  onDone,
  compact,
  emitPresence,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)

  const ids = (factoryIds && factoryIds.length > 0)
    ? factoryIds
    : (factoryId ? [factoryId] : [])
  const batch = ids.length > 1 || (factoryIds != null && factoryIds.length >= 1)
  const shouldEmit = emitPresence ?? batch

  const run = async (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (ids.length === 0) return
    setBusy(true)
    setMsg(null)
    setOk(null)
    try {
      const body = await heartbeatFactories({
        factory_ids: ids,
        sync_presence: true,
      })
      const online = body.online ?? 0
      const total = body.total ?? ids.length
      const offline = body.offline ?? Math.max(0, total - online)
      if (batch) {
        const allOk = online >= total && total > 0
        setOk(allOk || online > 0)
        setMsg(
          allOk
            ? `✓ 全部在线 ${online}/${total}`
            : `再探测 ${online}/${total} 在线${offline ? ` · 仍离线 ${offline}` : ''}`,
        )
      } else {
        const one = ids[0]
        const hit = (body.results || []).find(r => r.id === one)
          || (body.results || [])[0]
        const oneOk = hit ? Boolean(hit.ok || hit.online) : online > 0
        setOk(oneOk)
        setMsg(
          oneOk
            ? `✓ 已在线${hit?.base_url ? ` · ${hit.base_url}` : ''}`
            : `✗ 仍离线${hit?.error ? ` · ${hit.error}` : ''}`,
        )
      }
      if (shouldEmit) {
        const allOk = online >= total && total > 0
        void emitPresenceEvent({
          kind: 'factory.retest',
          actor: 'ops:factory_retest',
          message: batch
            ? `批量再探测 · ${online}/${total} 在线`
            : `再探测 · ${ids[0]} ${online > 0 ? '在线' : '离线'}`,
          detail: {
            factory_ids: ids,
            online,
            offline,
            total,
            batch,
            results: (body.results || []).slice(0, 20),
          },
          severity: allOk ? 'info' : 'warn',
        })
      }
      onDone?.()
    } catch (ex) {
      setOk(false)
      setMsg(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  const btnLabel = label
    || (batch ? `批量再探测 (${ids.length})` : '再探测')

  return (
    <div
      data-testid={batch ? 'eval-offline-retest-batch' : 'factory-offline-retest'}
      style={{ marginTop: compact ? 4 : 6 }}
    >
      <button
        type="button"
        className="notion-btn"
        data-testid={batch ? 'eval-offline-retest-batch-btn' : 'factory-offline-retest-btn'}
        disabled={busy || ids.length === 0}
        onClick={(e) => { void run(e) }}
        style={{ fontSize: 11 }}
        title={
          batch
            ? `再探测 ${ids.length} 个离线厂`
            : (baseUrl ? `再探测 ${baseUrl}` : '对离线工厂再探测一次')
        }
      >
        {busy ? '探测中…' : btnLabel}
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
