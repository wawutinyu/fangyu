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
