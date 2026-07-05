import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppSelector } from '../store/hooks'
import { getUpstreamSelectors } from '../utils/variablePool'

interface Props {
  value: string
  onSelect: (selector: string) => void
  nodeId: string | null
}

export default function VariableSelector({ value, onSelect, nodeId }: Props) {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const nodes = useAppSelector(s => s.flow.nodes)
  const edges = useAppSelector(s => s.flow.edges)

  const selectors = nodeId ? getUpstreamSelectors(nodeId, nodes, edges) : []

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (selectors.length === 0) return null

  return (
    <>
      <button
        ref={btnRef}
        className="var-selector-btn"
        style={{
          fontSize: 11, padding: '2px 6px', border: '1px solid var(--border-color)',
          borderRadius: 4, background: 'var(--bg-primary)', cursor: 'pointer',
          color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 2,
          flexShrink: 0, fontFamily: 'monospace',
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setPopoverPos({ top: rect.bottom + 4, left: rect.left })
          setOpen(o => !o)
        }}
        title="插入变量引用 {{nodeId.field}}"
      >
        {'{ }'}
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 10000,
            background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            minWidth: 200, maxHeight: 240, overflowY: 'auto',
          }}
        >
          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid var(--border-light)' }}>
            上游变量
          </div>
          {selectors.map((s, i) => (
            <button
              key={i}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 12, color: 'var(--text-primary)',
                borderBottom: i < selectors.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}
              onClick={() => { onSelect(`{{${s.selector}}}`); setOpen(false) }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 500 }}>{s.nodeLabel}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>.</span>
              <span style={{ color: 'var(--accent-color)' }}>{s.portName}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
