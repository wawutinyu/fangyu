interface Props {
  selectedEdge: { id: string; source: string; target: string }
  edgeMappings: Record<string, string>
  edgeLinkType: string
  edgeSourceOutputs: string[]
  edgeTargetInputs: { name: string; required: boolean }[]
  onMappingsChange: (m: Record<string, string>) => void
  onLinkTypeChange: (t: string) => void
  onSave: () => void
  onDelete: () => void
}

export default function EdgeConfigPanel({
  selectedEdge, edgeMappings, edgeLinkType,
  edgeSourceOutputs, edgeTargetInputs,
  onMappingsChange, onLinkTypeChange, onSave, onDelete,
}: Props) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 10, border: '1px solid #ddd', background: '#f0f0ee', color: '#666' }}>连线</span>
          <button style={{ marginLeft: 'auto', fontSize: 11, color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 4, padding: '2px 8px', background: '#fff2f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
            onClick={onDelete}
          ><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除连线</button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
          {selectedEdge.source} → {selectedEdge.target}
        </div>
      </div>
      <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4 }}>连线类型</label>
        <select className="notion-select" value={edgeLinkType} onChange={e => onLinkTypeChange(e.target.value)}>
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
              onChange={e => onMappingsChange({ ...edgeMappings, [port.name]: e.target.value })}
            >
              <option value="">— 不映射 —</option>
              {edgeSourceOutputs.map(out => <option key={out} value={out}>{out}</option>)}
            </select>
          </div>
        ))}
        {edgeTargetInputs.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>下游节点无需输入</div>}
      </div>
      <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />
      <button className="notion-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={onSave}>保存连线配置</button>
    </div>
  )
}
