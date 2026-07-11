import { Handle, Position, type NodeProps } from 'reactflow'
import type { FlowNodeData, InnerNodeDef, InnerLinkDef } from '../types'

const LINK_COLORS: Record<string, string> = {
  serial: '#37352f',
  branch: '#fa8c16',
  parallel: '#722ed1',
}


const LINK_LABELS: Record<string, string> = {
  serial: '→',
  branch: '⇢',
  parallel: '⇉',
}

export default function CompositeNode({ data, selected }: NodeProps<FlowNodeData>) {
  const label = data.label || '组合原子'
  const innerNodes = (data.inner_nodes || []) as InnerNodeDef[]
  const innerLinks = (data.inner_links || []) as InnerLinkDef[]
  const desc = data.desc || ''

  const nodeNames = new Map(innerNodes.map(n => [n.id, (n.label || n.name || n.originType)]))
  const incomingLinks = new Map<string, { fromId: string; type: string }[]>()
  for (const l of innerLinks) {
    const tgt = l.targetNodeId
    if (!incomingLinks.has(tgt)) incomingLinks.set(tgt, [])
    incomingLinks.get(tgt)!.push({ fromId: l.sourceNodeId, type: l.linkType || 'serial' })
  }

  return (
    <div style={{
      width: 220,
      minHeight: 60,
      border: `2px ${selected ? 'solid' : 'dashed'} #37352f`,
      borderRadius: 8,
      background: selected ? '#ebebe9' : '#f7f7f5',
      padding: '8px 12px',
      transition: 'border 0.15s, background 0.15s',
      boxShadow: selected ? '0 0 0 2px rgba(55, 50, 47, 0.15)' : undefined,
      fontSize: 13,
      fontWeight: 600,
      color: '#37352f',
    }}>
      <div style={{ textAlign: 'center', marginBottom: innerNodes.length > 0 ? 6 : 0 }}>{label}</div>
      {desc && <div style={{ fontSize: 10, color: '#8c8c8a', textAlign: 'center', marginBottom: 4, lineHeight: 1.3 }}>{desc}</div>}
      {innerNodes.length > 0 && (
        <div style={{ borderTop: '1px solid #e0e0de', paddingTop: 4 }}>
          {innerNodes.map((n, i) => {
            const nid = n.id
            const nlabel = nodeNames.get(nid) || nid
            const inLinks = incomingLinks.get(nid) || []
            return (
              <div key={i} style={{ fontSize: 10, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap', padding: '1px 0' }}>
                {inLinks.length > 0 && inLinks.map((lnk, li) => (
                  <span key={li} style={{ color: LINK_COLORS[lnk.type] || '#999', fontWeight: 400, fontSize: 9, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {LINK_LABELS[lnk.type] || '→'}
                    <span style={{ marginRight: 1 }}>{nodeNames.get(lnk.fromId) || lnk.fromId}</span>
                  </span>
                ))}
                {inLinks.length === 0 && <span style={{ color: '#ccc', flexShrink: 0 }}>• </span>}
                <span style={{ color: '#37352f', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nlabel}</span>
              </div>
            )
          })}
        </div>
      )}
      <Handle type="target" position={Position.Top} style={{ background: '#37352f', width: 8, height: 8, border: '2px solid #fff' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#37352f', width: 8, height: 8, border: '2px solid #fff' }} />
    </div>
  )
}
