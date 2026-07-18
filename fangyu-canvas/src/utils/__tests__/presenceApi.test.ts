import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchPresenceSnapshot,
  fetchPresenceEvents,
  mergePresenceEvent,
  statusColor,
  statusLabel,
  formatEventTime,
  subscribePresenceStream,
  factoryIdFromHostEntity,
} from '../presenceApi'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('presenceApi', () => {
  it('fetchPresenceSnapshot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        presence: [{ id: 'worker:1', kind: 'worker', name: 'w', label: 'w', status: 'idle', online: true }],
        events: [{ id: 'e1', ts: 1, kind: 'test', actor: 'a', message: 'm', severity: 'info' }],
        summary: { agents: 0, agents_busy: 0, workers: 1, workers_online: 1, events: 1 },
        ts: 1,
      }),
    }))
    const snap = await fetchPresenceSnapshot()
    expect(snap.presence).toHaveLength(1)
    expect(snap.summary.workers_online).toBe(1)
  })

  it('fetchPresenceEvents with kind filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ id: '1', ts: 1, kind: 'a2a.send', actor: 'u', message: '', severity: 'info' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const events = await fetchPresenceEvents({ kind: 'a2a.send', limit: 10 })
    expect(events[0].kind).toBe('a2a.send')
    expect(String(fetchMock.mock.calls[0][0])).toContain('kind=a2a.send')
  })

  it('status helpers', () => {
    expect(statusLabel('busy')).toBe('忙碌')
    expect(statusColor('deny' as never)).toBeTruthy()
    expect(statusColor('idle')).toMatch(/^#/)
    expect(formatEventTime(1700000000)).toBeTruthy()
  })

  it('surfaces HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchPresenceSnapshot()).rejects.toThrow('503')
  })

  it('mergePresenceEvent prepends and caps', () => {
    const base = {
      presence: [],
      events: [{ id: 'old', ts: 1, kind: 'x', actor: 'a', message: '', severity: 'info' as const }],
      edges: [],
      summary: { agents: 0, agents_busy: 0, workers: 0, workers_online: 0, events: 1 },
      ts: 1,
    }
    const next = mergePresenceEvent(base, {
      id: 'new', ts: 2, kind: 'y', actor: 'b', message: 'hi', severity: 'info',
    })
    expect(next.events[0].id).toBe('new')
    expect(next.summary.events).toBe(2)
  })

  it('subscribePresenceStream wires EventSource listeners', () => {
    const listeners: Record<string, (e: MessageEvent<string>) => void> = {}
    const close = vi.fn()
    class FakeES {
      onerror: ((e: Event) => void) | null = null
      constructor(public url: string) {}
      addEventListener(type: string, cb: (e: MessageEvent<string>) => void) {
        listeners[type] = cb
      }
      close = close
    }
    vi.stubGlobal('EventSource', FakeES as unknown as typeof EventSource)
    const onSnapshot = vi.fn()
    const onEvent = vi.fn()
    const es = subscribePresenceStream({ onSnapshot, onEvent })
    expect(es.url).toBe('/api/v1/presence/stream')
    listeners.snapshot?.({ data: JSON.stringify({ presence: [], events: [], summary: {}, ts: 1 }) } as MessageEvent<string>)
    listeners.collab?.({ data: JSON.stringify({ id: 'e', ts: 1, kind: 'k', actor: 'a', message: '', severity: 'info' }) } as MessageEvent<string>)
    expect(onSnapshot).toHaveBeenCalled()
    expect(onEvent).toHaveBeenCalled()
    es.close()
    expect(close).toHaveBeenCalled()
  })

  it('factoryIdFromHostEntity', () => {
    expect(factoryIdFromHostEntity({
      kind: 'host', role: 'factory', id: 'host:factory:east',
    })).toBe('east')
    expect(factoryIdFromHostEntity({
      kind: 'host', role: 'factory', id: 'host:x', factory_id: 'fid-1',
    })).toBe('fid-1')
    expect(factoryIdFromHostEntity({
      kind: 'host', role: 'studio', id: 'host:studio-1',
    })).toBe(null)
    expect(factoryIdFromHostEntity({
      kind: 'agent', id: 'agent:a',
    })).toBe(null)
  })
})
