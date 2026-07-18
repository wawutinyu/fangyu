import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { apiDownHint, probeApiHealth } from '../apiHealth'

describe('apiHealth', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('probeApiHealth true when status ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }))
    await expect(probeApiHealth()).resolves.toBe(true)
  })

  it('probeApiHealth false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))
    await expect(probeApiHealth()).resolves.toBe(false)
  })

  it('apiDownHint mentions Terminal on Mac UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' })
    expect(apiDownHint()).toMatch(/Terminal|dev\.sh|fangyu --server/)
  })
})
