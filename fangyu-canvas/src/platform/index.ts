import { resolveApiUrl as coreResolveApiUrl } from '@fangyu/core/api'
import { activateDesktopPlatform, bridgeToPlatform, readDesktopBridge } from './desktop'
import type { PlatformInfo } from './types'
import { webPlatform } from './web'

export type { PlatformInfo, PlatformKind, DesktopPreloadBridge } from './types'

let currentPlatform: PlatformInfo = webPlatform

/** 启动时解析运行环境（Web / 桌面），桌面端安装 API 路由 shim */
export function initPlatform(): PlatformInfo {
  const bridge = readDesktopBridge()
  if (bridge) {
    currentPlatform = bridgeToPlatform(bridge)
    activateDesktopPlatform(currentPlatform)
  } else {
    currentPlatform = webPlatform
  }
  return currentPlatform
}

export function getPlatform(): PlatformInfo {
  return currentPlatform
}

export function isDesktop(): boolean {
  return currentPlatform.kind === 'desktop' || currentPlatform.kind === 'native'
}

export function resolveApiUrl(path: string): string {
  return coreResolveApiUrl(currentPlatform, path)
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(resolveApiUrl(path), init)
}
