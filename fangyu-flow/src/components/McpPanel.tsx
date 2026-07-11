import { useState, useEffect, useCallback } from 'react'

interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface McpServerInfo {
  name: string
  base_url: string
  connected: boolean
}

interface McpPanelProps {
  headerless?: boolean
}

export default function McpPanel({ headerless }: McpPanelProps) {
  const [tools, setTools] = useState<McpToolInfo[]>([])
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [connectName, setConnectName] = useState('')
  const [connectUrl, setConnectUrl] = useState('')
  const [connectKey, setConnectKey] = useState('')
  const [selectedServer, setSelectedServer] = useState('__internal__')

  const fetchTools = useCallback(async (server?: string) => {
    setLoading(true)
    try {
      const s = server || selectedServer
      const resp = await fetch(`/api/v1/mcp/tools?server=${encodeURIComponent(s)}`)
      const json = await resp.json()
      setTools(json.tools || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [selectedServer])

  const fetchServers = useCallback(async () => {
    try {
      const resp = await fetch('/api/v1/mcp/servers')
      const json = await resp.json()
      setServers(json.servers || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchTools(); fetchServers() }, [fetchTools, fetchServers])

  const handleConnect = useCallback(async () => {
    if (!connectName || !connectUrl) return
    try {
      await fetch('/api/v1/mcp/servers/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: connectName, base_url: connectUrl, api_key: connectKey }),
      })
      setConnectName(''); setConnectUrl(''); setConnectKey('')
      fetchServers()
    } catch { /* ignore */ }
  }, [connectName, connectUrl, connectKey, fetchServers])

  const handleDisconnect = useCallback(async (name: string) => {
    try {
      await fetch(`/api/v1/mcp/servers/${encodeURIComponent(name)}/disconnect`, { method: 'POST' })
      fetchServers()
      if (selectedServer === name) setSelectedServer('__internal__')
    } catch { /* ignore */ }
  }, [fetchServers, selectedServer])

  const handleServerChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedServer(e.target.value)
    fetchTools(e.target.value)
  }, [fetchTools])

  const content = (
    <div style={{ overflowY: 'auto', padding: '8px 14px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>选择 MCP 服务器</div>
        <select className="notion-input" value={selectedServer} onChange={handleServerChange}
          style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
        >
          <option value="__internal__">内置工具 (__internal__)</option>
          {servers.map(s => (
            <option key={s.name} value={s.name}>{s.name} ({s.base_url})</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12, padding: 8, borderRadius: 6, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>连接外部 MCP 服务器</div>
        <input className="notion-input" style={{ width: '100%', fontSize: 12, marginBottom: 4 }} placeholder="服务器名称"
          value={connectName} onChange={e => setConnectName(e.target.value)}
        />
        <input className="notion-input" style={{ width: '100%', fontSize: 12, marginBottom: 4 }} placeholder="URL (如 https://mcp.example.com)"
          value={connectUrl} onChange={e => setConnectUrl(e.target.value)}
        />
        <input className="notion-input" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} placeholder="API Key (可选)"
          value={connectKey} onChange={e => setConnectKey(e.target.value)} type="password"
        />
        <button className="notion-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={handleConnect}>连接</button>
      </div>

      {servers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>已连接的服务器</div>
          {servers.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 4, background: 'var(--bg-secondary)', marginBottom: 4, fontSize: 12 }}>
              <span><strong>{s.name}</strong> <span style={{ color: 'var(--text-muted)' }}>{s.base_url}</span></span>
              <button style={{ fontSize: 10, color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 4, padding: '1px 6px', background: '#fff2f0', cursor: 'pointer' }}
                onClick={() => handleDisconnect(s.name)}
              >断开</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
        可用工具 ({tools.length})
      </div>
      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>加载中...</div>}
      {!loading && tools.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
          该服务器暂无可用工具。
        </div>
      )}
      {tools.map(tool => (
        <div key={tool.name} style={{ marginBottom: 8, padding: 8, borderRadius: 6, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', marginBottom: 2 }}>{tool.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tool.description}</div>
        </div>
      ))}
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          <span>MCP 协议 ({tools.length})</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {expanded && content}
    </div>
  )
}
