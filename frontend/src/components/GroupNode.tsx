import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { AgentCanvasNode } from '../store/agentSlice'

function GroupNode({ data, selected }: NodeProps<AgentCanvasNode>) {
  const childCount = (data as any).childIds?.length || 0

  return (
    <div style={{
      background: 'rgba(114,46,209,0.04)',
      border: `2px solid ${selected ? '#722ed1' : '#d3adf7'}`,
      borderRadius: 16, padding: '16px 20px',
      minWidth: 200, minHeight: 80,
      fontFamily: 'inherit', fontSize: 13,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingBottom: 8, borderBottom: '1px solid #d3adf7',
      }}>
        <span style={{ fontSize: 14 }}>📦</span>
        <strong style={{ fontSize: 13, color: '#722ed1' }}>{data.label}</strong>
        <span style={{ fontSize: 11, color: '#aaa' }}>{childCount} 个成员</span>
      </div>
      <Handle type="target" position={Position.Left} style={{ background: '#722ed1', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: '#722ed1', width: 8, height: 8 }} />
    </div>
  )
}

export default memo(GroupNode)
