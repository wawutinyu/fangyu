/** 方隅·观 API client */
import type { PresenceSnapshot, CollaborationEvent } from '@fangyu/core/schema'

export async function fetchPresenceSnapshot(eventLimit = 80): Promise<PresenceSnapshot> {
  const res = await fetch(`/api/v1/presence?event_limit=${eventLimit}`)
  if (!res.ok) throw new Error(`Presence 拉取失败 (${res.status})`)
  return res.json() as Promise<PresenceSnapshot>
}

export async function fetchPresenceEvents(opts?: {
  limit?: number
  kind?: string
}): Promise<CollaborationEvent[]> {
  const q = new URLSearchParams()
  if (opts?.limit) q.set('limit', String(opts.limit))
  if (opts?.kind) q.set('kind', opts.kind)
  const res = await fetch(`/api/v1/presence/events?${q}`)
  if (!res.ok) throw new Error(`Events 拉取失败 (${res.status})`)
  const data = await res.json() as { events: CollaborationEvent[] }
  return data.events
}

export type PresenceStreamHandlers = {
  onSnapshot?: (snap: PresenceSnapshot) => void
  onEvent?: (ev: CollaborationEvent) => void
  onError?: (err: Event) => void
  /** Relative or absolute URL; default `/api/v1/presence/stream` */
  url?: string
}

/** Subscribe to Presence SSE. Caller must call `close()` on cleanup. */
export function subscribePresenceStream(handlers: PresenceStreamHandlers): EventSource {
  const url = handlers.url ?? '/api/v1/presence/stream'
  const es = new EventSource(url)
  es.addEventListener('snapshot', (e: MessageEvent<string>) => {
    try {
      handlers.onSnapshot?.(JSON.parse(e.data) as PresenceSnapshot)
    } catch {
      /* ignore malformed */
    }
  })
  es.addEventListener('collab', (e: MessageEvent<string>) => {
    try {
      handlers.onEvent?.(JSON.parse(e.data) as CollaborationEvent)
    } catch {
      /* ignore malformed */
    }
  })
  es.onerror = (err) => {
    handlers.onError?.(err)
  }
  return es
}

/** Merge a live collab event into a snapshot (newest first, cap 100). */
export function mergePresenceEvent(
  snap: PresenceSnapshot,
  ev: CollaborationEvent,
): PresenceSnapshot {
  const events = [ev, ...(snap.events || [])].slice(0, 100)
  return {
    ...snap,
    events,
    summary: {
      ...snap.summary,
      events: (snap.summary?.events ?? 0) + 1,
    },
    ts: ev.ts ?? snap.ts,
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'busy': return '#2563eb'
    case 'idle': return '#16a34a'
    case 'error': return '#dc2626'
    case 'unauthorized': return '#ca8a04'
    case 'offline': return '#9ca3af'
    default: return '#6b7280'
  }
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    busy: '忙碌',
    idle: '空闲',
    error: '错误',
    unauthorized: '未授权',
    offline: '离线',
  }
  return map[status] || status
}

export function formatEventTime(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleTimeString()
  } catch {
    return String(ts)
  }
}
