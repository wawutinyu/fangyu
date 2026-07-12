/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initPlatform, getPlatform, isDesktop, resolveApiUrl } from '../index'

describe('platform', () => {
  beforeEach(() => {
    delete window.__FANGYU_PLATFORM__
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete window.__FANGYU_PLATFORM__
  })

  it('defaults to web platform', () => {
    const platform = initPlatform()
    expect(platform.kind).toBe('web')
    expect(isDesktop()).toBe(false)
    expect(getPlatform().label).toBe('网页')
    expect(resolveApiUrl('/api/v1/health')).toBe('/api/v1/health')
  })

  it('detects desktop bridge and prefixes api urls', () => {
    window.__FANGYU_PLATFORM__ = {
      kind: 'desktop',
      apiBase: 'http://127.0.0.1:8000',
      platform: 'win32',
    }
    const platform = initPlatform()
    expect(platform.kind).toBe('desktop')
    expect(isDesktop()).toBe(true)
    expect(resolveApiUrl('/api/v1/health')).toBe('http://127.0.0.1:8000/api/v1/health')
  })

  it('desktop fetch shim rewrites /api requests', async () => {
    window.__FANGYU_PLATFORM__ = {
      kind: 'desktop',
      apiBase: 'http://127.0.0.1:8000',
      platform: 'win32',
    }
    const nativeFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', nativeFetch)

    initPlatform()
    await fetch('/api/v1/health')

    expect(nativeFetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/v1/health', undefined)
  })
})
