export type WorkerTaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface WorkerInfo {
  id: string
  name: string
  hostname: string
  os: string
  capabilities: string[]
  online: boolean
  registered_at?: number
  last_seen?: number
}

export interface WorkerTask {
  id: string
  worker_id: string | null
  worker_name?: string | null
  type: string
  payload: Record<string, unknown>
  status: WorkerTaskStatus
  result: Record<string, unknown> | null
  error: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
}

export type WorkerTaskType = 'shell' | 'run_flow' | 'read_file' | 'write_file'

export interface DispatchTaskInput {
  type: WorkerTaskType
  payload: Record<string, unknown>
  worker_id?: string
  worker_name?: string
}

export interface WorkerTaskEvent {
  id: number
  task_id: string
  event_type: string
  message: string
  detail: Record<string, unknown> | null
  created_at: number
}

export interface DispatchTaskResult {
  task_id: string
  status: WorkerTaskStatus
  assigned_worker_id?: string | null
  assigned_worker_name?: string | null
}
