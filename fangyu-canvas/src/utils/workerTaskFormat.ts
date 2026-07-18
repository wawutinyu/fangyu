import type { WorkerInfo, WorkerTask } from '@fangyu/core/schema'

/** Unix 秒 → 本地时间；缺省为 — */
export function formatTs(ts: number | null | undefined, withDate = false): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return withDate ? d.toLocaleString() : d.toLocaleTimeString()
}

export function statusColor(status: string): string {
  if (status === 'done') return '#16a34a'
  if (status === 'failed') return '#dc2626'
  if (status === 'running') return '#2563eb'
  return '#ca8a04'
}

/** 任务列表/详情一行摘要 */
export function payloadSummary(task: WorkerTask): string {
  const p = task.payload ?? {}
  if (task.type === 'run_flow') {
    const name = typeof p.snapshot_name === 'string' ? p.snapshot_name : null
    const nodes = Array.isArray(p.nodes) ? p.nodes.length : 0
    return name ? `${name} · ${nodes} 节点` : `Flow · ${nodes} 节点`
  }
  if (task.type === 'shell') {
    const cmd = typeof p.command === 'string' ? p.command : ''
    return cmd.length > 48 ? `${cmd.slice(0, 48)}…` : cmd || 'shell'
  }
  if (task.type === 'read_file' || task.type === 'write_file') {
    return typeof p.path === 'string' ? p.path : task.type
  }
  if (task.type === 'adapter_invoke') {
    const action = typeof p.action === 'string' ? p.action : 'invoke'
    const adapter = typeof p.adapter === 'string' ? p.adapter : ''
    return adapter ? `${adapter}:${action}` : action
  }
  return task.type
}

/** 舰队侧：该 Worker 当前在干什么 */
export function currentWorkLabel(worker: WorkerInfo, tasks: WorkerTask[]): string {
  const running = tasks.find(t => t.worker_id === worker.id && t.status === 'running')
  if (running) return payloadSummary(running) || running.type
  const pending = tasks.find(t => t.worker_id === worker.id && t.status === 'pending')
  if (pending) return `排队 · ${payloadSummary(pending) || pending.type}`
  return worker.online ? '空闲' : '离线'
}
