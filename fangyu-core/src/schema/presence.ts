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

export interface PresenceSnapshot {
  presence: PresenceEntity[]
  events: CollaborationEvent[]
  edges?: CollaborationEdge[]
  summary: {
    agents: number
    agents_busy: number
    workers: number
    workers_online: number
    events: number
    edges?: number
  }
  ts: number
}
