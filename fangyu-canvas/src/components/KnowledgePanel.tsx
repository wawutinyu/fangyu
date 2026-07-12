import { useState, useEffect, useCallback, useRef } from 'react'

interface DocEntry {
  id: number
  name: string
  chunk_count: number
  created_at: string
}

interface KnowledgePanelProps {
  headerless?: boolean
}

export default function KnowledgePanel({ headerless }: KnowledgePanelProps) {
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/v1/knowledge/docs')
      const json = await resp.json()
      setDocs(json.docs || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const handleUploadClick = useCallback(() => {
    fileRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await fetch('/api/v1/knowledge/upload', { method: 'POST', body: form })
      fetchDocs()
    } catch { /* ignore */ }
    setUploading(false)
    e.target.value = ''
  }, [fetchDocs])

  const handleRemove = useCallback(async (id: number) => {
    try {
      await fetch(`/api/v1/knowledge/docs/${id}`, { method: 'DELETE' })
      fetchDocs()
    } catch { /* ignore */ }
  }, [fetchDocs])

  const content = (
    <div style={{ overflowY: 'auto', padding: '8px 14px' }}>
      <button className="notion-btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 8, opacity: uploading ? 0.6 : 1 }}
        onClick={handleUploadClick} disabled={uploading}
      >
        {uploading ? '上传中...' : '+ 上传文档'}
      </button>
      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>加载中...</div>}
      {!loading && docs.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
          暂无文档。点击上方按钮上传 .txt / .md 文件。
        </div>
      )}
      {docs.map(doc => (
        <div key={doc.id} style={{ marginBottom: 8, padding: 8, borderRadius: 6, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--border-light)', padding: '0 4px', borderRadius: 3 }}>{doc.chunk_count} 块</span>
              <button style={{ fontSize: 10, color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 4, padding: '1px 6px', background: '#fff2f0', cursor: 'pointer' }}
                onClick={() => handleRemove(doc.id)}
              >删除</button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{doc.created_at}</div>
        </div>
      ))}
    </div>
  )

  if (headerless) {
    return (
      <div style={{ height: '100%', background: 'var(--bg-primary)' }}>
        <input ref={fileRef} type="file" accept=".txt,.md,.json" style={{ display: 'none' }} onChange={handleFileSelected} />
        {content}
      </div>
    )
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', flexShrink: 0 }}>
      <input ref={fileRef} type="file" accept=".txt,.md,.json" style={{ display: 'none' }} onChange={handleFileSelected} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--border-light)' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          <span>知识库 ({docs.length})</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {expanded && content}
    </div>
  )
}
