import type { DesktopPreloadBridge, PlatformInfo } from './types'

export function readDesktopBridge(): DesktopPreloadBridge | null {
  const bridge = window.__FANGYU_PLATFORM__
  if (bridge?.kind === 'desktop' && bridge.apiBase) return bridge
  return null
}

export function bridgeToPlatform(bridge: DesktopPreloadBridge): PlatformInfo {
  return {
    kind: 'desktop',
    label: '桌面',
    apiBase: bridge.apiBase,
    os: bridge.platform,
  }
}

function installFetchShim(apiBase: string): void {
  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

    if (url.startsWith('/api')) {
      const absolute = `${apiBase}${url}`
      if (typeof input === 'string' || input instanceof URL) {
        return nativeFetch(absolute, init)
      }
      return nativeFetch(new Request(absolute, input), init)
    }

    return nativeFetch(input, init)
  }
}

export function activateDesktopPlatform(platform: PlatformInfo): void {
  if (platform.apiBase) installFetchShim(platform.apiBase)
}
