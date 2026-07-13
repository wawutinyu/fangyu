import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { WorkerInfo, WorkerTask, WorkerTaskEvent } from '@fangyu/core/schema'
import { fetchTask, fetchTaskEvents, fetchTasks, fetchWorkers } from '../utils/workerApi'

interface Props {
  highlightTaskId?: string | null
}

type ColumnKey = 'pending' | 'running' | 'done' | 'failed'

const COLUMNS: { key: ColumnKey; label: string; color: string }[] = [
  { key: 'pending', label: '待执行', color: '#ca8a04' },
  { key: 'running', label: '进行中', color: '#2563eb' },
  { key: 'done', label: '已完成', color: '#16a34a' },
  { key: 'failed', label: '失败', color: '#dc2626' },
]

const FLEET_WIDTH = 220
const DETAIL_WIDTH = 280

function formatTs(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleTimeString()
}

function payloadSummary(task: WorkerTask): string {
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

function currentWorkLabel(worker: WorkerInfo, tasks: WorkerTask[]): string {
  const running = tasks.find(t => t.worker_id === worker.id && t.status === 'running')
  if (running) return payloadSummary(running) || running.type
  const pending = tasks.find(t => t.worker_id === worker.id && t.status === 'pending')
  if (pending) return `排队 · ${payloadSummary(pending) || pending.type}`
  if (!worker.online) return '离线'
  return '空闲'
}

/** 方隅·行 — 与 Agent 编排同构：顶栏 + 左栏 + 主区 + 右详情 */
export default function HangBoard({ highlightTaskId }: Props) {
  const [workers, setWorkers] = useState<WorkerInfo[]>([])
  const [tasks, setTasks] = useState<WorkerTask[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterWorkerId, setFilterWorkerId] = useState<string | null>(null)
  const [events, setEvents] = useState<WorkerTaskEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [w, t] = await Promise.all([fetchWorkers(), fetchTasks(100)])
      setWorkers(w)
      setTasks(t)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => { void refresh() }, 3000)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (highlightTaskId) setSelectedId(highlightTaskId)
  }, [highlightTaskId])

  const selected = tasks.find(t => t.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) {
      setEvents([])
      return
    }
    void fetchTaskEvents(selectedId).then(setEvents)
    if (selected?.status === 'pending' || selected?.status === 'running') {
      const t = setInterval(() => {
        void fetchTask(selectedId).then(task => {
          if (!task) return
          setTasks(prev => {
            const i = prev.findIndex(x => x.id === task.id)
            if (i < 0) return [task, ...prev]
            const next = [...prev]
            next[i] = task
            return next
          })
        })
        void fetchTaskEvents(selectedId).then(setEvents)
      }, 2000)
      return () => clearInterval(t)
    }
  }, [selectedId, selected?.status])

  const scopedTasks = useMemo(
    () => (filterWorkerId ? tasks.filter(t => t.worker_id === filterWorkerId) : tasks),
    [tasks, filterWorkerId],
  )

  const byColumn = useMemo(() => {
    const map: Record<ColumnKey, WorkerTask[]> = {
      pending: [], running: [], done: [], failed: [],
    }
    for (const t of scopedTasks) {
      if (COLUMNS.some(c => c.key === t.status)) {
        map[t.status as ColumnKey].push(t)
      }
    }
    map.done = map.done.slice(0, 20)
    map.failed = map.failed.slice(0, 20)
    return map
  }, [scopedTasks])

  const onlineCount = workers.filter(w => w.online).length
  const runningCount = byColumn.running.length

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, width: '100%', height: '100%', minWidth: 0, minHeight: 0,
      background: 'var(--bg-primary)',
    }}>
      {/* 与 Agent 同高顶栏 */}
      <div style={{
        height: 44, padding: '0 12px', flexShrink: 0,
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>行 · Worker</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {onlineCount} 在线 · {runningCount} 进行中
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" className="notion-btn" onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '6px 12px', color: '#b42318', fontSize: 12, borderBottom: '1px solid var(--border-light)' }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* 左：舰队 */}
        <div style={{
          width: FLEET_WIDTH, flexShrink: 0,
          borderRight: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--bg-secondary)',
        }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
            舰队
          </div>
          <button
            type="button"
            onClick={() => setFilterWorkerId(null)}
            style={fleetBtnStyle(!filterWorkerId)}
          >
            全部 Worker
          </button>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {workers.length === 0 && (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                暂无 Worker。运行 <code style={{ fontSize: 10 }}>dev-worker-tray.bat</code>
              </div>
            )}
            {workers.map(w => {
              const work = currentWorkLabel(w, tasks)
              const active = filterWorkerId === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setFilterWorkerId(active ? null : w.id)}
                  style={fleetBtnStyle(active)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: w.online ? (work === '空闲' ? '#22c55e' : '#2563eb') : '#94a3b8',
                    }} />
                    <span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.name}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    paddingLeft: 13,
                  }}>
                    {work}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 中：看板（未选任务时全宽） */}
        <div style={{
          flex: 1, minWidth: 0, display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 0, overflow: 'hidden',
        }}>
          {COLUMNS.map((col, i) => (
            <div
              key={col.key}
              style={{
                display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden',
                borderRight: i < COLUMNS.length - 1 ? '1px solid var(--border-light)' : undefined,
              }}
            >
              <div style={{
                height: 36, padding: '0 10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                borderBottom: '1px solid var(--border-light)',
                background: 'var(--bg-primary)',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{byColumn[col.key].length}</span>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-secondary)' }}>
                {byColumn[col.key].length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>暂无</div>
                )}
                {byColumn[col.key].map(task => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedId(task.id === selectedId ? null : task.id)}
                    style={{
                      textAlign: 'left', padding: '8px 9px', borderRadius: 6,
                      border: selectedId === task.id ? '1px solid var(--text-primary)' : '1px solid var(--border-color)',
                      background: 'var(--bg-primary)', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{task.type}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {formatTs(task.started_at || task.created_at)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 12, marginTop: 4, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {payloadSummary(task) || '（无摘要）'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      {task.worker_name || '未分配'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 右：仅选中任务时弹出 */}
        {selected && (
          <div style={{
            width: DETAIL_WIDTH, flexShrink: 0,
            borderLeft: '1px solid var(--border-color)',
            overflow: 'auto', padding: 12, fontSize: 12,
            background: 'var(--bg-primary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>任务详情</span>
              <button
                type="button"
                className="notion-btn"
                style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
                onClick={() => setSelectedId(null)}
                title="关闭"
              >
                关闭
              </button>
            </div>
            <Row label="状态" value={selected.status} />
            <Row label="类型" value={selected.type} />
            <Row label="Worker" value={selected.worker_name || '—'} />
            <Row label="摘要" value={payloadSummary(selected) || '—'} />
            <Row label="创建" value={formatTs(selected.created_at)} />
            {selected.error && (
              <div style={{ color: '#dc2626', marginTop: 8, whiteSpace: 'pre-wrap' }}>{selected.error}</div>
            )}
            {events.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>事件流</div>
                {events.map(ev => (
                  <div key={ev.id} style={{
                    padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: 11,
                  }}>
                    <span style={{ fontWeight: 600 }}>{ev.event_type}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{formatTs(ev.created_at)}</span>
                    {ev.message && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{ev.message}</div>}
                  </div>
                ))}
              </div>
            )}
            {selected.result && (
              <pre style={{
                marginTop: 12, padding: 10, borderRadius: 6, fontSize: 11,
                background: 'var(--bg-secondary)', overflow: 'auto', maxHeight: 200,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {JSON.stringify(selected.result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function fleetBtnStyle(active: boolean): CSSProperties {
  return {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '10px 12px', border: 'none',
    borderBottom: '1px solid var(--border-light)',
    background: active ? 'var(--bg-primary)' : 'transparent',
    cursor: 'pointer',
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 6, display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--text-muted)', width: 52, flexShrink: 0 }}>{label}</span>
      <span style={{ wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}
