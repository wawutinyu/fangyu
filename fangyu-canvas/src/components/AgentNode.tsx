import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { AgentCanvasNode } from '../store/agentSlice'

function AgentNode({ data }: NodeProps<AgentCanvasNode>) {
  const card = data.agentCard
  const skillCount = card?.skills?.length || 0
  const trustEnabled = data.trust?.enabled
  const kind = data.agentKind || (card?.metadata?.agentKind as string) || 'worker'
  const kindLabel = kind === 'worker' ? 'Worker' : kind === 'interface' ? 'Interface' : 'Hybrid'
  const kindColor = kind === 'worker' ? '#722ed1' : kind === 'interface' ? '#1890ff' : '#13c2c2'

  return (
    <div style={{
      background: '#fff', border: '2px solid #722ed1', borderRadius: 12,
      padding: '10px 14px', minWidth: 180, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      fontFamily: 'inherit', fontSize: 13,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#722ed1', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16, filter: 'grayscale(0.3)' }}>🤖</span>
        <strong style={{ fontSize: 14, color: '#222' }}>{data.label}</strong>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: kindColor, color: '#fff' }}>{kindLabel}</span>
        {trustEnabled && <span title="ATP 可信" style={{ fontSize: 11, color: '#52c41a' }}>🔒</span>}
      </div>
      <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>
        {card?.description && <div style={{ marginBottom: 2 }}>{card.description}</div>}
        <div>技能: {skillCount} | 版本: {card?.version || '1.0.0'}</div>
        {card?.capabilities?.streaming && <span style={{ color: '#722ed1' }}>流式 ✓ </span>}
        {card?.capabilities?.pushNotifications && <span style={{ color: '#fa8c16' }}>推送 ✓</span>}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#722ed1', width: 8, height: 8 }} />
    </div>
  )
}

export default memo(AgentNode)
