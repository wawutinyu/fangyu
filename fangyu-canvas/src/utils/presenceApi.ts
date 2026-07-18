/** 方隅·观 API client */
import type { PresenceSnapshot, CollaborationEvent } from '@fangyu/core/schema'

export async function fetchPresenceSnapshot(eventLimit = 80): Promise<PresenceSnapshot> {
  const res = await fetch(`/api/v1/presence?event_limit=${eventLimit}`)
  if (!res.ok) throw new Error(`Presence 拉取失败 (${res.status})`)
  return res.json() as Promise<PresenceSnapshot>
}

/** 一键演示剧本：注入同行者 + 协作事件 */
export async function runPresenceDemo(ttlSec = 180): Promise<{
  ok: boolean
  cast: number
  events: number
  departments?: number
  houses?: number
  snapshot: PresenceSnapshot
}> {
  const res = await fetch(`/api/v1/presence/demo?ttl_sec=${ttlSec}`, { method: 'POST' })
  if (!res.ok) throw new Error(`演示剧本失败 (${res.status})`)
  return res.json()
}

export interface PresenceReplayMeta {
  id: string
  title: string
  created_at: number
  exported_at?: string | null
  event_count: number
  department_count: number
}

export async function listPresenceReplays(limit = 50): Promise<PresenceReplayMeta[]> {
  const res = await fetch(`/api/v1/presence/replays?limit=${limit}`)
  if (!res.ok) throw new Error(`回放列表失败 (${res.status})`)
  const data = await res.json() as { replays: PresenceReplayMeta[] }
  return data.replays || []
}

export async function savePresenceReplay(
  pack: unknown,
  title = '',
): Promise<PresenceReplayMeta> {
  const res = await fetch('/api/v1/presence/replays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, pack }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`存库失败 (${res.status}) ${detail}`)
  }
  const data = await res.json() as { replay: PresenceReplayMeta }
  return data.replay
}

export async function importPresenceReplay(
  pack: unknown,
  title = '',
): Promise<{ replay: PresenceReplayMeta; snapshot: PresenceSnapshot }> {
  const res = await fetch('/api/v1/presence/replays/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, pack }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`导入失败 (${res.status}) ${detail}`)
  }
  return res.json()
}

export async function loadPresenceReplay(
  replayId: string,
): Promise<{ replay: PresenceReplayMeta; snapshot: PresenceSnapshot }> {
  const res = await fetch(`/api/v1/presence/replays/${encodeURIComponent(replayId)}/load`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(`加载回放失败 (${res.status})`)
  return res.json()
}

export async function deletePresenceReplay(replayId: string): Promise<void> {
  const res = await fetch(`/api/v1/presence/replays/${encodeURIComponent(replayId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`删除回放失败 (${res.status})`)
}

export interface PresenceSampleMeta {
  id: string
  title: string
  path?: string
  events: number
  presence: number
  exported_at?: string
}

export async function listPresenceSamples(): Promise<PresenceSampleMeta[]> {
  const res = await fetch('/api/v1/presence/replays/samples')
  if (!res.ok) throw new Error(`样例列表失败 (${res.status})`)
  const data = await res.json() as { samples: PresenceSampleMeta[] }
  return data.samples || []
}

export async function loadPresenceSample(
  sampleId: string,
  persist = true,
): Promise<{
  sample_id: string
  title?: string
  replay: PresenceReplayMeta | null
  snapshot: PresenceSnapshot
}> {
  const q = persist ? '?persist=true' : '?persist=false'
  const res = await fetch(
    `/api/v1/presence/replays/samples/${encodeURIComponent(sampleId)}/load${q}`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`加载样例失败 (${res.status})`)
  return res.json()
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
    case 'online': return '#16a34a'
    case 'error': return '#dc2626'
    case 'unauthorized': return '#ca8a04'
    case 'offline': return '#9ca3af'
    default: return '#6b7280'
  }
}

/** 工厂健康分着色（与运维通讯录阈值一致） */
export function factoryHealthColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return 'var(--text-muted)'
  if (score >= 80) return '#1a7f37'
  if (score >= 50) return '#d48806'
  return '#c0392b'
}

export function factoryHealthLabel(score: number, grade?: string): string {
  const g = grade ? ` ${grade}` : ''
  return `健康 ${score}${g}`
}

/** 从 Presence 主机实体解析工厂通讯录 id */
export function factoryIdFromHostEntity(entity: {
  kind?: string
  role?: string | null
  id?: string
  name?: string
  factory_id?: string | null
}): string | null {
  if (entity.kind !== 'host') return null
  if (entity.factory_id) return String(entity.factory_id)
  if (entity.role && entity.role !== 'factory') return null
  const raw = entity.id || ''
  const tail = raw.startsWith('host:') ? raw.slice(5) : raw
  if (tail.startsWith('factory:')) return tail.slice('factory:'.length) || null
  const n = entity.name || ''
  if (n.startsWith('factory:')) return n.slice('factory:'.length) || null
  if (entity.role === 'factory' && tail) return tail
  return null
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    busy: '忙碌',
    idle: '空闲',
    online: '在线',
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

/** 写入协作事件（观时间轴 / SSE） */
export async function emitPresenceEvent(input: {
  kind: string
  actor?: string
  target?: string | null
  message?: string
  detail?: Record<string, unknown>
  severity?: string
}): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/presence/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: input.kind,
        actor: input.actor || '',
        target: input.target ?? null,
        message: input.message || '',
        detail: input.detail || {},
        severity: input.severity || 'info',
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
