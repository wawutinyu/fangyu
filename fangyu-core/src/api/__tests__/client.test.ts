import { describe, expect, it } from 'vitest'
import { createApiClient, resolveApiUrl } from '../client'
import type { PlatformInfo } from '../../platform/types'

const web: PlatformInfo = { kind: 'web', label: '网页', apiBase: '' }
const desktop: PlatformInfo = {
  kind: 'desktop',
  label: '桌面',
  apiBase: 'http://127.0.0.1:8000',
  os: 'win32',
}

describe('resolveApiUrl', () => {
  it('keeps relative paths on web', () => {
    expect(resolveApiUrl(web, '/api/health')).toBe('/api/health')
  })

  it('prefixes apiBase on desktop', () => {
    expect(resolveApiUrl(desktop, '/api/health')).toBe('http://127.0.0.1:8000/api/health')
  })
})

describe('createApiClient', () => {
  it('calls fetch with resolved url', async () => {
    let called = ''
    const client = createApiClient({
      platform: desktop,
      fetchImpl: async (url) => {
        called = String(url)
        return new Response('ok', { status: 200 })
      },
    })
    await client.fetch('/api/health')
    expect(called).toBe('http://127.0.0.1:8000/api/health')
  })
})
