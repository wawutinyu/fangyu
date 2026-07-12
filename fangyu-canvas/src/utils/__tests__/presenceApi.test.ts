import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchPresenceSnapshot,
  fetchPresenceEvents,
  statusColor,
  statusLabel,
  formatEventTime,
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
})
