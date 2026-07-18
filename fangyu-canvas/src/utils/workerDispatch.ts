import type { ExportFormat } from '@fangyu/core/schema'
import { store } from '../store'
import { exportFormatToRunPayload } from './flowSnapshot'
import { dispatchTask, fetchWorkers } from './workerApi'

export interface DispatchFlowOptions {
  exportData: ExportFormat
  snapshotName: string
  snapshotId?: string
  workerId?: string | null
  globalPrompts?: {
    system_prompt: string
    user_prompt_template: string
    context: string
  }
}

/** 按平台给出启动方隅·行的提示（Mac 优先 sh / .command） */
export function workerStartHint(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isMac = /Mac|iPhone|iPad|iPod/i.test(ua)
  if (isMac) {
    return [
      '没有在线的方隅·行 Worker。',
      '',
      '请先启动 Worker：',
      '  ./install-worker.sh   （写入 ~/Applications/Fangyu-Worker.command）',
      '  或 ./dev-worker.sh',
      '再双击 Fangyu-Worker.command / 运行脚本。',
      '（需序 API 已在跑：python -m fangyu --server）',
    ].join('\n')
  }
  return [
    '没有在线的方隅·行 Worker。',
    '',
    '请先运行：dev-worker.bat 或 dev-worker-tray.bat',
    '（需序 API：dev.bat）',
  ].join('\n')
}

/** 空舰队短文案（行面板用） */
export function workerStartHintShort(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isMac = /Mac|iPhone|iPad|iPod/i.test(ua)
  if (isMac) {
    return './install-worker.sh 或 Fangyu-Worker.command'
  }
  return 'dev-worker-tray.bat'
}

export class PreferredWorkerOfflineError extends Error {
  constructor(
    public readonly preferredId: string,
    public readonly fallbackName?: string,
  ) {
    const fb = fallbackName ? `（当前在线：${fallbackName}）` : ''
    super(`所选 Worker 已离线${fb}。请改选在线 Worker，或重新启动该 Worker。`)
    this.name = 'PreferredWorkerOfflineError'
  }
}

export async function resolveOnlineWorkerId(preferredId?: string | null): Promise<string> {
  const workers = await fetchWorkers()
  const online = workers.filter(w => w.online)
  if (online.length === 0) {
    throw new Error(workerStartHint())
  }
  if (preferredId) {
    if (online.some(w => w.id === preferredId)) {
      return preferredId
    }
    throw new PreferredWorkerOfflineError(preferredId, online[0]?.name)
  }
  return online[0].id
}

export async function dispatchFlowSnapshot(opts: DispatchFlowOptions) {
  const nodes = opts.exportData.nodes ?? []
  if (nodes.length === 0) {
    throw new Error('Flow 快照为空')
  }

  const workerId = await resolveOnlineWorkerId(opts.workerId)
  const snapshot = exportFormatToRunPayload(opts.exportData)
  const globalPrompts = opts.globalPrompts ?? store.getState().flow.globalPrompts

  return dispatchTask({
    type: 'run_flow',
    worker_id: workerId,
    payload: {
      ...snapshot,
      global_vars: { globalPrompts },
      snapshot_id: opts.snapshotId ?? null,
      snapshot_name: opts.snapshotName,
    },
  })
}

export async function publishAndDispatchFromCanvas(opts: {
  exportData: ExportFormat
  snapshotName: string
  snapshotId: string
  workerId?: string | null
}) {
  return dispatchFlowSnapshot({
    exportData: opts.exportData,
    snapshotName: opts.snapshotName,
    snapshotId: opts.snapshotId,
    workerId: opts.workerId,
  })
}
