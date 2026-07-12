import type { PlatformInfo } from '../platform/types'

export interface ApiClientOptions {
  platform: PlatformInfo
  fetchImpl?: typeof fetch
}

export function resolveApiUrl(platform: PlatformInfo, path: string): string {
  if (path.startsWith('/api') && platform.apiBase) {
    return `${platform.apiBase}${path}`
  }
  return path
}

export function createApiClient(options: ApiClientOptions) {
  const fetchFn = options.fetchImpl ?? fetch
  const { platform } = options

  return {
    platform,
    resolveUrl(path: string) {
      return resolveApiUrl(platform, path)
    },
    async fetch(path: string, init?: RequestInit): Promise<Response> {
      return fetchFn(resolveApiUrl(platform, path), init)
    },
    async health(): Promise<boolean> {
      try {
        const res = await fetchFn(resolveApiUrl(platform, '/api/health'))
        return res.ok
      } catch {
        return false
      }
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
