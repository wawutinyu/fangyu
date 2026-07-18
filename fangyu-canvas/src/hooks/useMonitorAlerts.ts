/** 观测告警轮询 hook */
import { useCallback, useEffect, useState } from 'react'
import { fetchMonitorAlerts, type MonitorAlert, type MonitorAlertsResponse } from '../utils/monitorApi'

export function useMonitorAlerts(pollMs = 45000) {
  const [meta, setMeta] = useState<MonitorAlertsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const body = await fetchMonitorAlerts(24)
      setMeta(body)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
    if (pollMs <= 0) return
    const t = window.setInterval(() => { void reload() }, pollMs)
    return () => clearInterval(t)
  }, [reload, pollMs])

  const badge = (meta?.offline_factories ?? 0) + (meta?.eval_fail ?? 0)
  const alerts: MonitorAlert[] = meta?.alerts || []
  const latest = alerts[0] || null

  return { meta, alerts, badge, latest, error, reload }
}
