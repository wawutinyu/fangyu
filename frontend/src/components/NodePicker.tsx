import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { NODE_CATEGORIES } from '../utils/nodeRegistry'

interface NodePickerProps {
  sourceType: string
  anchor: { x: number; y: number }
  onSelect: (nodeType: string) => void
  onClose: () => void
}

const NO_INPUT = new Set(['start', 'input', 'variable-get'])

function getValidTargets(sourceType: string, allNodes: { type: string }[]): Set<string> {
  if (sourceType === 'start') {
    return new Set(['input'])
  }
  return new Set(allNodes.filter(n => !NO_INPUT.has(n.type)).map(n => n.type))
}

export default function NodePicker({ sourceType, anchor, onSelect, onClose }: NodePickerProps) {
  const [search, setSearch] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose])

  const categories = useMemo(() => {
    const validTargets = getValidTargets(sourceType,
      NODE_CATEGORIES.flatMap(c => c.nodes))
    const q = search.toLowerCase().trim()
    return NODE_CATEGORIES
      .map(cat => ({
        ...cat,
        nodes: cat.nodes.filter(n =>
          validTargets.has(n.type) &&
          (!q || n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q))
        ),
      }))
      .filter(cat => cat.nodes.length > 0)
  }, [sourceType, search])

  const pos = useMemo(() => {
    const w = 320
    let x = anchor.x - 20
    let y = anchor.y + 10
    if (x + w > window.innerWidth - 16) x = window.innerWidth - w - 16
    if (x < 16) x = 16
    return { x, y }
  }, [anchor])

  return (
    <div ref={popupRef} style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000, width: 320,
      background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      maxHeight: '60vh', display: 'flex', flexDirection: 'column',
      border: '1px solid var(--border-color)',
    }}>
      <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: 6,
          background: 'var(--bg-secondary)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)', background: 'transparent' }}
            placeholder="搜索节点..." value={search} onChange={e => setSearch(e.target.value)} autoFocus
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
        {categories.map(cat => (
          <div key={cat.name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px 3px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{cat.name}</span>
            </div>
            {cat.nodes.map(node => (
              <div key={node.type} onClick={() => onSelect(node.type)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 5, cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${cat.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: cat.bgColor }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{node.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {categories.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
            {search ? '未找到匹配节点' : '暂无可添加的节点'}
          </div>
        )}
      </div>
    </div>
  )
}
