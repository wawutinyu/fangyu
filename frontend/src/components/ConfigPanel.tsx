import { useState, useMemo, useEffect, useRef } from 'react'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import { updateNodeConfig, updateEdgeConfig, closeConfig, toggleBreakpoint } from '../store/flowSlice'
import { getNodeMeta } from '../utils/nodeRegistry'
import SubFlowEditor from './SubFlowEditor'
import FlowConfigPanel from './config/FlowConfigPanel'
import EdgeConfigPanel from './config/EdgeConfigPanel'
import NodeConfigPanel from './config/NodeConfigPanel'


interface Props {
  onUpdateEdge?: (edgeId: string, data: Record<string, unknown>) => void
  onUpdateNode?: (nodeId: string, data: Record<string, unknown>) => void
  onDeleteNode?: (nodeId: string) => void
  onDeleteEdge?: (edgeId: string) => void
}

export default function ConfigPanel({ onUpdateEdge, onUpdateNode, onDeleteNode, onDeleteEdge }: Props) {
  const dispatch = useAppDispatch()
  const { selectedNodeId, selectedEdgeId, configPanelVisible, edgeConfigPanelVisible, flowConfigVisible, nodes, edges, globalPrompts, breakpoints } = useAppSelector(s => s.flow)
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({})
  const [nodeLabel, setNodeLabel] = useState('')
  const [nodeDesc, setNodeDesc] = useState('')
  const [edgeMappings, setEdgeMappings] = useState<Record<string, string>>({})
  const [edgeLinkType, setEdgeLinkType] = useState('serial')
  const [subFlowOpen, setSubFlowOpen] = useState(false)
  const cursorPosRef = useRef<Record<string, number>>({})

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId])
  const selectedEdge = useMemo(() => edges.find(e => e.id === selectedEdgeId) || null, [edges, selectedEdgeId])

  const meta = useMemo(() => {
    if (!selectedNode) return null
    const originType = (selectedNode.data?.originType as string) || selectedNode.type || 'atom-node'
    return getNodeMeta(originType)
  }, [selectedNode])

  const visible = configPanelVisible || edgeConfigPanelVisible || flowConfigVisible

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
  }, [selectedNode, meta])

  useEffect(() => {
    if (!selectedEdge) return
    setEdgeMappings((selectedEdge.data?.mappings as Record<string, string>) || {})
    setEdgeLinkType((selectedEdge.data?.linkType as string) || 'serial')
  }, [selectedEdge])

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
    dispatch(updateNodeConfig({ config: { ...localConfig }, label, desc }))
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

  const handleConfigChange = (key: string, value: unknown) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div style={{ width: 'var(--panel-width)', borderLeft: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 4px', borderBottom: '1px solid var(--border-light)' }}>
        <span className="section-title">{flowConfigVisible ? '画布配置' : '节点配置'}</span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', display: 'flex' }}
          onClick={() => dispatch(closeConfig())}
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>

      {flowConfigVisible ? (
        <FlowConfigPanel globalPrompts={globalPrompts} />
      ) : edgeConfigPanelVisible && selectedEdge ? (
        <EdgeConfigPanel
          selectedEdge={selectedEdge}
          edgeMappings={edgeMappings}
          edgeLinkType={edgeLinkType}
          edgeSourceOutputs={edgeSourceOutputs}
          edgeTargetInputs={edgeTargetInputs}
          onMappingsChange={setEdgeMappings}
          onLinkTypeChange={setEdgeLinkType}
          onSave={handleEdgeSave}
          onDelete={() => { dispatch(closeConfig()); onDeleteEdge?.(selectedEdge.id) }}
        />
      ) : selectedNode && meta ? (
        <NodeConfigPanel
          selectedNode={selectedNode}
          meta={meta}
          localConfig={localConfig}
          nodeLabel={nodeLabel}
          nodeDesc={nodeDesc}
          breakpoints={breakpoints}
          cursorPosRef={cursorPosRef}
          onLabelChange={setNodeLabel}
          onDescChange={setNodeDesc}
          onConfigChange={handleConfigChange}
          onSave={handleSave}
          onDelete={() => { dispatch(closeConfig()); onDeleteNode?.(selectedNode.id) }}
          onToggleBreakpoint={() => dispatch(toggleBreakpoint(selectedNode.id))}
          onSubFlowOpen={() => setSubFlowOpen(true)}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>双击节点或点击连线进行配置</span>
        </div>
      )}
      <SubFlowEditor
        visible={subFlowOpen}
        innerNodes={((selectedNode?.data?.inner_nodes as Record<string, unknown>[]) || []) as Record<string, unknown>[]}
        innerLinks={((selectedNode?.data?.inner_links as Record<string, unknown>[]) || []) as Record<string, unknown>[]}
        onSave={(nodes, links) => {
          if (selectedNode) {
            onUpdateNode?.(selectedNode.id, { inner_nodes: nodes, inner_links: links })
          }
          setSubFlowOpen(false)
        }}
        onClose={() => setSubFlowOpen(false)}
      />
    </div>
  )
}
