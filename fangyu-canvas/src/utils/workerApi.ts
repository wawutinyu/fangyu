import { apiFetch } from '../platform'
import type {
  DispatchTaskInput,
  DispatchTaskResult,
  WorkerInfo,
  WorkerTask,
  WorkerTaskEvent,
} from '@fangyu/core/schema'

export type { WorkerInfo, WorkerTask, WorkerTaskEvent, DispatchTaskInput, DispatchTaskResult }

export async function fetchWorkers(): Promise<WorkerInfo[]> {
  const res = await apiFetch('/api/v1/workers')
  if (!res.ok) return []
  const body = await res.json()
  return body.workers ?? []
}

export async function fetchTasks(limit = 50): Promise<WorkerTask[]> {
  const res = await apiFetch(`/api/v1/workers/tasks/list?limit=${limit}`)
  if (!res.ok) return []
  const body = await res.json()
  return body.tasks ?? []
}

export async function fetchTask(taskId: string): Promise<WorkerTask | null> {
  const res = await apiFetch(`/api/v1/workers/tasks/${encodeURIComponent(taskId)}`)
  if (!res.ok) return null
  const body = await res.json()
  return body.task ?? null
}

export async function fetchTaskEvents(taskId: string, limit = 100): Promise<WorkerTaskEvent[]> {
  const res = await apiFetch(`/api/v1/workers/tasks/${encodeURIComponent(taskId)}/events?limit=${limit}`)
  if (!res.ok) return []
  const body = await res.json()
  return body.events ?? []
}

export async function fetchMqttTriggerStatus(): Promise<Record<string, unknown>> {
  const res = await apiFetch('/api/v1/workers/triggers/mqtt/status')
  if (!res.ok) return { started: false, triggers: [] }
  return res.json()
}

export async function fireMqttWorkerTrigger(topic: string, payload?: Record<string, unknown>) {
  const res = await apiFetch('/api/v1/workers/triggers/mqtt/fire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, payload }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `mqtt fire failed (${res.status})`)
  }
  return res.json()
}

export async function dispatchAdapterTest(adapter = 'mqtt_sim', workerId?: string) {
  return dispatchTask({
    type: 'adapter_invoke',
    worker_id: workerId,
    payload: {
      action: 'ingest',
      adapter,
      raw: { topic: 'fangyu/test', payload: { ping: true } },
    },
  })
}

export async function fetchAdapters(): Promise<Array<{ name: string; available?: boolean }>> {
  const res = await apiFetch('/api/v1/adapters')
  if (!res.ok) return []
  const body = await res.json()
  return body.adapters ?? []
}

export async function dispatchTask(input: DispatchTaskInput): Promise<DispatchTaskResult> {
  const res = await apiFetch('/api/v1/workers/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `dispatch failed (${res.status})`)
  }
  return res.json()
}

const TERMINAL = new Set(['done', 'failed'])

export async function pollTaskUntilDone(
  taskId: string,
  opts?: { intervalMs?: number; timeoutMs?: number; onUpdate?: (task: WorkerTask) => void },
): Promise<WorkerTask> {
  const intervalMs = opts?.intervalMs ?? 1500
  const timeoutMs = opts?.timeoutMs ?? 120_000
  const started = Date.now()

  for (;;) {
    const task = await fetchTask(taskId)
    if (!task) throw new Error('task not found')
    opts?.onUpdate?.(task)
    if (TERMINAL.has(task.status)) return task
    if (Date.now() - started > timeoutMs) {
      throw new Error('task polling timeout')
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
}
