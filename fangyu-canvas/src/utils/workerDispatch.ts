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

export async function resolveOnlineWorkerId(preferredId?: string | null): Promise<string> {
  const workers = await fetchWorkers()
  const online = workers.filter(w => w.online)
  if (online.length === 0) {
    throw new Error('没有在线的方隅·行 Worker。请先运行 dev-worker.bat 或 dev-worker-tray.bat')
  }
  if (preferredId && online.some(w => w.id === preferredId)) {
    return preferredId
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
