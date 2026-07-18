import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../platform'
import ExternalPingRetestButton from './ExternalPingRetestButton'
import FactoryOfflineRetestButton, { offlineFactoryIds } from './FactoryOfflineRetestButton'
import { focusPresenceFromAlert } from '../utils/presenceNavigation'

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
  factories_health?: {
    count?: number
    online?: number
    offline?: number
    avg_score?: number | null
    min_score?: number | null
    max_score?: number | null
    factories?: Array<{
      id?: string
      label?: string
      online?: boolean | null
      score?: number | null
      grade?: string
      base_url?: string
    }>
  }
}

interface MonitorPanelProps {
  headerless?: boolean
}

interface MonitorAlert {
  id: string
  kind: string
  severity?: string
  title?: string
  message?: string
  ts?: number
  factory_id?: string
  base_url?: string
  source?: string
  target?: string
  detail?: Record<string, unknown>
}

export default function MonitorPanel({ headerless }: MonitorPanelProps) {
  const [tab, setTab] = useState<'logs' | 'harness' | 'eval' | 'alerts'>('harness')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterFlowId, setFilterFlowId] = useState('')
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [alerts, setAlerts] = useState<MonitorAlert[]>([])
  const [alertMeta, setAlertMeta] = useState<{
    count?: number
    offline_factories?: number
    eval_fail?: number
    ping_fail?: number
    health_regress?: number
  } | null>(null)

  const [bundleDir, setBundleDir] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [traces, setTraces] = useState<HarnessTrace[]>([])
  const [tracePath, setTracePath] = useState<string | null>(null)
  const [summary, setSummary] = useState<TraceSummary | null>(null)
  const [selectedTrace, setSelectedTrace] = useState<HarnessTrace | null>(null)

  const [evalPath, setEvalPath] = useState<string | null>(null)
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null)
  const [evalHistory, setEvalHistory] = useState<Array<{
    ts?: number
    ok?: boolean
    exit_code?: number
    live_skipped?: boolean
    live_tier?: string
    stages?: Record<string, { ok?: boolean; skipped?: boolean }>
    factories_health?: {
      count?: number
      online?: number
      offline?: number
      avg_score?: number | null
      min_score?: number | null
    }
  }>>([])
  const [compareI, setCompareI] = useState(0)
  const [compareJ, setCompareJ] = useState(1)
  const [evalCompare, setEvalCompare] = useState<{
    ok?: boolean
    left?: {
      ok?: boolean
      exit_code?: number
      ts?: number
      stages?: Record<string, { ok?: boolean; skipped?: boolean }>
      factories_health?: {
        count?: number
        online?: number
        offline?: number
        avg_score?: number | null
      }
    }
    right?: {
      ok?: boolean
      exit_code?: number
      ts?: number
      stages?: Record<string, { ok?: boolean; skipped?: boolean }>
      factories_health?: {
        count?: number
        online?: number
        offline?: number
        avg_score?: number | null
      }
    }
    compare?: {
      changed?: boolean
      exit_changed?: boolean
      stage_diffs?: Array<{ stage: string; from: { ok?: boolean; skipped?: boolean }; to: { ok?: boolean; skipped?: boolean } }>
      current?: { ok?: boolean; exit_code?: number }
      previous?: { ok?: boolean; exit_code?: number }
      factories_health_diff?: {
        changed?: boolean
        avg_score_delta?: number | null
        offline_delta?: number | null
        left?: { avg_score?: number | null; offline?: number; count?: number } | null
        right?: { avg_score?: number | null; offline?: number; count?: number } | null
      } | null
    }
  } | null>(null)
  const [evalTrend, setEvalTrend] = useState<{
    points?: Array<{ ts?: number; ok?: boolean; exit_code?: number }>
    ok_streak?: number
    compare?: {
      changed?: boolean
      exit_changed?: boolean
      stage_diffs?: Array<{ stage: string; from: { ok?: boolean }; to: { ok?: boolean } }>
    }
  } | null>(null)
  const [evalView, setEvalView] = useState<'report' | 'compare'>('report')

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
      const [rep, trend, hist] = await Promise.all([
        apiFetch('/api/v1/monitor/eval-report').then(r => r.json()),
        apiFetch('/api/v1/monitor/eval-trend?limit=12').then(r => r.json()),
        apiFetch('/api/v1/monitor/eval-history?limit=24').then(r => r.json()),
      ])
      setEvalPath(rep.path || null)
      setEvalReport(rep.report || null)
      setEvalTrend(trend || null)
      const rows = hist.history || []
      setEvalHistory(rows)
      if (rows.length >= 2) {
        setCompareJ(prev => (prev >= rows.length ? 1 : prev))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchCompare = useCallback(async (i: number, j: number) => {
    try {
      const r = await apiFetch(`/api/v1/monitor/eval-compare?i=${i}&j=${j}&limit=40`)
      const body = await r.json()
      if (r.ok) setEvalCompare(body)
      else setEvalCompare(null)
    } catch {
      setEvalCompare(null)
    }
  }, [])

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await apiFetch('/api/v1/monitor/alerts?limit=40')
      const json = await resp.json()
      setAlerts(json.alerts || [])
      setAlertMeta({
        count: json.count,
        offline_factories: json.offline_factories,
        eval_fail: json.eval_fail,
        ping_fail: json.ping_fail,
        health_regress: json.health_regress,
      })
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'logs') void fetchLogs()
    if (tab === 'harness') void fetchTraces()
    if (tab === 'eval') void fetchEval()
    if (tab === 'alerts') void fetchAlerts()
  }, [tab, fetchLogs, fetchTraces, fetchEval, fetchAlerts])

  useEffect(() => {
    const onFocusMonitor = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const nextTab = String(detail.tab || 'alerts') as 'logs' | 'harness' | 'eval' | 'alerts'
      if (nextTab === 'logs' || nextTab === 'harness' || nextTab === 'eval' || nextTab === 'alerts') {
        setTab(nextTab)
      }
      if (nextTab === 'eval' && detail.evalView === 'compare') {
        setEvalView('compare')
      }
      setExpanded(true)
    }
    window.addEventListener('fangyu:focus-bottom-monitor', onFocusMonitor)
    return () => window.removeEventListener('fangyu:focus-bottom-monitor', onFocusMonitor)
  }, [])

  useEffect(() => {
    if (tab !== 'eval' || evalView !== 'compare') return
    if (evalHistory.length < 1) return
    void fetchCompare(compareI, Math.min(compareJ, Math.max(0, evalHistory.length - 1)))
  }, [tab, evalView, compareI, compareJ, evalHistory.length, fetchCompare])

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
        <button
          className="notion-btn"
          style={{ fontSize: 12, fontWeight: tab === 'alerts' ? 600 : 400 }}
          onClick={() => setTab('alerts')}
          data-testid="monitor-alerts-tab"
        >
          告警{alertMeta?.offline_factories ? ` (${alertMeta.offline_factories})` : ''}
        </button>
        <div style={{ flex: 1 }} />
        {tab === 'eval' && (
          <>
            <button
              className="notion-btn"
              style={{ fontSize: 11, fontWeight: evalView === 'report' ? 600 : 400 }}
              onClick={() => setEvalView('report')}
              data-testid="eval-view-report"
            >
              最近
            </button>
            <button
              className="notion-btn"
              style={{ fontSize: 11, fontWeight: evalView === 'compare' ? 600 : 400 }}
              onClick={() => setEvalView('compare')}
              data-testid="eval-view-compare"
            >
              对比
            </button>
          </>
        )}
        <button
          className="notion-btn"
          style={{ fontSize: 12 }}
          onClick={() => {
            if (tab === 'logs') void fetchLogs(filterFlowId)
            if (tab === 'harness') void fetchTraces()
            if (tab === 'eval') void fetchEval()
            if (tab === 'alerts') void fetchAlerts()
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
        <div style={{ flex: 1, overflow: 'auto', padding: 12, fontSize: 12 }} data-testid="eval-panel">
          {loading && <div style={{ color: 'var(--text-muted)' }}>加载中...</div>}

          {evalView === 'report' && !loading && !evalReport && (
            <div style={{ color: 'var(--text-muted)' }}>
              尚无报告。运行 <code>python scripts/factory_gate.py --skip-live</code> 后会出现。
            </div>
          )}

          {evalView === 'report' && evalReport && (
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

              {evalReport.factories_health && (
                <div
                  data-testid="eval-factories-health"
                  style={{
                    borderTop: '1px solid var(--border-light)',
                    paddingTop: 8,
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    工厂健康
                    {evalReport.factories_health.avg_score != null
                      ? ` · 均分 ${evalReport.factories_health.avg_score}`
                      : ''}
                    {` · 离线 ${evalReport.factories_health.offline ?? 0}/${evalReport.factories_health.count ?? 0}`}
                  </div>
                  {(evalReport.factories_health.offline ?? 0) > 0 && (
                    <FactoryOfflineRetestButton
                      factoryIds={offlineFactoryIds(evalReport.factories_health.factories || [])}
                      label={`批量再探测离线厂 (${evalReport.factories_health.offline})`}
                      onDone={() => { void fetchEval() }}
                      compact
                    />
                  )}
                  {(evalReport.factories_health.factories || []).slice(0, 8).map(f => (
                    <div
                      key={String(f.id || f.label)}
                      style={{
                        display: 'flex',
                        gap: 8,
                        color: 'var(--text-muted)',
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.label || f.id}
                      </span>
                      <span style={{
                        color: f.online === false ? '#c0392b'
                          : (f.score != null && f.score < 50) ? '#d48806'
                            : '#1a7f37',
                      }}>
                        {f.online === false ? '离线' : f.online ? '在线' : '—'}
                        {f.score != null ? ` · ${f.score}${f.grade ? ` ${f.grade}` : ''}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {evalTrend && (
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    趋势 · 连续通过 {evalTrend.ok_streak ?? 0}
                    {evalTrend.compare?.changed ? ' · 较上次有变化' : ''}
                    <button
                      type="button"
                      className="notion-btn"
                      style={{ marginLeft: 8, fontSize: 10 }}
                      onClick={() => setEvalView('compare')}
                    >
                      打开对比
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {(evalTrend.points || []).map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        title={`${formatTs(p.ts)} exit=${p.exit_code} · 点选对比`}
                        onClick={() => {
                          const idx = (evalTrend.points?.length || 0) - 1 - i
                          setCompareI(0)
                          setCompareJ(Math.max(0, idx))
                          setEvalView('compare')
                        }}
                        style={{
                          width: 14, height: 14, borderRadius: 3, border: 'none', padding: 0, cursor: 'pointer',
                          background: p.ok ? '#1a7f37' : '#c0392b',
                          opacity: 0.85,
                        }}
                      />
                    ))}
                  </div>
                  {(evalTrend.compare?.stage_diffs || []).length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      阶段变化：{(evalTrend.compare?.stage_diffs || []).map(d => (
                        `${d.stage}: ${d.from?.ok ? 'ok' : 'fail'}→${d.to?.ok ? 'ok' : 'fail'}`
                      )).join(' · ')}
                    </div>
                  )}
                </div>
              )}

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

          {evalView === 'compare' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="eval-compare">
              {evalHistory.length < 2 && (
                <div style={{ color: 'var(--text-muted)' }}>
                  历史不足 2 条，无法对比。多跑几次 <code>factory_gate</code> 即可。
                </div>
              )}
              {evalHistory.length >= 2 && (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ fontSize: 11 }}>
                      左（较新）
                      <select
                        className="notion-input"
                        style={{ marginLeft: 6, fontSize: 11 }}
                        value={compareI}
                        onChange={e => setCompareI(Number(e.target.value))}
                        data-testid="eval-compare-i"
                      >
                        {evalHistory.map((h, idx) => (
                          <option key={idx} value={idx}>
                            #{idx} · {h.ok ? 'ok' : 'fail'} · exit={h.exit_code}
                            {h.factories_health?.offline != null
                              ? ` · 离线${h.factories_health.offline}`
                              : ''}
                            {' · '}{formatTs(h.ts)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: 11 }}>
                      右（对照）
                      <select
                        className="notion-input"
                        style={{ marginLeft: 6, fontSize: 11 }}
                        value={compareJ}
                        onChange={e => setCompareJ(Number(e.target.value))}
                        data-testid="eval-compare-j"
                      >
                        {evalHistory.map((h, idx) => (
                          <option key={idx} value={idx}>
                            #{idx} · {h.ok ? 'ok' : 'fail'} · exit={h.exit_code}
                            {h.factories_health?.offline != null
                              ? ` · 离线${h.factories_health.offline}`
                              : ''}
                            {' · '}{formatTs(h.ts)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {evalCompare?.compare && (
                    <div style={{
                      padding: 8, borderRadius: 6, border: '1px solid var(--border-light)',
                      background: 'var(--bg-secondary)',
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {evalCompare.compare.changed ? '有差异' : '无阶段差异'}
                        {evalCompare.compare.exit_changed ? ' · exit 变化' : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        左 exit={evalCompare.left?.exit_code} ({evalCompare.left?.ok ? 'ok' : 'fail'})
                        {' ↔ '}
                        右 exit={evalCompare.right?.exit_code} ({evalCompare.right?.ok ? 'ok' : 'fail'})
                      </div>
                      {evalCompare.compare.factories_health_diff && (
                        <div
                          data-testid="eval-compare-health-diff"
                          style={{ marginTop: 8, fontSize: 11 }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>
                            工厂健康差
                            {evalCompare.compare.factories_health_diff.changed ? ' · 有变化' : ' · 无变化'}
                          </div>
                          <div style={{ color: 'var(--text-muted)' }}>
                            左
                            {evalCompare.compare.factories_health_diff.left?.avg_score != null
                              ? ` 均分 ${evalCompare.compare.factories_health_diff.left.avg_score}`
                              : ' —'}
                            {` · 离线 ${evalCompare.compare.factories_health_diff.left?.offline ?? '—'}/${evalCompare.compare.factories_health_diff.left?.count ?? '—'}`}
                            {' ↔ '}
                            右
                            {evalCompare.compare.factories_health_diff.right?.avg_score != null
                              ? ` 均分 ${evalCompare.compare.factories_health_diff.right.avg_score}`
                              : ' —'}
                            {` · 离线 ${evalCompare.compare.factories_health_diff.right?.offline ?? '—'}/${evalCompare.compare.factories_health_diff.right?.count ?? '—'}`}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            {evalCompare.compare.factories_health_diff.avg_score_delta != null && (
                              <span style={{
                                marginRight: 10,
                                color: evalCompare.compare.factories_health_diff.avg_score_delta >= 0
                                  ? '#1a7f37' : '#c0392b',
                              }}>
                                Δ均分 {evalCompare.compare.factories_health_diff.avg_score_delta > 0 ? '+' : ''}
                                {evalCompare.compare.factories_health_diff.avg_score_delta}
                              </span>
                            )}
                            {evalCompare.compare.factories_health_diff.offline_delta != null && (
                              <span style={{
                                color: evalCompare.compare.factories_health_diff.offline_delta <= 0
                                  ? '#1a7f37' : '#c0392b',
                              }}>
                                Δ离线 {evalCompare.compare.factories_health_diff.offline_delta > 0 ? '+' : ''}
                                {evalCompare.compare.factories_health_diff.offline_delta}
                              </span>
                            )}
                          </div>
                          {(() => {
                            const ids = offlineFactoryIds(evalReport?.factories_health?.factories || [])
                            const leftOff = evalCompare.compare.factories_health_diff.left?.offline ?? 0
                            const delta = evalCompare.compare.factories_health_diff.offline_delta ?? 0
                            if (ids.length === 0 || (leftOff <= 0 && delta <= 0)) return null
                            return (
                              <FactoryOfflineRetestButton
                                factoryIds={ids}
                                label={`批量再探测离线厂 (${ids.length})`}
                                onDone={() => {
                                  void fetchEval()
                                  void fetchCompare(compareI, compareJ)
                                }}
                                compact
                              />
                            )
                          })()}
                        </div>
                      )}
                      {(evalCompare.compare.stage_diffs || []).length > 0 ? (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {(evalCompare.compare.stage_diffs || []).map(d => (
                            <div key={d.stage} style={{ fontSize: 11 }}>
                              <code>{d.stage}</code>
                              {' '}
                              {d.from?.skipped ? 'skip' : d.from?.ok ? 'ok' : 'fail'}
                              {' → '}
                              {d.to?.skipped ? 'skip' : d.to?.ok ? 'ok' : 'fail'}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>各 stage 状态一致</div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[evalCompare?.left, evalCompare?.right].map((side, col) => (
                      <div
                        key={col}
                        style={{ border: '1px solid var(--border-light)', borderRadius: 6, padding: 8 }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>
                          {col === 0 ? '左' : '右'} · {side?.ok ? '通过' : '未过'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                          {formatTs(side?.ts)} · exit={side?.exit_code}
                          {side?.factories_health?.avg_score != null
                            ? ` · 均分 ${side.factories_health.avg_score}`
                            : ''}
                          {side?.factories_health
                            ? ` · 离线 ${side.factories_health.offline ?? 0}/${side.factories_health.count ?? 0}`
                            : ''}
                        </div>
                        {Object.entries(side?.stages || {}).map(([name, st]) => (
                          <div key={name} style={{ fontSize: 11, marginBottom: 2 }}>
                            <span style={{ color: st.ok ? '#1a7f37' : '#c0392b' }}>
                              {st.skipped ? '○' : st.ok ? '✓' : '✗'}
                            </span>
                            {' '}{name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>历史列表</div>
                    {evalHistory.map((h, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (idx === compareI) setCompareJ(idx)
                          else if (idx === compareJ) setCompareI(idx)
                          else setCompareJ(idx)
                        }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '4px 6px', marginBottom: 2, fontSize: 11,
                          border: '1px solid var(--border-light)', borderRadius: 4,
                          background: idx === compareI || idx === compareJ ? 'var(--bg-hover)' : 'transparent',
                          cursor: 'pointer', color: 'inherit',
                        }}
                      >
                        #{idx} {h.ok ? '✓' : '✗'} exit={h.exit_code}
                        {h.live_tier ? ` · tier=${h.live_tier}` : ''}
                        {' · '}{formatTs(h.ts)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }} data-testid="monitor-alerts">
          {alertMeta && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              共 {alertMeta.count ?? 0} · 离线工厂 {alertMeta.offline_factories ?? 0}
              {alertMeta.eval_fail ? ` · Eval 红 ${alertMeta.eval_fail}` : ''}
              {alertMeta.ping_fail ? ` · 试跑红 ${alertMeta.ping_fail}` : ''}
              {alertMeta.health_regress ? ` · 健康回归 ${alertMeta.health_regress}` : ''}
            </div>
          )}
          {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>加载中...</div>}
          {!loading && alerts.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
              暂无告警。工厂离线、Eval 失败、健康回归、试跑失败或协作 warn 会出现在此。
            </div>
          )}
          {alerts.map(a => {
            const sev = a.severity || 'info'
            const color = sev === 'error' || sev === 'deny' ? '#c0392b'
              : sev === 'warn' ? '#d48806' : '#1890ff'
            const goPresence = () => {
              focusPresenceFromAlert(a)
            }
            return (
              <div
                key={a.id}
                style={{
                  marginBottom: 6, padding: '8px 10px', borderRadius: 6,
                  border: '1px solid var(--border-light)', borderLeft: `3px solid ${color}`,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1 }}>
                    {a.title || a.kind}
                    <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>
                      {a.kind} · {sev}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="notion-btn"
                    style={{ fontSize: 11 }}
                    onClick={goPresence}
                    data-testid="alert-go-presence"
                    title="跳转到观 · 值班墙对照事件"
                  >
                    去观
                  </button>
                </div>
                {a.kind === 'external.ping' && (
                  <ExternalPingRetestButton
                    target={a.target}
                    detail={a.detail}
                    source="MonitorPanel"
                    onDone={() => { void fetchAlerts() }}
                    compact
                  />
                )}
                {a.kind === 'factory.offline' && a.factory_id && (
                  <FactoryOfflineRetestButton
                    factoryId={a.factory_id}
                    baseUrl={a.base_url}
                    onDone={() => { void fetchAlerts() }}
                    compact
                  />
                )}
                {a.message && (
                  <div style={{ color: 'var(--text-muted)', wordBreak: 'break-word' }}>{a.message}</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {formatTs(a.ts)}
                  {a.base_url ? ` · ${a.base_url}` : ''}
                  {a.source ? ` · ${a.source}` : ''}
                </div>
              </div>
            )
          })}
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
          <span>观测 · Trace / 日志 / Eval / 告警</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {expanded && content}
    </div>
  )
}
