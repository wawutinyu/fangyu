import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { AgentCanvasNode } from '../store/agentSlice'

function RouterNode({ data }: NodeProps<AgentCanvasNode>) {
  const rules = data.routingRules || []
  const defaultTarget = data.defaultTarget

  return (
    <div style={{
      background: '#fff', border: '2px solid #fa8c16', borderRadius: 12,
      padding: '10px 14px', minWidth: 160, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      fontFamily: 'inherit', fontSize: 13,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#fa8c16', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>🔀</span>
        <strong style={{ fontSize: 14, color: '#222' }}>{data.label}</strong>
      </div>
      <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>
        <div>路由规则: {rules.length}</div>
        {defaultTarget && <div>默认: {defaultTarget}</div>}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#fa8c16', width: 8, height: 8 }} />
    </div>
  )
}

export default memo(RouterNode)
