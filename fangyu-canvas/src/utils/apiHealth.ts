/** 探测序 API 是否可达（经 Vite 代理 /api） */
export async function probeApiHealth(timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return false
    const data = await res.json().catch(() => null) as { status?: string } | null
    return data?.status === 'ok' || res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Mac / 通用启动提示（顶栏横幅用） */
export function apiDownHint(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isMac = /Mac|iPhone|iPad|iPod/i.test(ua)
  if (isMac) {
    return '序 API 未连接 — 请在本机 Terminal 前台运行 ./dev.sh 或 python -m fangyu --server（agent 后台进程常会挂掉 → 502）'
  }
  return '序 API 未连接 — 请在本机终端前台运行 dev.bat 或 python -m fangyu --server（勿只用 IDE 后台进程）'
}
