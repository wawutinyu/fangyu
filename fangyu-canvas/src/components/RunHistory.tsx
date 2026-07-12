import { useState, useMemo } from 'react'

const STORAGE_KEY = 'ai-flow-run-history'

export interface RunRecord {
  id: string
  time: number
  success: boolean
  nodeCount: number
  results: { nodeName: string; output: Record<string, unknown> }[]
  error?: string
}

export function saveRunRecord(record: RunRecord) {
  const list = loadRunRecords()
  list.unshift(record)
  if (list.length > 50) list.length = 50
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

function loadRunRecords(): RunRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

interface Props {
  onRestore?: (results: { nodeName: string; output: Record<string, unknown> }[]) => void
}

export default function RunHistory({ onRestore }: Props) {
  const [records] = useState(loadRunRecords)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleCompare = (id: string) => {
    setCompareIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const compareRecords = useMemo(() => {
    if (compareIds.length < 2) return []
    return compareIds.map(id => records.find(r => r.id === id)).filter(Boolean) as RunRecord[]
  }, [compareIds, records])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontSize: 12 }}>
      {compareIds.length >= 2 && compareRecords.length >= 2 && (
        <div style={{ borderBottom: '1px solid #eee', padding: 10, overflow: 'auto' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#888', marginBottom: 8 }}>对比视图</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f9f9f9' }}>
                <th style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'left' }}>节点</th>
                {compareRecords.map(r => (
                  <th key={r.id} style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'left' }}>
                    {new Date(r.time).toLocaleTimeString()}
                    <span style={{ color: r.success ? '#52c41a' : '#ff4d4f', marginLeft: 4 }}>{r.success ? '✓' : '✗'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(compareRecords.flatMap(r => r.results.map(x => x.nodeName)))).map(nodeName => (
                <tr key={nodeName}>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', fontWeight: 500 }}>{nodeName}</td>
                  {compareRecords.map(r => {
                    const node = r.results.find(x => x.nodeName === nodeName)
                    return (
                      <td key={r.id} style={{ padding: '4px 8px', border: '1px solid #eee', color: node ? '#333' : '#ccc' }}>
                        {node ? JSON.stringify(node.output).slice(0, 100) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {records.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无运行记录。点击「模拟运行」后自动保存。</div>
        )}
        {records.map(r => (
          <div key={r.id} style={{
            marginBottom: 6, padding: '8px 10px', borderRadius: 6, border: '1px solid #eee',
            background: compareIds.includes(r.id) ? '#f0f5ff' : '#fff',
            cursor: 'pointer',
          }} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={compareIds.includes(r.id)}
                onChange={() => toggleCompare(r.id)} onClick={e => e.stopPropagation()} />
              <span style={{ color: r.success ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{r.success ? '✓' : '✗'}</span>
              <span style={{ flex: 1 }}>{new Date(r.time).toLocaleString()}</span>
              <span style={{ color: '#888', fontSize: 11 }}>{r.nodeCount} 节点</span>
              {onRestore && (
                <button className="notion-btn" style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={e => { e.stopPropagation(); onRestore(r.results) }}>
                  查看
                </button>
              )}
            </div>
            {expandedId === r.id && (
              <div style={{ marginTop: 8, padding: 8, background: '#fafafa', borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>
                {r.results.map(node => (
                  <div key={node.nodeName} style={{ marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 11 }}>{node.nodeName}: </span>
                    <pre style={{ display: 'inline', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(node.output, null, 2).slice(0, 300)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
