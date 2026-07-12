export { default as App } from './components/App'
export { store } from './store'
export {
  initPlatform,
  isDesktop,
  getPlatform,
  resolveApiUrl,
  apiFetch,
} from './platform'
export type { PlatformInfo, PlatformKind, DesktopPreloadBridge } from './platform'
