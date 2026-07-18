export type PresenceKind = 'agent' | 'worker'
export type PresenceStatus = 'idle' | 'busy' | 'offline' | 'error' | 'unauthorized'

export interface PresenceEntity {
  id: string
  kind: PresenceKind
  name: string
  label: string
  status: PresenceStatus | string
  online: boolean
  external?: boolean
  authorized?: boolean
  current_skill?: string | null
  task_id?: string | null
  hostname?: string
  os?: string
  rpc_url?: string | null
  updated_at?: number
  /** 部门展示名 */
  department?: string | null
  /** 部门稳定 id，如 dept-sense */
  department_id?: string | null
  /** 画布节点 id（部署名），便于观↔序对照 */
  canvas_id?: string | null
}

export type CollaborationSeverity = 'info' | 'warn' | 'deny' | 'error'

export interface CollaborationEvent {
  id: string
  ts: number
  kind: string
  actor: string
  target?: string | null
  message: string
  detail?: Record<string, unknown>
  severity: CollaborationSeverity | string
}

export interface CollaborationEdge {
  source: string
  target: string
  count: number
  last_kind?: string
  last_ts?: number
  last_severity?: string
}

/** 部门下一栋宅（大部门可多宅） */
export interface DepartmentHouse {
  id: string
  label: string
  member_ids: string[]
}

/** 观 · 部门 = 可含多栋宅 */
export interface PresenceDepartment {
  id: string
  label: string
  houses: DepartmentHouse[]
}

export interface PresenceSnapshot {
  presence: PresenceEntity[]
  events: CollaborationEvent[]
  edges?: CollaborationEdge[]
  departments?: PresenceDepartment[]
  summary: {
    agents: number
    agents_busy: number
    workers: number
    workers_online: number
    events: number
    edges?: number
    departments?: number
  }
  ts: number
}
