import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../platform'

interface LogEntry {
  id: number
  flow_id: string
  session_id: string
  node_id: string
  node_name: string
  node_type: string
  log_type: string
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  error: string
  duration_ms: number
  token_usage: Record<string, unknown>
  created_at: string
}

interface HarnessTrace {
  ts?: number
  kind?: string
  type?: string
  goal?: string
  success?: boolean
  ok?: boolean
  turns?: number
  error?: string | null
  tools_used?: string[]
  result_preview?: string
  task_id?: string
  subagent_type?: string
}

interface TraceSummary {
  total: number
  by_kind: Record<string, number>
  success: number
  failure: number
  tools_used: string[]
}

interface EvalReport {
  exit_code?: number
  ok?: boolean
  ts?: number
  live_skipped?: boolean
  stages?: Record<string, { ok?: boolean; skipped?: boolean; checks?: { id: string; ok: boolean }[]; scripts?: { script: string; ok: boolean }[] }>
}

interface MonitorPanelProps {
  headerless?: boolean
}

export default function MonitorPanel({ headerless }: MonitorPanelProps) {
  const [tab, setTab] = useState<'logs' | 'harness' | 'eval'>('harness')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterFlowId, setFilterFlowId] = useState('')
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  const [bundleDir, setBundleDir] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [traces, setTraces] = useState<HarnessTrace[]>([])
  const [tracePath, setTracePath] = useState<string | null>(null)
  const [summary, setSummary] = useState<TraceSummary | null>(null)
  const [selectedTrace, setSelectedTrace] = useState<HarnessTrace | null>(null)

  const [evalPath, setEvalPath] = useState<string | null>(null)
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null)

  const fetchLogs = useCallback(async (flowId?: string) => {
    setLoading(true)
    try {
      const params = flowId ? `?flow_id=${encodeURIComponent(flowId)}` : ''
      const resp = await apiFetch(`/api/v1/monitor/logs${params}`)
      const json = await resp.json()
      setLogs(json.logs || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchTraces = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (bundleDir.trim()) q.set('bundle_dir', bundleDir.trim())
      if (workspace.trim()) q.set('workspace', workspace.trim())
      q.set('limit', '80')
      const resp = await apiFetch(`/api/v1/monitor/harness-traces?${q}`)
      const json = await resp.json()
      setTraces(json.traces || [])
      setTracePath(json.path || null)
      setSummary(json.summary || null)
    } catch { /* ignore */ }
    setLoading(false)
  }, [bundleDir, workspace])

  const fetchEval = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await apiFetch('/api/v1/monitor/eval-report')
      const json = await resp.json()
      setEvalPath(json.path || null)
      setEvalReport(json.report || null)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'logs') void fetchLogs()
    if (tab === 'harness') void fetchTraces()
    if (tab === 'eval') void fetchEval()
  }, [tab, fetchLogs, fetchTraces, fetchEval])

  const handleSearch = useCallback(() => {
    fetchLogs(filterFlowId)
    setSelectedLog(null)
  }, [filterFlowId, fetchLogs])

  const formatTime = (s: string) => {
    try { return s.replace('T', ' ').slice(0, 19) } catch { return s }
  }

  const formatTs = (ts?: number) => {
    if (!ts) return ''
    try { return new Date(ts * 1000).toLocaleString() } catch { return String(ts) }
  }

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid var(--border-light)',
        flexShrink: 0, alignItems: 'center',
      }}>
        <button className="notion-btn" style={{ fontSize: 12, fontWeight: tab === 'harness' ? 600 : 400 }} onClick={() => setTab('harness')}>
          Harness Trace
        </button>
        <button className="notion-btn" style={{ fontSize: 12, fontWeight: tab === 'logs' ? 600 : 400 }} onClick={() => setTab('logs')}>
          执行日志
        </button>
        <button className="notion-btn" style={{ fontSize: 12, fontWeight: tab === 'eval' ? 600 : 400 }} onClick={() => setTab('eval')}>
          Eval 报告
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="notion-btn"
          style={{ fontSize: 12 }}
          onClick={() => {
            if (tab === 'logs') void fetchLogs(filterFlowId)
            if (tab === 'harness') void fetchTraces()
            if (tab === 'eval') void fetchEval()
          }}
          disabled={loading}
        >
          刷新
        </button>
      </div>

      {tab === 'logs' && (
        <>
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
            <input className="notion-input" style={{ flex: 1, fontSize: 12 }} placeholder="按 flow_id 过滤"
              value={filterFlowId} onChange={e => setFilterFlowId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={handleSearch}>搜索</button>
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={() => { setFilterFlowId(''); fetchLogs(); setSelectedLog(null) }}>重置</button>
          </div>
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: selectedLog ? '0 0 240px' : 1, overflowY: 'auto', padding: '4px 8px' }}>
              {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>加载中...</div>}
              {!loading && logs.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                  暂无执行日志。运行一个流程后日志将自动记录。
                </div>
              )}
              {logs.map(log => (
                <div key={log.id} style={{
                  marginBottom: 4, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                  background: selectedLog?.id === log.id ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: `3px solid ${log.log_type === 'error' ? '#ff4d4f' : log.log_type === 'start' ? '#52c41a' : '#1890ff'}`,
                }} onClick={() => setSelectedLog(log)}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{log.node_name || log.node_id} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({log.node_type})</span></div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {formatTime(log.created_at)} · {log.duration_ms.toFixed(0)}ms
                  </div>
                </div>
              ))}
            </div>
            {selectedLog && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', borderLeft: '1px solid var(--border-light)', background: 'var(--bg-secondary)', fontSize: 11 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{selectedLog.node_name} ({selectedLog.node_type})</span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSelectedLog(null)}>✕</button>
                </div>
                <div className="section-title" style={{ marginBottom: 4 }}>输入</div>
                <pre style={{ background: 'var(--bg-primary)', borderRadius: 4, padding: 6, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto', marginBottom: 8 }}>{JSON.stringify(selectedLog.inputs, null, 2)}</pre>
                <div className="section-title" style={{ marginBottom: 4 }}>输出</div>
                <pre style={{ background: 'var(--bg-primary)', borderRadius: 4, padding: 6, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto', marginBottom: 8 }}>{JSON.stringify(selectedLog.outputs, null, 2)}</pre>
                {selectedLog.error && (
                  <>
                    <div className="section-title" style={{ marginBottom: 4, color: '#ff4d4f' }}>错误</div>
                    <pre style={{ background: '#fff2f0', borderRadius: 4, padding: 6, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ff4d4f', marginBottom: 8 }}>{selectedLog.error}</pre>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'harness' && (
        <>
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border-light)', flexShrink: 0, flexWrap: 'wrap' }}>
            <input className="notion-input" style={{ flex: 1, minWidth: 140, fontSize: 12 }} placeholder="bundle_dir（可选）"
              value={bundleDir} onChange={e => setBundleDir(e.target.value)} />
            <input className="notion-input" style={{ flex: 1, minWidth: 140, fontSize: 12 }} placeholder="workspace（可选）"
              value={workspace} onChange={e => setWorkspace(e.target.value)} />
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={() => void fetchTraces()}>加载</button>
          </div>
          {summary && (
            <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-light)' }}>
              共 {summary.total} · ok {summary.success} · fail {summary.failure}
              {summary.tools_used?.length ? ` · tools: ${summary.tools_used.slice(0, 8).join(', ')}` : ''}
              {tracePath ? ` · ${tracePath}` : ''}
            </div>
          )}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: selectedTrace ? '0 0 280px' : 1, overflowY: 'auto', padding: '4px 8px' }}>
              {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>加载中...</div>}
              {!loading && traces.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                  暂无 harness trace。在带 workspace 的 agent-loop 跑过后会出现。
                </div>
              )}
              {traces.map((t, i) => {
                const kind = t.kind || t.type || 'event'
                const bad = t.success === false || t.ok === false
                const good = t.success === true || t.ok === true
                return (
                  <div key={i} style={{
                    marginBottom: 4, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                    background: selectedTrace === t ? 'var(--bg-hover)' : 'transparent',
                    borderLeft: `3px solid ${bad ? '#ff4d4f' : good ? '#52c41a' : '#1890ff'}`,
                  }} onClick={() => setSelectedTrace(t)}>
                    <div style={{ fontWeight: 600 }}>{kind}{good ? ' · ok' : bad ? ' · fail' : ''}</div>
                    <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(t.goal || t.result_preview || t.task_id || '').slice(0, 80)}
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>{formatTs(t.ts)}</div>
                  </div>
                )
              })}
            </div>
            {selectedTrace && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', borderLeft: '1px solid var(--border-light)', background: 'var(--bg-secondary)', fontSize: 11 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{selectedTrace.kind || selectedTrace.type || 'trace'}</span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSelectedTrace(null)}>✕</button>
                </div>
                <pre style={{ background: 'var(--bg-primary)', borderRadius: 4, padding: 6, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(selectedTrace, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'eval' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12, fontSize: 12 }}>
          {loading && <div style={{ color: 'var(--text-muted)' }}>加载中...</div>}
          {!loading && !evalReport && (
            <div style={{ color: 'var(--text-muted)' }}>
              尚无报告。运行 <code>python scripts/factory_gate.py --skip-live</code> 后会出现。
            </div>
          )}
          {evalReport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                状态：{' '}
                <strong style={{ color: evalReport.ok ? '#1a7f37' : '#c0392b' }}>
                  {evalReport.ok ? '通过' : '未过'}
                </strong>
                {' · '}exit={evalReport.exit_code}
                {evalReport.live_skipped ? ' · live 跳过' : ''}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{evalPath}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatTs(evalReport.ts)}</div>
              {Object.entries(evalReport.stages || {}).map(([name, st]) => (
                <div key={name} style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    {name}{' '}
                    <span style={{ color: st.ok ? '#1a7f37' : '#c0392b', fontWeight: 400 }}>
                      {st.skipped ? 'skipped' : st.ok ? 'ok' : 'fail'}
                    </span>
                  </div>
                  {st.checks && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {st.checks.map(c => `${c.ok ? '✓' : '✗'} ${c.id}`).join(' · ')}
                    </div>
                  )}
                  {st.scripts && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {st.scripts.map(s => `${s.ok ? '✓' : '✗'} ${s.script}`).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (headerless) {
    return <div style={{ height: '100%', background: 'var(--bg-primary)' }}>{content}</div>
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--border-light)' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>观测 · Trace / 日志 / Eval</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {expanded && content}
    </div>
  )
}
