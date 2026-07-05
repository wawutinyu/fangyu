import { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react'
import { NODE_CATEGORIES } from '../utils/nodeRegistry'

interface NodePickerProps {
  compatibleTypes: string[]
  anchorRect: DOMRect
  onSelect: (nodeType: string) => void
  onClose: () => void
}

const compatibleSet = (types: string[]) => new Set(types)

export default function NodePicker({ compatibleTypes, anchorRect, onSelect, onClose }: NodePickerProps) {
  const [search, setSearch] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [popupHeight, setPopupHeight] = useState(480)

  useLayoutEffect(() => {
    const popupW = 320
    let x = anchorRect.right + 4
    let y = anchorRect.top - 8
    if (x + popupW > window.innerWidth - 16) {
      x = anchorRect.left - popupW - 4
    }
    if (y < 8) y = 8
    if (y + 300 > window.innerHeight) {
      y = Math.max(8, window.innerHeight - 316)
    }
    setPos({ x, y })
    setPopupHeight(Math.min(480, window.innerHeight - y - 16))
  }, [anchorRect])

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
    window.addEventListener('mousedown', handler, true)
    return () => window.removeEventListener('mousedown', handler, true)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const validTypes = useMemo(() => compatibleSet(compatibleTypes), [compatibleTypes])

  const categories = useMemo(() => {
    const q = search.toLowerCase().trim()
    return NODE_CATEGORIES
      .map(cat => ({
        ...cat,
        nodes: cat.nodes.filter(n =>
          validTypes.has(n.type) &&
          (!q || n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q))
        ),
      }))
      .filter(cat => cat.nodes.length > 0)
  }, [validTypes, search])

  const allCount = compatibleTypes.length

  return (
    <div ref={popupRef} style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999, width: 320,
      background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      height: popupHeight, border: '1px solid #e8e8e8',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6,
          background: '#fafafa',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, color: '#333', background: 'transparent' }}
            placeholder={`搜索节点 (${allCount}个可用)`} value={search} onChange={e => setSearch(e.target.value)} autoFocus
          />
        </div>
      </div>
      <div style={{ overflowY: 'auto', padding: '4px', flex: 1, minHeight: 0 }}
        onWheel={e => e.stopPropagation()}>
        {categories.map(cat => (
          <div key={cat.name}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 8px 3px', fontSize: 10, fontWeight: 600,
              color: '#888', textTransform: 'uppercase', letterSpacing: '0.3px',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              {cat.name} ({cat.nodes.length})
            </div>
            {cat.nodes.map(node => (
              <div key={node.type} onClick={(e) => { e.stopPropagation(); onSelect(node.type) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px',
                  borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#333',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 4,
                  border: `1px solid ${cat.color}`, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: cat.bgColor || '#fff',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="2">
                    <circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{node.name}</div>
                  <div style={{ fontSize: 10, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {categories.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#bbb' }}>
            {search ? '未找到匹配节点' : '暂无可添加的节点'}
          </div>
        )}
      </div>
    </div>
  )
}
