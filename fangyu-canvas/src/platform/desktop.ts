import type { DesktopPreloadBridge, PlatformInfo } from './types'

export function readDesktopBridge(): DesktopPreloadBridge | null {
  const bridge = window.__FANGYU_PLATFORM__
  if ((bridge?.kind === 'desktop' || bridge?.kind === 'native') && bridge.apiBase) {
    return bridge
  }
  // Tauri 原生壳：无 preload，靠运行时探测
  const w = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }
  if (w.__TAURI_INTERNALS__ || w.__TAURI__) {
    return {
      kind: 'native',
      apiBase: 'http://127.0.0.1:8000',
      platform: navigator.platform?.toLowerCase().includes('win') ? 'win32' : 'unknown',
    }
  }
  return null
}

export function bridgeToPlatform(bridge: DesktopPreloadBridge): PlatformInfo {
  return {
    kind: bridge.kind,
    label: bridge.kind === 'native' ? 'Windows 原生' : '桌面',
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
