export type PlatformKind = 'web' | 'desktop' | 'native'

export interface PlatformInfo {
  kind: PlatformKind
  label: string
  /** 空字符串表示走相对路径（Web 由 Vite 代理） */
  apiBase: string
  os?: string
}

/** Electron / Tauri preload 注入的最小桥接信息 */
export interface DesktopPreloadBridge {
  kind: 'desktop' | 'native'
  apiBase: string
  platform: string
}
