import { useState, useMemo, useEffect } from 'react'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import { updateNodeConfig, updateEdgeConfig, closeConfig } from '../store/flowSlice'
import { getNodeMeta } from '../utils/nodeRegistry'
import CodeEditor from './CodeEditor'

interface Props {
  onUpdateEdge?: (edgeId: string, data: Record<string, unknown>) => void
  onUpdateNode?: (nodeId: string, data: Record<string, unknown>) => void
  onDeleteNode?: (nodeId: string) => void
  onDeleteEdge?: (edgeId: string) => void
}

export default function ConfigPanel({ onUpdateEdge, onUpdateNode, onDeleteNode, onDeleteEdge }: Props) {
  const dispatch = useAppDispatch()
  const { selectedNodeId, selectedEdgeId, configPanelVisible, edgeConfigPanelVisible, nodes, edges } = useAppSelector(s => s.flow)
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({})
  const [nodeLabel, setNodeLabel] = useState('')
  const [nodeDesc, setNodeDesc] = useState('')
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [edgeMappings, setEdgeMappings] = useState<Record<string, string>>({})
  const [edgeLinkType, setEdgeLinkType] = useState('serial')

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId])
  const selectedEdge = useMemo(() => edges.find(e => e.id === selectedEdgeId) || null, [edges, selectedEdgeId])

  const meta = useMemo(() => {
    if (!selectedNode) return null
    const originType = (selectedNode.data?.originType as string) || selectedNode.type || 'atom-node'
    return getNodeMeta(originType)
  }, [selectedNode])

  const visible = configPanelVisible || edgeConfigPanelVisible

  useEffect(() => {
    if (!selectedNode) return
    const config = (selectedNode.data?.config as Record<string, unknown>) || {}
    const defaults: Record<string, unknown> = {}
    if (meta) {
      for (const field of meta.configSchema) {
        defaults[field.key] = config[field.key] ?? field.default
      }
    }
    setLocalConfig(defaults)
    setNodeLabel((selectedNode.data?.label as string) || (selectedNode.data?.name as string) || meta?.name || '')
    setNodeDesc((selectedNode.data?.desc as string) || '')
    setMappings((selectedNode.data?.mappings as Record<string, string>) || {})
  }, [selectedNode, meta])

  useEffect(() => {
    if (!selectedEdge) return
    setEdgeMappings((selectedEdge.data?.mappings as Record<string, string>) || {})
    setEdgeLinkType((selectedEdge.data?.linkType as string) || 'serial')
  }, [selectedEdge])

  const upstreamOutputs = useMemo(() => {
    if (!selectedNode) return []
    const upstreamIds = edges.filter(e => e.target === selectedNode.id).map(e => e.source)
    const outputs: string[] = []
    for (const uid of upstreamIds) {
      const upNode = nodes.find(n => n.id === uid)
      if (!upNode) continue
      const upMeta = getNodeMeta((upNode.data?.originType as string) || upNode.type || 'atom-node')
      for (const port of upMeta.outputSchema) {
        outputs.push(`${(upNode.data?.label as string) || uid}.${port.name}`)
      }
    }
    return outputs
  }, [selectedNode, nodes, edges])

  const edgeSourceOutputs = useMemo(() => {
    if (!selectedEdge) return []
    const sourceNode = nodes.find(n => n.id === selectedEdge.source)
    if (!sourceNode) return []
    const srcMeta = getNodeMeta((sourceNode.data?.originType as string) || sourceNode.type || 'atom-node')
    return srcMeta.outputSchema.map(p => p.name)
  }, [selectedEdge, nodes])

  const edgeTargetInputs = useMemo(() => {
    if (!selectedEdge) return []
    const targetNode = nodes.find(n => n.id === selectedEdge.target)
    if (!targetNode) return []
    const tgtMeta = getNodeMeta((targetNode.data?.originType as string) || targetNode.type || 'atom-node')
    return tgtMeta.inputSchema.map(p => ({ name: p.name, required: p.required }))
  }, [selectedEdge, nodes])

  if (!visible) {
    return <div style={{ width: 0, overflow: 'hidden', background: 'var(--bg-secondary)', flexShrink: 0 }} />
  }

  const handleSave = () => {
    const label = nodeLabel.trim() || undefined
    const desc = nodeDesc.trim() || undefined
    dispatch(updateNodeConfig({ config: { ...localConfig }, mappings: { ...mappings }, label, desc }))
    if (selectedNode && onUpdateNode) {
      const data: Record<string, unknown> = {}
      if (label) data.label = label
      if (desc) data.desc = desc
      onUpdateNode(selectedNode.id, data)
    }
  }

  const handleEdgeSave = () => {
    dispatch(updateEdgeConfig({ linkType: edgeLinkType, mappings: edgeMappings }))
    if (selectedEdge && onUpdateEdge) {
      onUpdateEdge(selectedEdge.id, { linkType: edgeLinkType, mappings: edgeMappings })
    }
  }

  const configFields = meta?.configSchema || []

  return (
    <div style={{ width: 'var(--panel-width)', borderLeft: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 4px', borderBottom: '1px solid var(--border-light)' }}>
        <span className="section-title">节点配置</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', display: 'flex' }}
          onClick={() => dispatch(closeConfig())}
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      {edgeConfigPanelVisible && selectedEdge ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 10, border: '1px solid #ddd', background: '#f0f0ee', color: '#666' }}>连线</span>
              <button style={{ marginLeft: 'auto', fontSize: 11, color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 4, padding: '2px 8px', background: '#fff2f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                onClick={() => { dispatch(closeConfig()); onDeleteEdge?.(selectedEdge.id) }}
              ><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除连线</button>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              {selectedEdge.source} → {selectedEdge.target}
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>连线类型</label>
            <select className="notion-select" value={edgeLinkType} onChange={e => setEdgeLinkType(e.target.value)}>
              <option value="serial">串行（实线）</option>
              <option value="branch">分支（虚线橙色）</option>
              <option value="parallel">并行（点线紫色）</option>
            </select>
          </div>
          <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>变量映射</label>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>将上游节点输出映射到下游节点输入</div>
            {edgeTargetInputs.map(port => (
              <div key={port.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', minWidth: 60, fontFamily: 'monospace' }}>{port.name}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                <select className="notion-select" style={{ flex: 1 }} value={edgeMappings[port.name] || ''}
                  onChange={e => setEdgeMappings(prev => ({ ...prev, [port.name]: e.target.value }))}
                >
                  <option value="">— 不映射 —</option>
                  {edgeSourceOutputs.map(out => <option key={out} value={out}>{out}</option>)}
                </select>
              </div>
            ))}
            {edgeTargetInputs.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>下游节点无需输入</div>}
          </div>
          <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />
          <button className="notion-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={handleEdgeSave}>保存连线配置</button>
        </div>
      ) : selectedNode && meta ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 10, border: `1px solid ${meta.categoryColor}`, background: meta.categoryColor + '18', color: meta.categoryColor }}>{meta.category}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{meta.type}</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>节点名称</label>
              <input className="notion-input" value={nodeLabel} onChange={e => setNodeLabel(e.target.value)} placeholder={meta.name} />
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>描述</label>
              <input className="notion-input" value={nodeDesc} onChange={e => setNodeDesc(e.target.value)} placeholder={meta.desc || '添加描述...'} />
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />

          {meta.inputSchema.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>输入端口</div>
              {meta.inputSchema.map(port => (
                <div key={port.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 4, fontSize: 12, marginBottom: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1890ff', flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{port.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{port.type}</span>
                  {port.required && <span style={{ fontSize: 9, color: '#ff4d4f', background: '#fff2f0', padding: '0 4px', borderRadius: 3 }}>必填</span>}
                </div>
              ))}
            </div>
          )}
          {meta.outputSchema.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>输出端口</div>
              {meta.outputSchema.map(port => (
                <div key={port.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 4, fontSize: 12, marginBottom: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#52c41a', flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{port.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{port.type}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />

          {configFields.map(field => (
            <div key={field.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>{field.label}</label>
              {(field.type === 'input') && (
                <input className="notion-input" value={localConfig[field.key] as string || ''} onChange={e => setLocalConfig(prev => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder as string} />
              )}
              {(field.type === 'number') && (
                <input className="notion-input" type="number" value={localConfig[field.key] as number ?? ''} onChange={e => setLocalConfig(prev => ({ ...prev, [field.key]: Number(e.target.value) }))} min={field.min} max={field.max} step={field.step} />
              )}
              {(field.type === 'textarea') && (
                <textarea className="notion-textarea" value={localConfig[field.key] as string || ''} onChange={e => setLocalConfig(prev => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder as string} rows={field.rows || 3} />
              )}
              {(field.type === 'code') && (
                <CodeEditor
                  value={localConfig[field.key] as string || ''}
                  onChange={val => setLocalConfig(prev => ({ ...prev, [field.key]: val }))}
                  placeholder={field.placeholder as string}
                />
              )}
              {(field.type === 'select') && (
                <select className="notion-select" value={localConfig[field.key] as string ?? ''} onChange={e => setLocalConfig(prev => ({ ...prev, [field.key]: e.target.value }))}>
                  {(field.options as unknown[])?.map(opt => (
                    <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
                  ))}
                </select>
              )}
              {(field.type === 'key-value') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Object.entries((localConfig[field.key] as Record<string, string>) || {}).map(([key, val], idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input className="notion-input" style={{ flex: 1 }} value={key} placeholder="键" onChange={e => {
                        const obj = { ...(localConfig[field.key] as Record<string, string> || {}) }
                        const newKey = e.target.value
                        if (newKey !== key) { delete obj[key]; obj[newKey] = val as string }
                        else obj[key] = val as string
                        setLocalConfig(prev => ({ ...prev, [field.key]: obj }))
                      }} />
                      <input className="notion-input" style={{ flex: 1 }} value={val as string} placeholder="值" onChange={e => {
                        const obj = { ...(localConfig[field.key] as Record<string, string> || {}) }
                        obj[key] = e.target.value
                        setLocalConfig(prev => ({ ...prev, [field.key]: obj }))
                      }} />
                      <button style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 4, fontSize: 14, flexShrink: 0 }}
                        onClick={() => { const obj = { ...(localConfig[field.key] as Record<string, string> || {}) }; delete obj[key]; setLocalConfig(prev => ({ ...prev, [field.key]: obj })) }}
                      >×</button>
                    </div>
                  ))}
                  <button style={{ fontSize: 11, padding: '2px 8px', border: '1px dashed var(--border-color)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', width: 'fit-content' }}
                    onClick={() => { const obj = { ...(localConfig[field.key] as Record<string, string> || {}), '': '' }; setLocalConfig(prev => ({ ...prev, [field.key]: obj })) }}
                  >+ 添加</button>
                </div>
              )}
            </div>
          ))}

          {upstreamOutputs.length > 0 && <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />}
          {upstreamOutputs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>变量映射</label>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>上游节点输出映射到当前节点输入</div>
              {meta.inputSchema.map(port => (
                <div key={port.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', minWidth: 60, fontFamily: 'monospace' }}>{port.name}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  <select className="notion-select" style={{ flex: 1 }} value={mappings[port.name] || ''} onChange={e => setMappings(prev => ({ ...prev, [port.name]: e.target.value }))}>
                    <option value="">— 不映射 —</option>
                    {upstreamOutputs.map(out => <option key={out} value={out}>{out}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />
          <button className="notion-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={handleSave}>保存配置</button>
          <button style={{ marginTop: 6, width: '100%', justifyContent: 'center', fontSize: 12, color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 6, padding: '6px 12px', background: '#fff2f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => { dispatch(closeConfig()); onDeleteNode?.(selectedNode.id) }}
          ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除此节点</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>双击节点或点击连线进行配置</span>
        </div>
      )}
    </div>
  )
}
