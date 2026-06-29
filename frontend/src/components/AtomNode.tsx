import { useCallback, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { getNodeMeta } from '../utils/nodeRegistry'
import NodePicker from './NodePicker'

const CATEGORY_COLORS: Record<string, string> = {
  '流程控制': '#1890ff',
  'AI 能力': '#722ed1',
  '工具集成': '#fa8c16',
  '数据操作': '#52c41a',
  '记忆存储': '#13c2c2',
}

function buildPorts(schema: { name: string; label?: string }[], branchCount?: number) {
  const ports = schema.map(s => ({ ...s }))
  if (branchCount && branchCount > 2) {
    const first = ports.slice(0, 2)
    const extras = Array.from({ length: branchCount - 2 }, (_, i) => ({
      name: `branch_${i}`,
      label: `分支 ${i}`,
    }))
    return [...first, ...extras]
  }
  return ports
}

export default function AtomNode({ data, selected, id }: NodeProps) {
  const originType = (data.originType as string) || 'start'
  const config = (data.config as Record<string, unknown>) || {}
  const meta = getNodeMeta(originType)
  const catColor = CATEGORY_COLORS[meta.category] || '#999'
  const label = (data.label as string) || meta.name
  const desc = (data.desc as string) || ''
  const [hovered, setHovered] = useState(false)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerSourcePort, setPickerSourcePort] = useState('__default')
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null)

  const showPlus = hovered || selected || pickerVisible

  const inPorts = meta.inputSchema
  const outPorts = buildPorts(
    meta.outputSchema,
    originType === 'condition' ? (config.branch_count as number) || 2 : undefined,
  )
  const hasOutput = outPorts.length > 0

  const openPicker = useCallback((port: string, e: React.MouseEvent) => {
    setPickerSourcePort(port)
    setPickerAnchor(e.currentTarget.getBoundingClientRect())
    setPickerVisible(true)
  }, [])

  const handleAddNode = useCallback((nodeType: string) => {
    const event = new CustomEvent('flow:add-node', {
      detail: { afterNodeId: id, sourcePort: pickerSourcePort, nodeType },
    })
    window.dispatchEvent(event)
    setPickerVisible(false)
  }, [id, pickerSourcePort])

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
      width: 160,
      border: `1.5px solid ${selected ? '#37352f' : data._simulating ? '#52c41a' : catColor}`,
      borderRadius: 8,
      background: selected ? '#f0f0ee' : '#fff',
      overflow: 'visible',
      boxShadow: selected ? '0 0 0 2px rgba(55, 50, 47, 0.15)' : data._simulating ? '0 0 12px rgba(82, 196, 26, 0.4), 0 0 0 3px rgba(82, 196, 26, 0.2)' : undefined,
      animation: data._simulating ? 'simulatePulse 1.2s ease-in-out infinite' : undefined,
      transition: 'border-color 0.2s, box-shadow 0.2s, background 0.15s',
      position: 'relative',
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
      {inPorts.length <= 1 ? (
        <Handle type="target" position={Position.Top} id="__default" style={{ background: '#b0b0ae', width: 8, height: 8, border: '2px solid #fff' }} />
      ) : (
        inPorts.map((port, i) => (
          <Handle key={port.name} type="target" position={Position.Top} id={port.name}
            style={{
              background: '#1890ff', width: 8, height: 8, border: '2px solid #fff',
              left: `${((i + 1) / (inPorts.length + 1)) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          />
        ))
      )}
      {outPorts.length <= 1 ? (
        <div style={{ position: 'relative' }}>
          <Handle type="source" position={Position.Bottom} id="__default" style={{ background: '#b0b0ae', width: 8, height: 8, border: '2px solid #fff' }} />
          {hasOutput && (
            <div style={{ position: 'absolute', left: '50%', bottom: -18, transform: 'translateX(-50%)', zIndex: 10 }}>
              <div onClick={(e) => openPicker('__default', e)}
                style={{ width: 18, height: 18, borderRadius: '50%', background: '#37352f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, lineHeight: 1, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', userSelect: 'none', opacity: showPlus ? 1 : 0, transition: 'opacity 0.15s', pointerEvents: showPlus ? 'auto' : 'none' }}
              >+</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ position: 'relative', height: outPorts.length > 2 ? outPorts.length * 18 : 0 }}>
          {outPorts.map((port, i) => (
            <div key={port.name} style={{ position: 'relative', height: 18 }}>
              <Handle type="source" position={Position.Bottom} id={port.name}
                style={{
                  background: '#52c41a', width: 8, height: 8, border: '2px solid #fff',
                  position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0,
                }}
              />
              <div style={{
                position: 'absolute', left: '55%', top: -1, fontSize: 9, color: '#52c41a',
                whiteSpace: 'nowrap', userSelect: 'none', pointerEvents: 'none',
              }}>
                {port.label || port.name}
              </div>
              <div style={{ position: 'absolute', left: '50%', bottom: -16, transform: 'translateX(-50%)', zIndex: 10 }}>
                <div onClick={(e) => openPicker(port.name, e)}
                  style={{ width: 16, height: 16, borderRadius: '50%', background: '#37352f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, lineHeight: 1, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', userSelect: 'none', opacity: showPlus ? 1 : 0, transition: 'opacity 0.15s', pointerEvents: showPlus ? 'auto' : 'none' }}
                >+</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pickerVisible && pickerAnchor && (
        <NodePicker
          sourceType={originType}
          anchorRect={pickerAnchor}
          onSelect={handleAddNode}
          onClose={() => setPickerVisible(false)}
        />
      )}
    </div>
  )
}
