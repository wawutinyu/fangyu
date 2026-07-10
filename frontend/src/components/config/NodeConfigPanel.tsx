import { useRef } from 'react'
import CodeEditor from '../CodeEditor'
import VariableSelector from '../VariableSelector'

interface Field {
  key: string; label: string; type: string; placeholder?: string
  default?: unknown; rows?: number; min?: number; max?: number; step?: number
  options?: unknown[]
}

interface Props {
  selectedNode: { id: string; data?: Record<string, unknown> }
  meta: {
    name: string; category: string; categoryColor: string; type: string; desc?: string
    configSchema: Field[]; inputSchema: { name: string; type: string; required: boolean }[]
    outputSchema: { name: string; type: string }[]
  }
  localConfig: Record<string, unknown>
  nodeLabel: string
  nodeDesc: string
  breakpoints: string[]
  cursorPosRef: React.MutableRefObject<Record<string, number>>
  onLabelChange: (v: string) => void
  onDescChange: (v: string) => void
  onConfigChange: (k: string, v: unknown) => void
  onSave: () => void
  onDelete: () => void
  onToggleBreakpoint: () => void
  onSubFlowOpen: () => void
}

export default function NodeConfigPanel({
  selectedNode, meta, localConfig, nodeLabel, nodeDesc, breakpoints, cursorPosRef,
  onLabelChange, onDescChange, onConfigChange, onSave, onDelete, onToggleBreakpoint, onSubFlowOpen,
}: Props) {
  const isBreakpoint = breakpoints.includes(selectedNode.id)
  const configFields = meta.configSchema

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 10, border: `1px solid ${meta.categoryColor}`, background: meta.categoryColor + '18', color: meta.categoryColor }}>{meta.category}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{meta.type}</span>
        </div>
        <div style={{ marginBottom: 6 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>节点名称</label>
          <input className="notion-input" value={nodeLabel} onChange={e => onLabelChange(e.target.value)} placeholder={meta.name} />
        </div>
        <div style={{ marginBottom: 6 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>描述</label>
          <input className="notion-input" value={nodeDesc} onChange={e => onDescChange(e.target.value)} placeholder={meta.desc || '添加描述...'} />
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

          {field.type === 'input' && (
            <input className="notion-input" value={localConfig[field.key] as string || ''} onChange={e => onConfigChange(field.key, e.target.value)} placeholder={field.placeholder as string} />
          )}

          {field.type === 'number' && (
            <input className="notion-input" type="number" value={localConfig[field.key] as number ?? ''} onChange={e => onConfigChange(field.key, Number(e.target.value))} min={field.min} max={field.max} step={field.step} />
          )}

          {field.type === 'textarea' && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
              <textarea className="notion-textarea" value={localConfig[field.key] as string || ''}
                onChange={e => onConfigChange(field.key, e.target.value)}
                onClick={e => { cursorPosRef.current[field.key] = (e.target as HTMLTextAreaElement).selectionStart }}
                onKeyUp={e => { cursorPosRef.current[field.key] = (e.target as HTMLTextAreaElement).selectionStart }}
                placeholder={field.placeholder as string} rows={field.rows || 3} style={{ flex: 1 }} />
              <VariableSelector value={localConfig[field.key] as string || ''}
                onSelect={sel => {
                  const pos = cursorPosRef.current[field.key]
                  const val = localConfig[field.key] as string || ''
                  const newVal = val.slice(0, pos) + sel + val.slice(pos)
                  onConfigChange(field.key, newVal)
                  cursorPosRef.current[field.key] = pos! + sel.length
                }}
                nodeId={selectedNode.id} />
            </div>
          )}

          {field.type === 'code' && (
            <CodeEditor value={localConfig[field.key] as string || ''} onChange={val => onConfigChange(field.key, val)} placeholder={field.placeholder as string} />
          )}

          {field.type === 'select' && (
            <select className="notion-select" value={localConfig[field.key] as string ?? ''} onChange={e => onConfigChange(field.key, e.target.value)}>
              {(field.options as unknown[])?.map(opt => <option key={String(opt)} value={String(opt)}>{String(opt)}</option>)}
            </select>
          )}

          {field.type === 'key-value' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries((localConfig[field.key] as Record<string, string>) || {}).map(([key, val], idx) => (
                <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input className="notion-input" style={{ flex: 1 }} value={key} placeholder="键" onChange={e => {
                    const obj = { ...(localConfig[field.key] as Record<string, string> || {}) }
                    const newKey = e.target.value
                    if (newKey !== key) { delete obj[key]; obj[newKey] = val as string }
                    else obj[key] = val as string
                    onConfigChange(field.key, obj)
                  }} />
                  <input className="notion-input" style={{ flex: 1 }} value={val as string} placeholder="值" onChange={e => {
                    const obj = { ...(localConfig[field.key] as Record<string, string> || {}) }
                    obj[key] = e.target.value
                    onConfigChange(field.key, obj)
                  }} />
                  <button style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 4, fontSize: 14, flexShrink: 0 }}
                    onClick={() => { const obj = { ...(localConfig[field.key] as Record<string, string> || {}) }; delete obj[key]; onConfigChange(field.key, obj) }}
                  >×</button>
                </div>
              ))}
              <button style={{ fontSize: 11, padding: '2px 8px', border: '1px dashed var(--border-color)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', width: 'fit-content' }}
                onClick={() => { const obj = { ...(localConfig[field.key] as Record<string, string> || {}), '': '' }; onConfigChange(field.key, obj) }}
              >+ 添加</button>
            </div>
          )}
        </div>
      ))}

      {meta.inputSchema.length > 0 && <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />}

      <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />
      <button className="notion-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={onSave}>保存配置</button>
      {(['composite', 'loop'] as string[]).includes((selectedNode.data?.originType as string) || '') && (
        <button className="notion-btn" style={{ marginTop: 6, width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={onSubFlowOpen}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          编辑内部节点
        </button>
      )}
      <button style={{ marginTop: 6, width: '100%', justifyContent: 'center', fontSize: 12, color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 6, padding: '6px 12px', background: '#fff2f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={onDelete}
      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除此节点</button>
      <button style={{ marginTop: 4, width: '100%', justifyContent: 'center', fontSize: 12, color: isBreakpoint ? '#722ed1' : '#888', border: isBreakpoint ? '1px solid #d3adf7' : '1px solid #e8e8e8', borderRadius: 6, padding: '6px 12px', background: isBreakpoint ? '#f9f0ff' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={onToggleBreakpoint}
      ><svg width="12" height="12" viewBox="0 0 24 24" fill={isBreakpoint ? '#722ed1' : 'none'} stroke="#722ed1" strokeWidth="2"><circle cx="12" cy="12" r="10"/><rect x="9" y="6" width="2" height="12" rx="1"/><rect x="13" y="6" width="2" height="12" rx="1"/></svg>{isBreakpoint ? '移除断点' : '添加断点'}</button>
    </div>
  )
}
