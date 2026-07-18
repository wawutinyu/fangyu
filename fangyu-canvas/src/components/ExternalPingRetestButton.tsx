/** 跨厂试跑一键复测 */
import { useState, type MouseEvent } from 'react'
import { pingExternalAgent, type PingResult } from '../utils/pingExternalAgent'
import { resolveAgentForPing } from '../utils/resolveAgentForPing'

interface Props {
  target?: string | null
  detail?: Record<string, unknown> | null
  source?: string
  onDone?: () => void
  compact?: boolean
}

export default function ExternalPingRetestButton({
  target,
  detail,
  source = 'ExternalPingRetest',
  onDone,
  compact,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PingResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const node = await resolveAgentForPing({ target, detail })
      const skillId = typeof detail?.skill_id === 'string' ? detail.skill_id : undefined
      const r = await pingExternalAgent(node, {
        text: 'ping from 方隅复测',
        skillId,
        emitPresence: true,
        source,
      })
      setResult(r)
      onDone?.()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="external-ping-retest" style={{ marginTop: compact ? 4 : 6 }}>
      <button
        type="button"
        className="notion-btn"
        data-testid="external-ping-retest-btn"
        disabled={busy}
        onClick={(e) => { void run(e) }}
        style={{ fontSize: 11 }}
        title="再次经平台 A2A 试跑 ping"
      >
        {busy ? '复测中…' : '复测 ping'}
      </button>
      {(result || err) && (
        <div
          data-testid="external-ping-retest-result"
          style={{
            marginTop: 4,
            fontSize: 10,
            color: err || (result && !result.ok) ? '#c0392b' : '#1a7f37',
            wordBreak: 'break-word',
          }}
        >
          {err
            ? err
            : result?.ok
              ? `✓ 通过${result.state ? ` · ${result.state}` : ''}`
              : `✗ ${result?.error || result?.excerpt || '未过'}`}
        </div>
      )}
    </div>
  )
}
