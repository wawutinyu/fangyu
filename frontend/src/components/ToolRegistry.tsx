import { useState, useEffect, useCallback } from 'react'

interface ToolEntry {
  name: string
  description: string
  parameters: Record<string, unknown>
  implementation: Record<string, unknown>
  enabled: boolean
}

export default function ToolRegistry() {
  const [tools, setTools] = useState<ToolEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchTools = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/v1/tools/')
      const json = await resp.json()
      setTools(json.tools || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTools() }, [fetchTools])

  const handleRemove = useCallback(async (name: string) => {
    try {
      await fetch('/api/v1/tools/unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      fetchTools()
    } catch { /* ignore */ }
  }, [fetchTools])

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--border-light)' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <span>工具注册表 ({tools.length})</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {expanded && (
        <div style={{ maxHeight: 200, overflowY: 'auto', padding: '8px 14px' }}>
          {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>加载中...</div>}
          {!loading && tools.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
              暂无注册工具。使用「工具注册」节点从 LLM 输出自动注册。
            </div>
          )}
          {tools.map(tool => (
            <div key={tool.name} style={{ marginBottom: 8, padding: 8, borderRadius: 6, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{tool.name}</span>
                <button style={{ fontSize: 10, color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 4, padding: '1px 6px', background: '#fff2f0', cursor: 'pointer' }}
                  onClick={() => handleRemove(tool.name)}
                >删除</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tool.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
