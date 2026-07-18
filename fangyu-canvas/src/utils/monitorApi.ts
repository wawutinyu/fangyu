/** 观测告警 API */
import { apiFetch } from '../platform'

export interface MonitorAlert {
  id: string
  kind: string
  severity?: string
  title?: string
  message?: string
  ts?: number
  factory_id?: string
  base_url?: string
  source?: string
}

export interface MonitorAlertsResponse {
  ok?: boolean
  count?: number
  offline_factories?: number
  eval_fail?: number
  ping_fail?: number
  alerts: MonitorAlert[]
}

export async function fetchMonitorAlerts(limit = 20): Promise<MonitorAlertsResponse> {
  const resp = await apiFetch(`/api/v1/monitor/alerts?limit=${limit}`)
  if (!resp.ok) throw new Error(`告警拉取失败 (${resp.status})`)
  const body = await resp.json()
  return {
    ok: body.ok,
    count: body.count ?? 0,
    offline_factories: body.offline_factories ?? 0,
    eval_fail: body.eval_fail ?? 0,
    ping_fail: body.ping_fail ?? 0,
    alerts: body.alerts || [],
  }
}

/** 协作事件是否应刷新观测告警铃铛 */
export function isMonitorAlertKind(kind: string): boolean {
  const k = (kind || '').trim()
  if (!k) return false
  return (
    k.startsWith('eval.')
    || k === 'factory.offline'
    || k === 'host.offline'
    || k === 'factory.online'
    || k === 'external.ping'
  )
}
