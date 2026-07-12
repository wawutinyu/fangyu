import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkerInfo, WorkerTask, WorkerTaskEvent } from '@fangyu/core/schema'
import { fetchTask, fetchTaskEvents, fetchTasks, fetchWorkers } from '../utils/workerApi'

interface Props {
  highlightTaskId?: string | null
}

type StatusFilter = 'all' | 'pending' | 'running' | 'done' | 'failed'

function statusColor(status: string): string {
  if (status === 'done') return '#16a34a'
  if (status === 'failed') return '#dc2626'
  if (status === 'running') return '#2563eb'
  return '#ca8a04'
}

function formatTs(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function payloadSummary(task: WorkerTask): string {
  const p = task.payload ?? {}
  if (task.type === 'run_flow') {
    const name = typeof p.snapshot_name === 'string' ? p.snapshot_name : null
    const nodes = Array.isArray(p.nodes) ? p.nodes.length : 0
    return name ? `${name} · ${nodes} 节点` : `${nodes} 节点`
  }
  if (task.type === 'shell') {
    const cmd = typeof p.command === 'string' ? p.command : ''
    return cmd.length > 48 ? `${cmd.slice(0, 48)}…` : cmd
  }
  if (task.type === 'read_file' || task.type === 'write_file') {
    return typeof p.path === 'string' ? p.path : ''
  }
  return ''
}

export default function WorkerPanel({ highlightTaskId }: Props) {
  const [workers, setWorkers] = useState<WorkerInfo[]>([])
  const [tasks, setTasks] = useState<WorkerTask[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [events, setEvents] = useState<WorkerTaskEvent[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [w, t] = await Promise.all([fetchWorkers(), fetchTasks(80)])
      setWorkers(w)
      setTasks(t)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (highlightTaskId) {
      setSelectedId(highlightTaskId)
      void fetchTask(highlightTaskId).then(t => {
        if (t) setTasks(prev => {
          const idx = prev.findIndex(x => x.id === t.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = t
            return next
          }
          return [t, ...prev]
        })
      })
    }
  }, [highlightTaskId])

  const selected = tasks.find(t => t.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) {
      setEvents([])
      return
    }
    void fetchTaskEvents(selectedId).then(setEvents)
  }, [selectedId, selected?.status])

  const onlineCount = workers.filter(w => w.online).length

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (selectedWorkerId && t.worker_id !== selectedWorkerId) return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      return true
    })
  }, [tasks, selectedWorkerId, statusFilter])

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待执行' },
    { key: 'running', label: '运行中' },
    { key: 'done', label: '完成' },
    { key: 'failed', label: '失败' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderBottom: '1px solid var(--border-light)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>方隅·行</span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: onlineCount > 0 ? 'rgba(34,197,94,0.12)' : 'var(--bg-secondary)',
          color: onlineCount > 0 ? '#16a34a' : 'var(--text-muted)',
        }}>
          {onlineCount} 在线 / {workers.length} 已注册
        </span>
        <div style={{ flex: 1 }} />
        <button className="notion-btn" style={{ fontSize: 12 }} onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ width: 220, borderRight: '1px solid var(--border-light)', overflow: 'auto', flexShrink: 0 }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Worker 舰队</div>
          <button
            type="button"
            onClick={() => setSelectedWorkerId(null)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '6px 12px', border: 'none', borderBottom: '1px solid var(--border-light)',
              background: !selectedWorkerId ? 'var(--bg-secondary)' : 'transparent',
              cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)',
            }}
          >
            全部 Worker
          </button>
          {workers.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              暂无 Worker。运行 <code style={{ fontSize: 11 }}>dev-worker-tray.bat</code>
            </div>
          )}
          {workers.map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => setSelectedWorkerId(w.id === selectedWorkerId ? null : w.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border-light)',
                background: selectedWorkerId === w.id ? 'var(--bg-secondary)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: w.online ? '#22c55e' : '#94a3b8',
                }} />
                {w.name}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                {w.hostname} · {w.os}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                {(w.capabilities ?? []).join(', ')}
              </div>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border-light)',
            flexShrink: 0, overflowX: 'auto',
          }}>
            {statusTabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border-light)',
                  background: statusFilter === tab.key ? 'var(--bg-secondary)' : 'transparent',
                  color: statusFilter === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'auto', borderRight: selected ? '1px solid var(--border-light)' : undefined }}>
            {filteredTasks.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                暂无任务。在画布点「派发至行」发布并下发。
              </div>
            )}
            {filteredTasks.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border-light)',
                  background: selectedId === t.id ? 'var(--bg-secondary)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: statusColor(t.status) }}>{t.status}</span>
                  <span style={{ fontWeight: 500 }}>{t.type}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.worker_name ?? '—'}</span>
                </div>
                {payloadSummary(t) && (
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', marginTop: 4 }}>{payloadSummary(t)}</div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
                  {t.id.slice(0, 8)}… · {formatTs(t.created_at)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div style={{ width: '42%', overflow: 'auto', padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>任务详情</div>
            <div style={{ marginBottom: 6 }}><strong>ID</strong> <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{selected.id}</span></div>
            <div style={{ marginBottom: 6 }}><strong>状态</strong> <span style={{ color: statusColor(selected.status) }}>{selected.status}</span></div>
            <div style={{ marginBottom: 6 }}><strong>Worker</strong> {selected.worker_name ?? '—'}</div>
            <div style={{ marginBottom: 6 }}><strong>类型</strong> {selected.type}</div>
            {typeof selected.payload?.snapshot_name === 'string' && (
              <div style={{ marginBottom: 6 }}><strong>发布快照</strong> {selected.payload.snapshot_name as string}</div>
            )}
            {typeof selected.payload?.snapshot_id === 'string' && (
              <div style={{ marginBottom: 6 }}><strong>快照 ID</strong> <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{selected.payload.snapshot_id as string}</span></div>
            )}
            {payloadSummary(selected) && (
              <div style={{ marginBottom: 6 }}><strong>摘要</strong> {payloadSummary(selected)}</div>
            )}
            <div style={{ marginBottom: 6, color: 'var(--text-muted)', fontSize: 11 }}>
              创建 {formatTs(selected.created_at)}
              {selected.started_at ? ` · 开始 ${formatTs(selected.started_at)}` : ''}
              {selected.finished_at ? ` · 结束 ${formatTs(selected.finished_at)}` : ''}
            </div>
            {selected.error && (
              <div style={{ marginBottom: 8, color: '#dc2626', whiteSpace: 'pre-wrap' }}>{selected.error}</div>
            )}
            {events.length > 0 && (
              <>
                <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>事件</div>
                <div style={{ marginBottom: 8 }}>
                  {events.map(ev => (
                    <div key={ev.id} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border-light)' }}>
                      <span style={{ color: statusColor(ev.event_type), fontWeight: 600 }}>{ev.event_type}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{formatTs(ev.created_at)}</span>
                      {ev.message && <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>{ev.message}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
            {selected.result && (
              <>
                <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>执行结果</div>
                <pre style={{
                  margin: 0, padding: 10, borderRadius: 6, fontSize: 11,
                  background: 'var(--bg-secondary)', overflow: 'auto', maxHeight: 240,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {JSON.stringify(selected.result, null, 2)}
                </pre>
              </>
            )}
            {!selected.result && !selected.error && (selected.status === 'pending' || selected.status === 'running') && (
              <div style={{ color: 'var(--text-muted)', marginTop: 8 }}>等待 Worker 执行…</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
