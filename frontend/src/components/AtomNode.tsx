import { useCallback, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type NodeProps } from 'reactflow'
import { getNodeMeta, getCompatibleTargets, getAllNodeTypes, filterUniqueTypes } from '../utils/nodeRegistry'
import NodePicker from './NodePicker'
import { useAppSelector } from '../store/hooks'

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
  const originType = (data.originType as string) || ''
  const config = (data.config as Record<string, unknown>) || {}
  const meta = getNodeMeta(originType)
  const catColor = CATEGORY_COLORS[meta.category] || '#999'
  const label = (data.label as string) || meta.name
  const desc = (data.desc as string) || ''
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null)
  const inPorts = meta.inputSchema
  const outPorts = buildPorts(
    meta.outputSchema,
    originType === 'condition' ? (config.branch_count as number) || 2 : undefined,
  )

  const existingNodeTypes = useAppSelector(s => s.flow.nodes.map(n => n.data?.originType as string))
  const compatibleTypes = useMemo(() => filterUniqueTypes(getCompatibleTargets(originType), existingNodeTypes), [originType, existingNodeTypes])
  const sourcePortRef = useRef(outPorts[0]?.name || '__default')

  const openPicker = useCallback((rect: DOMRect, portName?: string) => {
    if (portName) sourcePortRef.current = portName
    setPickerAnchor(rect)
    setPickerVisible(true)
  }, [])

  const handleAddNode = useCallback((nodeType: string) => {
    const event = new CustomEvent('flow:add-node', {
      detail: { afterNodeId: id, sourcePort: sourcePortRef.current, nodeType },
    })
    window.dispatchEvent(event)
    setPickerVisible(false)
  }, [id])

  const inputPickerVisibleRef = useRef(false)
  const [inputPickerAnchor, setInputPickerAnchor] = useState<DOMRect | null>(null)
  const [inputPickerTypes, setInputPickerTypes] = useState<string[]>([])
  const [inputMenuAnchor, setInputMenuAnchor] = useState<DOMRect | null>(null)
  const targetPortRef = useRef('')

  const compatibleSources = useMemo(() => {
    return filterUniqueTypes(getAllNodeTypes().filter(t => getCompatibleTargets(t).includes(originType)), existingNodeTypes)
  }, [originType, existingNodeTypes])

  const handleInputPortClick = useCallback((portName: string, el?: HTMLElement) => {
    targetPortRef.current = portName
    if (el) setInputMenuAnchor(el.getBoundingClientRect())
  }, [])

  const handleAddParent = useCallback((nodeType: string) => {
    const event = new CustomEvent('flow:add-parent', {
      detail: { targetNodeId: id, targetPort: targetPortRef.current, nodeType },
    })
    window.dispatchEvent(event)
    setInputPickerAnchor(null)
    setInputMenuAnchor(null)
  }, [id])

  const handleConnectExisting = useCallback(() => {
    window.dispatchEvent(new CustomEvent('flow:connect-to-input', {
      detail: { targetNodeId: id, targetPort: targetPortRef.current },
    }))
    setInputMenuAnchor(null)
  }, [id])

  const handlePortClick = useCallback((e: React.MouseEvent, portName: string) => {
    e.stopPropagation()
    e.preventDefault()
    sourcePortRef.current = portName
    if (compatibleTypes.length === 1) {
      handleAddNode(compatibleTypes[0])
    } else {
      setPickerAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())
      setPickerVisible(true)
    }
  }, [compatibleTypes, handleAddNode])

  return (
    <div className="atom-node" style={{
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
      {data._output && (
        <div style={{
          margin: '0 8px 6px', padding: '4px 6px', background: '#f5f5f3', borderRadius: 4,
          fontSize: 10, color: '#37352f', lineHeight: 1.4, wordBreak: 'break-word',
          maxHeight: 48, overflow: 'hidden',
          fontFamily: 'monospace',
        }}>
          {JSON.stringify(data._output).slice(0, 120)}
          {JSON.stringify(data._output).length > 120 ? '…' : ''}
        </div>
      )}
      {inPorts.length === 0 ? null : (
        <div style={{ position: 'relative', height: 18 }}
          onClick={(e) => handleInputPortClick('__default', e.currentTarget as HTMLElement)}
          className="port-row-add-input">
          <Handle type="target" position={Position.Top} id="__default"
            style={{ background: '#b0b0ae', width: 8, height: 8, border: '2px solid #fff' }}
            isConnectable={true}
          />
        </div>
      )}
      {outPorts.length === 0 ? null : outPorts.length <= 1 ? (
        <div style={{ position: 'relative', height: 18 }}
          onClick={(e) => handlePortClick(e, '__default')}
          className="port-row-add">
          <Handle type="source" position={Position.Bottom} id="__default"
            style={{ background: '#52c41a', width: 8, height: 8, border: '2px solid #fff' }}
            isConnectable={true}
          />
        </div>
      ) : (
        <div>
          {outPorts.map((port, i) => (
            <div key={port.name}
              onClick={(e) => handlePortClick(e, port.name)}
              className="port-row-add"
              style={{
                position: 'relative', height: 18,
                cursor: 'pointer',
                borderRadius: 3, transition: 'background 0.12s',
              }}>
              <Handle type="source" position={Position.Bottom} id={port.name}
                style={{
                  background: '#52c41a',
                  width: 8, height: 8, border: '2px solid #fff',
                  position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0,
                  transition: 'all 0.12s',
                }}
                isConnectable={true}
              />
              <div style={{
                position: 'absolute', left: '55%', top: -1, fontSize: 9,
                color: '#389e0d',
                whiteSpace: 'nowrap', userSelect: 'none', pointerEvents: 'none',
                fontWeight: 600,
                transition: 'color 0.12s',
              }}>
                {port.label || port.name}
              </div>
            </div>
          ))}
        </div>
      )}

      {pickerVisible && pickerAnchor && createPortal(
        <NodePicker
          compatibleTypes={compatibleTypes}
          anchorRect={pickerAnchor}
          onSelect={handleAddNode}
          onClose={() => setPickerVisible(false)}
        />,
        document.body
      )}
      {inputMenuAnchor && createPortal(
        <div style={{
          position: 'fixed', left: inputMenuAnchor.left, top: inputMenuAnchor.bottom + 4,
          zIndex: 10000, background: '#fff', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', border: '1px solid #e8e8e8',
          padding: 4, width: 160,
        }}>
          <div onClick={() => { setInputPickerTypes(compatibleSources); setInputPickerAnchor(inputMenuAnchor); setInputMenuAnchor(null) }}
            style={{ padding: '6px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer', color: '#333' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            + 添加新节点
          </div>
          <div onClick={handleConnectExisting}
            style={{ padding: '6px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer', color: '#333' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            ↕ 连接已有节点
          </div>
        </div>,
        document.body
      )}
      {inputPickerAnchor && createPortal(
        <NodePicker
          compatibleTypes={inputPickerTypes}
          anchorRect={inputPickerAnchor}
          onSelect={handleAddParent}
          onClose={() => setInputPickerAnchor(null)}
        />,
        document.body
      )}
    </div>
  )
}
