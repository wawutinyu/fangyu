import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { runLocalFlow } from '../utils/localExecutor'
import { getReactFlowInstance } from './FlowCanvas'
import type { Node, Edge } from 'reactflow'

interface RowResult {
  rowIndex: number
  label: string
  success: boolean
  outputs: Record<string, unknown>
  error?: string
  time: number
}

export default function BatchRunner({ onClose }: { onClose: () => void }) {
  const [inputText, setInputText] = useState('')
  const [results, setResults] = useState<RowResult[] | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const parseInput = useCallback((): Record<string, string>[] => {
    const trimmed = inputText.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed : [parsed]
    }
    const lines = trimmed.split('\n').filter(Boolean)
    const headers = lines[0].split(',').map(h => h.trim())
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = vals[i] || '' })
      return row
    })
  }, [inputText])

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setInputText(ev.target?.result as string || '')
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const runBatch = useCallback(async () => {
    const rows = parseInput()
    if (rows.length === 0) { alert('请先输入测试数据（JSON 数组或 CSV）'); return }
    const rf = getReactFlowInstance()
    if (!rf) { alert('请先打开 Flow 画布'); return }
    const nodes: Node[] = rf.getNodes()
    const edges: Edge[] = rf.getEdges()
    if (nodes.length === 0) { alert('Flow 画布为空'); return }

    setRunning(true)
    setResults(null)
    setProgress(0)
    const results: RowResult[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const label = `#${i + 1}`
      const t0 = performance.now()
      try {
        const res = await runLocalFlow(nodes, edges, {
          autoResolveInput: true,
          onProgress: () => {},
          onPending: () => {},
        })
        results.push({ rowIndex: i, label, success: res.success, outputs: res.results.reduce((acc, r) => ({ ...acc, [r.nodeName]: r.output }), {}), time: performance.now() - t0 })
      } catch (err) {
        results.push({ rowIndex: i, label, success: false, outputs: {}, error: String(err), time: performance.now() - t0 })
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100))
    }
    setResults(results)
    setRunning(false)
  }, [parseInput])

  const successCount = results?.filter(r => r.success).length || 0

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: 800, maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #eee' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>批量测试</span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
            浏览器本地沙箱 · 与工具栏预览/底部真跑不同引擎
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#888' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflow: 'auto' }}>
          <div style={{ fontSize: 12, color: '#888' }}>输入测试数据（每行一条，JSON 数组 或 CSV 格式）</div>
          <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder='[{"query": "hello"}, {"query": "world"}]
或 CSV:
query,name
hello,Alice
world,Bob'
            style={{ width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12, padding: 8, border: '1px solid #e8e8e8', borderRadius: 6, resize: 'vertical' }} />
          <input ref={fileRef} type="file" accept=".csv,.json" style={{ display: 'none' }} onChange={handleFile} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => fileRef.current?.click()} className="notion-btn" style={{ fontSize: 12 }}>上传文件</button>
            <button onClick={runBatch} disabled={running} className="notion-btn primary" style={{ fontSize: 12 }}>
              {running ? `运行中 ${progress}%` : '运行批量测试'}
            </button>
          </div>

          {running && (
            <div style={{ height: 4, background: '#eee', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#722ed1', transition: 'width 0.3s' }} />
            </div>
          )}

          {results && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              共 {results.length} 行，成功 {successCount}，失败 {results.length - successCount}
            </div>
          )}

          {results && results.length > 0 && (
            <div style={{ overflow: 'auto', border: '1px solid #eee', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>结果</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>用时</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>输出</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.rowIndex} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px 8px' }}>{r.label}</td>
                      <td style={{ padding: '4px 8px', color: r.success ? '#52c41a' : '#ff4d4f' }}>{r.success ? '✓' : '✗'}</td>
                      <td style={{ padding: '4px 8px' }}>{r.time.toFixed(0)}ms</td>
                      <td style={{ padding: '4px 8px', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap' }}>
                        {r.error || JSON.stringify(r.outputs).slice(0, 200)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
