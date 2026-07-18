/**
 * 观 · 时间轴回放：按事件序推导某一刻的 Presence / 协作边。
 */

import type {
  CollaborationEdge,
  CollaborationEvent,
  PresenceEntity,
} from '@fangyu/core/schema'

export interface ReplayFrame {
  /** 已纳入的最后一条事件下标；-1 = 起点（尚无事件） */
  index: number
  atTs: number
  presence: PresenceEntity[]
  edges: CollaborationEdge[]
  eventsUpTo: CollaborationEvent[]
  activeEvent: CollaborationEvent | null
}

type MutablePresence = PresenceEntity & {
  current_skill?: string | null
  task_id?: string | null
}

function norm(s: string): string {
  return (s || '').trim().toLowerCase()
}

/** 事件按时间升序；同 ts 保持原相对顺序 */
export function sortEventsAsc(events: CollaborationEvent[]): CollaborationEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const dt = (a.e.ts || 0) - (b.e.ts || 0)
      return dt !== 0 ? dt : a.i - b.i
    })
    .map(x => x.e)
}

export function buildEdgesFromEvents(
  events: CollaborationEvent[],
  limit = 40,
): CollaborationEdge[] {
  const agg = new Map<string, CollaborationEdge>()
  for (const e of events) {
    const actor = (e.actor || '').trim()
    const target = (e.target || '').trim()
    if (!actor || !target || actor === target) continue
    const key = `${actor}\0${target}`
    const ts = e.ts || 0
    const cur = agg.get(key)
    if (!cur) {
      agg.set(key, {
        source: actor,
        target,
        count: 1,
        last_kind: e.kind,
        last_ts: ts,
        last_severity: String(e.severity || 'info'),
      })
    } else {
      cur.count += 1
      if (ts >= (cur.last_ts || 0)) {
        cur.last_kind = e.kind
        cur.last_ts = ts
        cur.last_severity = String(e.severity || 'info')
      }
    }
  }
  return [...agg.values()]
    .sort((a, b) => ((b.last_ts || 0) - (a.last_ts || 0)) || (b.count - a.count))
    .slice(0, Math.max(1, Math.min(limit, 200)))
}

function entityKeys(p: PresenceEntity): string[] {
  return [p.id, p.name, p.label].filter(Boolean) as string[]
}

function resolveEntities(
  presence: MutablePresence[],
  key: string | null | undefined,
): MutablePresence[] {
  if (!key) return []
  const n = norm(key)
  return presence.filter(p => entityKeys(p).some(k => norm(k) === n || k === key))
}

function kindBusy(kind: string): boolean {
  const k = kind.toLowerCase()
  return (
    k.includes('start')
    || k.includes('enqueue')
    || k.includes('send')
    || k.includes('request')
    || k.includes('working')
    || k.includes('dispatch')
    || k.includes('a2a')
  ) && !kindDone(kind)
}

function kindDone(kind: string): boolean {
  const k = kind.toLowerCase()
  return k.includes('complete') || k.includes('finish') || k.includes('done') || k.includes('cancel')
}

function skillGuess(kind: string, message: string): string | null {
  const blob = `${kind} ${message}`.toLowerCase()
  if (blob.includes('search') || blob.includes('检索')) return 'search'
  if (blob.includes('analy') || blob.includes('分析')) return 'analyze'
  if (blob.includes('sum') || blob.includes('汇总')) return 'summarize'
  if (blob.includes('verify') || blob.includes('校验') || blob.includes('worker')) return 'verify'
  return kind.split('.').pop() || null
}

function managedIdFromActor(actor: string): string | null {
  const a = (actor || '').trim()
  if (a.startsWith('managed:')) return a.slice('managed:'.length) || null
  return null
}

function upsertManaged(
  presence: MutablePresence[],
  instanceId: string,
  patch: Partial<MutablePresence> & { online: boolean; status: string },
): MutablePresence {
  const id = `managed:${instanceId}`
  let cur = presence.find(p => p.id === id)
  if (!cur) {
    cur = {
      id,
      kind: 'managed',
      name: String(patch.name || instanceId),
      label: String(patch.label || patch.name || instanceId),
      status: patch.status,
      online: patch.online,
      department: '托管',
      department_id: 'dept-managed',
      current_skill: null,
      task_id: null,
    }
    presence.push(cur)
  }
  Object.assign(cur, patch)
  return cur
}

/** 托管启停/升级：回放帧与 live Presence 对齐（不按 start→busy 误判） */
function applyManagedEvent(presence: MutablePresence[], ev: CollaborationEvent): boolean {
  const kind = String(ev.kind || '')
  if (!kind.startsWith('managed.')) return false

  const detail = (ev.detail || {}) as Record<string, unknown>
  const fromId = String(detail.from || '').trim()
  const toId = String(detail.to || managedIdFromActor(ev.actor) || detail.instance_id || '').trim()
  const name = String(ev.target || detail.name || toId || fromId || '托管')
  const host = detail.host != null ? String(detail.host) : undefined
  const port = typeof detail.port === 'number' ? detail.port : undefined
  const bundleDir = detail.bundle_dir != null ? String(detail.bundle_dir) : undefined

  if (kind === 'managed.stop') {
    const iid = String(detail.instance_id || managedIdFromActor(ev.actor) || toId || '').trim()
    if (iid) {
      upsertManaged(presence, iid, {
        online: false,
        status: 'offline',
        name,
        label: name,
        host,
        port,
        bundle_dir: bundleDir,
        current_skill: null,
        task_id: null,
      })
    }
    return true
  }

  if (kind === 'managed.start' || kind === 'managed.upgrade' || kind === 'managed.restart') {
    if (kind === 'managed.upgrade' && fromId && fromId !== toId) {
      upsertManaged(presence, fromId, {
        online: false,
        status: 'offline',
        current_skill: null,
        task_id: null,
      })
    }
    if (toId) {
      upsertManaged(presence, toId, {
        online: true,
        status: 'online',
        name,
        label: name,
        host,
        port,
        bundle_dir: bundleDir,
        current_skill: kind === 'managed.upgrade' ? 'upgrade' : null,
        task_id: null,
      })
    }
    return true
  }

  return true
}

function applyEvent(presence: MutablePresence[], ev: CollaborationEvent): void {
  if (applyManagedEvent(presence, ev)) return

  const actors = resolveEntities(presence, ev.actor)
  const targets = resolveEntities(presence, ev.target)
  const touched = [...actors, ...targets]
  if (touched.length === 0) return

  const sev = String(ev.severity || 'info').toLowerCase()
  if (sev === 'deny' || sev === 'error') {
    for (const p of actors) {
      p.status = 'error'
      p.online = true
    }
    return
  }

  if (kindDone(ev.kind)) {
    for (const p of actors) {
      p.status = 'idle'
      p.current_skill = null
      p.task_id = null
      p.online = true
    }
    return
  }

  if (kindBusy(ev.kind) || sev === 'warn') {
    for (const p of touched) {
      p.status = 'busy'
      p.online = true
      if (!p.current_skill) p.current_skill = skillGuess(ev.kind, ev.message || '')
    }
  }
}

/**
 * @param index 纳入 eventsAsc[0..index]；-1 = 起点
 */
export function frameAtIndex(
  basePresence: PresenceEntity[],
  eventsAsc: CollaborationEvent[],
  index: number,
): ReplayFrame {
  const maxIdx = eventsAsc.length - 1
  const clamped = eventsAsc.length === 0
    ? -1
    : Math.max(-1, Math.min(index, maxIdx))

  const eventsUpTo = clamped < 0 ? [] : eventsAsc.slice(0, clamped + 1)
  const presence: MutablePresence[] = basePresence.map(p => {
    const isHostLike = p.kind === 'managed' || p.kind === 'host'
    return {
      ...p,
      status: isHostLike ? (p.online ? 'online' : 'offline') : 'idle',
      current_skill: null,
      task_id: null,
      online: p.online,
    }
  })

  for (const ev of eventsUpTo) applyEvent(presence, ev)

  const activeEvent = clamped >= 0 ? eventsAsc[clamped] : null
  const atTs = activeEvent?.ts
    ?? (eventsAsc[0]?.ts ?? 0)

  return {
    index: clamped,
    atTs,
    presence,
    edges: buildEdgesFromEvents(eventsUpTo),
    eventsUpTo,
    activeEvent,
  }
}

export function clampReplayIndex(index: number, eventCount: number): number {
  if (eventCount <= 0) return -1
  return Math.max(-1, Math.min(index, eventCount - 1))
}
