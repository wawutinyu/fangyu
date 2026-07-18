/** 观 · 告警铃铛 — 工厂离线 / Eval 红 / 试跑失败 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMonitorAlerts } from '../hooks/useMonitorAlerts'
import type { MonitorAlert } from '../utils/monitorApi'
import ExternalPingRetestButton from './ExternalPingRetestButton'

interface Props {
  wallMode?: boolean
  pollMs?: number
}

function formatTs(ts?: number) {
  if (!ts) return ''
  try { return new Date(ts * 1000).toLocaleString() } catch { return String(ts) }
}

export default function PresenceAlertBell({ wallMode, pollMs = 45000 }: Props) {
  const { meta, alerts, badge, error, reload, sseLive } = useMonitorAlerts(pollMs)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 48, right: 16 })

  const openPopover = () => {
    const el = btnRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen(o => !o)
    void reload()
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      const pop = document.getElementById('presence-alert-popover')
      if (pop?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const focusAlert = (a: MonitorAlert) => {
    window.dispatchEvent(new CustomEvent('fangyu:presence-focus', {
      detail: { kind: a.kind, factory_id: a.factory_id },
    }))
    setOpen(false)
  }

  const muted = wallMode ? '#9ca3af' : 'var(--text-muted)'
  const fg = wallMode ? '#e8eef4' : 'var(--text-primary)'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="notion-btn"
        data-testid="presence-alert-bell"
        title={sseLive ? '观测告警（SSE 实时）' : '观测告警：工厂离线 / Eval / 试跑'}
        onClick={openPopover}
        style={{
          fontSize: wallMode ? 13 : 11,
          position: 'relative',
          padding: wallMode ? '4px 10px' : undefined,
          color: fg,
          borderColor: wallMode ? '#2a3540' : undefined,
          background: wallMode ? '#1a222c' : undefined,
        }}
      >
        告警{sseLive ? '·' : ''}
        {badge > 0 && (
          <span
            data-testid="presence-alert-badge"
            style={{
              marginLeft: 6,
              minWidth: 16,
              padding: '0 5px',
              borderRadius: 8,
              fontSize: 10,
              fontWeight: 700,
              background: '#c0392b',
              color: '#fff',
              display: 'inline-block',
              textAlign: 'center',
            }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      {open && createPortal(
        <div
          id="presence-alert-popover"
          data-testid="presence-alert-popover"
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            zIndex: 10020,
            width: 320,
            maxWidth: '92vw',
            maxHeight: 360,
            overflow: 'auto',
            background: wallMode ? '#151c24' : 'var(--bg-primary, #fff)',
            color: wallMode ? '#e8eef4' : 'var(--text-primary)',
            border: wallMode ? '1px solid #2a3540' : '1px solid var(--border-color)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            padding: 8,
            fontSize: 12,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 6px 8px', borderBottom: wallMode ? '1px solid #2a3540' : '1px solid var(--border-light)',
            color: muted,
          }}>
            <span>
              共 {meta?.count ?? 0}
              {meta?.offline_factories ? ` · 离线 ${meta.offline_factories}` : ''}
              {meta?.eval_fail ? ` · Eval ${meta.eval_fail}` : ''}
              {meta?.ping_fail ? ` · 试跑 ${meta.ping_fail}` : ''}
            </span>
            <button type="button" className="notion-btn" style={{ fontSize: 10 }} onClick={() => void reload()}>
              刷新
            </button>
          </div>
          {error && <div style={{ padding: 8, color: '#dc2626' }}>{error}</div>}
          {!error && alerts.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: muted }}>暂无告警</div>
          )}
          {alerts.map(a => {
            const sev = a.severity || 'info'
            const color = sev === 'error' || sev === 'deny' ? '#c0392b'
              : sev === 'warn' ? '#d48806' : '#1890ff'
            return (
              <div
                key={a.id}
                data-testid="presence-alert-item"
                role="button"
                tabIndex={0}
                onClick={() => focusAlert(a)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') focusAlert(a) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  marginTop: 6, padding: '8px 10px', borderRadius: 6,
                  border: wallMode ? '1px solid #2a3540' : '1px solid var(--border-light)',
                  borderLeft: `3px solid ${color}`,
                  background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ fontWeight: 600 }}>{a.title || a.kind}</div>
                {a.message && (
                  <div style={{ color: muted, marginTop: 2, wordBreak: 'break-word' }}>{a.message}</div>
                )}
                <div style={{ color: muted, marginTop: 4, fontSize: 10 }}>
                  {a.kind} · {formatTs(a.ts)}
                </div>
                {a.kind === 'external.ping' && (
                  <ExternalPingRetestButton
                    target={a.target}
                    detail={a.detail}
                    source="PresenceAlertBell"
                    onDone={() => { void reload() }}
                    compact
                  />
                )}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
