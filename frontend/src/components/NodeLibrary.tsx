import React, { useCallback, useState } from 'react'
import { NODE_CATEGORIES } from '../utils/nodeRegistry'

export default function NodeLibrary() {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filteredCategories = React.useMemo(() => {
    if (!searchQuery.trim()) return NODE_CATEGORIES
    const q = searchQuery.toLowerCase().trim()
    return NODE_CATEGORIES
      .map(cat => ({
        ...cat,
        nodes: cat.nodes.filter(n =>
          n.name.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q) ||
          n.desc.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.nodes.length > 0)
  }, [searchQuery])

  const toggleCategory = useCallback((name: string) => {
    setCollapsed(prev => ({ ...prev, [name]: !prev[name] }))
  }, [])

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string, name: string, category: string) => {
    const data = JSON.stringify({ type: nodeType, name, category })
    event.dataTransfer.setData('application/reactflow', data)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  return (
    <div style={{
      width: 'var(--sidebar-width)',
      borderRight: '1px solid var(--border-color)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 10px 4px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          margin: '6px 4px 4px',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-primary)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="notion-input" style={{ border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', padding: 0 }}
            placeholder="搜索组件..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {filteredCategories.map(cat => (
          <div key={cat.name} style={{ marginBottom: 2 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => toggleCategory(cat.name)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: collapsed[cat.name] ? 'rotate(-90deg)' : undefined }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{cat.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cat.nodes.length}</span>
            </div>
            {!collapsed[cat.name] && (
              <div style={{ padding: '2px 8px 4px' }}>
                {cat.nodes.map(node => (
                  <div key={node.type} draggable onDragStart={e => onDragStart(e, node.type, node.name, cat.name)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--radius-sm)', cursor: 'grab' }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${cat.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: cat.bgColor }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{node.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {filteredCategories.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>未找到匹配组件</div>
        )}
      </div>
    </div>
  )
}
