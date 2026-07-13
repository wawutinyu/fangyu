/** Tauri 原生壳 IPC（withGlobalTauri，无需单独依赖 @tauri-apps/api） */

type TauriCore = {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

function getTauriCore(): TauriCore | null {
  const w = window as Window & { __TAURI__?: { core?: TauriCore } }
  return w.__TAURI__?.core ?? null
}

export function isTauriRuntime(): boolean {
  return Boolean(getTauriCore())
}

export async function nativeInvoke<T = string>(cmd: string): Promise<T | null> {
  const core = getTauriCore()
  if (!core) return null
  try {
    return await core.invoke<T>(cmd)
  } catch {
    return null
  }
}

export async function queryNativeHealth(): Promise<{ api: string; worker: string } | null> {
  if (!getTauriCore()) return null
  const [api, worker] = await Promise.all([
    nativeInvoke<string>('api_status'),
    nativeInvoke<string>('worker_status'),
  ])
  if (api == null && worker == null) return null
  return { api: api ?? 'unknown', worker: worker ?? 'unknown' }
}
