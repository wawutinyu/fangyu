import { useState, useEffect, useCallback } from 'react'

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

interface MonitorPanelProps {
  headerless?: boolean
}

export default function MonitorPanel({ headerless }: MonitorPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterFlowId, setFilterFlowId] = useState('')
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  const fetchLogs = useCallback(async (flowId?: string) => {
    setLoading(true)
    try {
      const params = flowId ? `?flow_id=${encodeURIComponent(flowId)}` : ''
      const resp = await fetch(`/api/v1/monitor/logs${params}`)
      const json = await resp.json()
      setLogs(json.logs || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleSearch = useCallback(() => {
    fetchLogs(filterFlowId)
    setSelectedLog(null)
  }, [filterFlowId, fetchLogs])

  const formatTime = (s: string) => {
    try { return s.replace('T', ' ').slice(0, 19) } catch { return s }
  }

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
                {log.log_type === 'error' && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>❌</span>}
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
            <div style={{ color: 'var(--text-muted)' }}>
              耗时: {selectedLog.duration_ms.toFixed(0)}ms
              {Object.keys(selectedLog.token_usage).length > 0 && <> · Token: {JSON.stringify(selectedLog.token_usage)}</>}
            </div>
            <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>时间: {formatTime(selectedLog.created_at)}</div>
          </div>
        )}
      </div>
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
          <span>执行日志 ({logs.length})</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {expanded && content}
    </div>
  )
}
