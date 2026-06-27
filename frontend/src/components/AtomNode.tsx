import { Handle, Position, type NodeProps } from 'reactflow'
import { getNodeMeta } from '../utils/nodeRegistry'

const CATEGORY_COLORS: Record<string, string> = {
  '流程控制': '#1890ff',
  'AI 能力': '#722ed1',
  '工具集成': '#fa8c16',
  '数据操作': '#52c41a',
  '记忆存储': '#13c2c2',
}

export default function AtomNode({ data, selected }: NodeProps) {
  const originType = (data.originType as string) || 'start'
  const meta = getNodeMeta(originType)
  const catColor = CATEGORY_COLORS[meta.category] || '#999'
  const label = (data.label as string) || meta.name
  const desc = (data.desc as string) || ''

  return (
    <div style={{
      width: 160,
      border: `1.5px solid ${selected ? '#37352f' : data._simulating ? '#52c41a' : catColor}`,
      borderRadius: 8,
      background: selected ? '#f0f0ee' : '#fff',
      overflow: 'hidden',
      boxShadow: selected ? '0 0 0 2px rgba(55, 50, 47, 0.15)' : data._simulating ? '0 0 12px rgba(82, 196, 26, 0.4), 0 0 0 3px rgba(82, 196, 26, 0.2)' : undefined,
      animation: data._simulating ? 'simulatePulse 1.2s ease-in-out infinite' : undefined,
      transition: 'border-color 0.2s, box-shadow 0.2s, background 0.15s',
    }}>
      <div style={{
        height: 20,
        background: catColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        color: '#fff',
      }}>
        {meta.category}
      </div>
      <div style={{
        padding: '8px 10px 4px',
        fontSize: 13,
        fontWeight: 600,
        color: '#37352f',
        textAlign: 'center',
        lineHeight: 1.3,
      }}>
        {label}
      </div>
      {desc && (
        <div style={{
          padding: '0 10px 8px',
          fontSize: 10,
          color: '#8c8c8a',
          textAlign: 'center',
          lineHeight: 1.4,
          wordBreak: 'break-word',
        }}>
          {desc}
        </div>
      )}
      <Handle type="target" position={Position.Top} style={{ background: '#b0b0ae', width: 8, height: 8, border: '2px solid #fff' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#b0b0ae', width: 8, height: 8, border: '2px solid #fff' }} />
    </div>
  )
}
