/**
 * 原生宿主能力契约 — Web 走 API 代理，桌面原生直接调 OS。
 * shell / 文件 / 进程等不应绑死在 React 或 Electron 里。
 */

export interface ShellExecOptions {
  command: string
  cwd?: string
  env?: Record<string, string>
  /** 默认 60_000 ms */
  timeoutMs?: number
}

export interface ShellExecResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut?: boolean
}

export interface FilePickOptions {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  defaultPath?: string
}

export interface NativeShell {
  exec(options: ShellExecOptions): Promise<ShellExecResult>
  /** 打开系统或内置终端（可选） */
  openTerminal?(cwd?: string): Promise<void>
}

export interface NativeFilesystem {
  pickFile?(options?: FilePickOptions): Promise<string | null>
  pickDirectory?(options?: Pick<FilePickOptions, 'title' | 'defaultPath'>): Promise<string | null>
  readText(path: string): Promise<string>
  writeText(path: string, content: string): Promise<void>
  revealInFolder?(path: string): Promise<void>
}

export interface BackendLifecycle {
  start(): Promise<{ port: number; dataDir?: string }>
  stop(): Promise<void>
  health(): Promise<boolean>
}

/** 各平台必须实现的宿主能力；缺失项在 UI 层降级或走 Python API */
export interface NativeHost {
  platform: PlatformInfoLite
  shell: NativeShell
  fs: NativeFilesystem
  backend?: BackendLifecycle
}

export interface PlatformInfoLite {
  kind: 'web' | 'desktop' | 'native'
  os?: string
  label: string
}

export type CapabilityKey = keyof Pick<NativeHost, 'shell' | 'fs' | 'backend'>

export function supportsCapability(
  host: Partial<NativeHost> | null | undefined,
  key: CapabilityKey,
): boolean {
  return Boolean(host?.[key])
}
