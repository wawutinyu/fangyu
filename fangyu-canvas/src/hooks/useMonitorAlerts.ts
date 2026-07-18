/** 观测告警：轮询 + Presence SSE 即时刷新 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchMonitorAlerts,
  isMonitorAlertKind,
  type MonitorAlert,
  type MonitorAlertsResponse,
} from '../utils/monitorApi'
import { subscribePresenceStream } from '../utils/presenceApi'

export function useMonitorAlerts(pollMs = 45000) {
  const [meta, setMeta] = useState<MonitorAlertsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sseLive, setSseLive] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = useCallback(async () => {
    try {
      const body = await fetchMonitorAlerts(24)
      setMeta(body)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const scheduleReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void reload()
    }, 350)
  }, [reload])

  useEffect(() => {
    void reload()
    if (pollMs <= 0) return
    const t = window.setInterval(() => { void reload() }, pollMs)
    return () => clearInterval(t)
  }, [reload, pollMs])

  useEffect(() => {
    let es: EventSource | null = null
    let closed = false
    try {
      es = subscribePresenceStream({
        onSnapshot: () => {
          if (closed) return
          setSseLive(true)
        },
        onEvent: (ev) => {
          if (closed) return
          setSseLive(true)
          const kind = String(ev.kind || '')
          if (isMonitorAlertKind(kind)) scheduleReload()
        },
        onError: () => {
          if (closed) return
          setSseLive(false)
        },
      })
    } catch {
      setSseLive(false)
    }
    return () => {
      closed = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      es?.close()
    }
  }, [scheduleReload])

  const badge = (meta?.offline_factories ?? 0)
    + (meta?.eval_fail ?? 0)
    + (meta?.ping_fail ?? 0)
    + (meta?.health_regress ?? 0)
  const alerts: MonitorAlert[] = meta?.alerts || []
  const latest = alerts[0] || null

  return { meta, alerts, badge, latest, error, reload, sseLive }
}
