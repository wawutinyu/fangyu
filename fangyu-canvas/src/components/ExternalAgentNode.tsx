import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { AgentCanvasNode } from '../store/agentSlice'

function ExternalAgentNode({ data }: NodeProps<AgentCanvasNode>) {
  const card = data.agentCard
  const ext = data.externalConfig
  const authorized = ext?.authorized

  return (
    <div style={{
      background: '#fff', border: '2px dashed #fa8c16', borderRadius: 12,
      padding: '10px 14px', minWidth: 190, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      fontFamily: 'inherit', fontSize: 13,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#fa8c16', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>🌐</span>
        <strong style={{ fontSize: 14, color: '#222' }}>{data.label}</strong>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 4,
          background: authorized ? '#52c41a' : '#ff4d4f', color: '#fff',
        }}>{authorized ? '已授权' : '待授权'}</span>
      </div>
      <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>
        {card?.description && <div style={{ marginBottom: 2 }}>{card.description}</div>}
        <div>外部 Agent | {ext?.rpcUrl || '未配置 RPC'}</div>
        <div>远程: {ext?.remoteName || card?.name || '-'}</div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#fa8c16', width: 8, height: 8 }} />
    </div>
  )
}

export default memo(ExternalAgentNode)
