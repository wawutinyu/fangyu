/** 告警 → 观 / 观测 导航 */
import type { MonitorAlert } from './monitorApi'

export type BottomMonitorTab = 'eval' | 'alerts' | 'harness' | 'logs'

export function focusPresenceFromAlert(
  a: Pick<MonitorAlert, 'kind' | 'factory_id'>,
  opts?: { openMonitorTab?: BottomMonitorTab; evalView?: 'report' | 'compare' },
): void {
  const kind = String(a.kind || '')
  window.dispatchEvent(new CustomEvent('fangyu:switch-view', { detail: { view: 'presence' } }))
  window.dispatchEvent(new CustomEvent('fangyu:presence-focus', {
    detail: { kind, factory_id: a.factory_id },
  }))
  const tab = opts?.openMonitorTab
    ?? (kind === 'eval.health_regression' || kind.startsWith('eval.')
      ? (kind === 'eval.health_regression' ? 'eval' : 'alerts')
      : undefined)
  if (tab) {
    window.dispatchEvent(new CustomEvent('fangyu:focus-bottom-monitor', {
      detail: {
        tab,
        evalView: opts?.evalView
          ?? (kind === 'eval.health_regression' ? 'compare' : undefined),
      },
    }))
  }
}
