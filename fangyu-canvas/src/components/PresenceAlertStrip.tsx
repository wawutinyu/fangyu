/** 值班大屏投屏条 — 告警数 + 最新标题 */
import { useMonitorAlerts } from '../hooks/useMonitorAlerts'
import type { MonitorAlert } from '../utils/monitorApi'

interface Props {
  pollMs?: number
}

export default function PresenceAlertStrip({ pollMs = 30000 }: Props) {
  const { badge, latest, reload } = useMonitorAlerts(pollMs)

  if (badge <= 0 && !latest) return null

  const focus = (a: MonitorAlert | null) => {
    if (!a) return
    window.dispatchEvent(new CustomEvent('fangyu:presence-focus', {
      detail: { kind: a.kind, factory_id: a.factory_id },
    }))
  }

  const sev = latest?.severity || 'warn'
  const color = sev === 'error' || sev === 'deny' ? '#c0392b'
    : sev === 'warn' ? '#d48806' : '#1890ff'

  return (
    <button
      type="button"
      data-testid="presence-alert-strip"
      onClick={() => {
        void reload()
        focus(latest)
      }}
      title="点击聚焦时间轴对应告警"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        border: 'none',
        borderBottom: '1px solid #2a3540',
        background: '#151c24',
        color: '#e8eef4',
        padding: '8px 20px',
        fontSize: 13,
        cursor: 'pointer',
        textAlign: 'left',
        flexShrink: 0,
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0,
      }} />
      <span style={{ fontWeight: 700, color: '#f87171' }}>
        告警 {badge || (latest ? 1 : 0)}
      </span>
      <span style={{
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: '#a8b8c8',
      }}>
        {latest?.title || latest?.kind || '有新告警'}
        {latest?.message ? ` · ${latest.message}` : ''}
      </span>
      <span style={{ fontSize: 11, color: '#6b7c8d', flexShrink: 0 }}>点此定位</span>
    </button>
  )
}
