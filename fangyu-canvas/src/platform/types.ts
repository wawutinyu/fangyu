export type {
  PlatformInfo,
  PlatformKind,
  DesktopPreloadBridge,
} from '@fangyu/core/platform'

declare global {
  interface Window {
    __FANGYU_PLATFORM__?: import('@fangyu/core/platform').DesktopPreloadBridge
  }
}
