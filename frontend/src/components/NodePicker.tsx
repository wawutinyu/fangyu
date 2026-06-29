import { useMemo } from 'react'
import { NODE_CATEGORIES } from '../utils/nodeRegistry'

interface NodePickerProps {
  sourceType: string
  onSelect: (nodeType: string) => void
  onClose: () => void
}

const NO_INPUT = new Set(['start', 'input', 'variable-get'])
const NO_OUTPUT = new Set(['end', 'output'])

function getValidTargets(sourceType: string, allNodes: { type: string }[]): Set<string> {
  if (sourceType === 'start') {
    return new Set(['input'])
  }
  return new Set(allNodes.filter(n => !NO_INPUT.has(n.type)).map(n => n.type))
}

export default function NodePicker({ sourceType, onSelect, onClose }: NodePickerProps) {
  const categories = useMemo(() => {
    const validTargets = getValidTargets(sourceType,
      NODE_CATEGORIES.flatMap(c => c.nodes))
    return NODE_CATEGORIES
      .map(cat => ({
        ...cat,
        nodes: cat.nodes.filter(n => validTargets.has(n.type)),
      }))
      .filter(cat => cat.nodes.length > 0)
  }, [sourceType])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 16, minWidth: 360, maxWidth: 420,
        maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>添加节点</span>
          <div onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>✕</div>
        </div>
        {categories.map(cat => (
          <div key={cat.name} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{cat.name}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {cat.nodes.map(node => (
                <div key={node.type} onClick={() => onSelect(node.type)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 24, height: 24, borderRadius: 5, border: `1px solid ${cat.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: cat.bgColor }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{node.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
