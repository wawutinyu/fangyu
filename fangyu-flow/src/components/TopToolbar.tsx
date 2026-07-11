import React, { useState, useRef, useEffect } from 'react'

interface Props {
  onNewFlow: () => void
  onSaveFlow: () => void
  onShowHistory: () => void
  onImportFlow: () => void
  onExportFlow: () => void
  onOpenFlowConfig: () => void
  onGroupSelected: () => void
  onUngroupSelected: () => void
  onDeleteSelected: () => void
  onSimulate: () => void
  onBatchTest: () => void
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void
  onOpenSettings: () => void
  onLoadDemo: (demoId: string) => void
  simulating?: boolean
}

const DEMOS = [
  { id: 'core', label: '核心链路', desc: 'input → llm → json-parse → transform → output' },
  { id: 'condition', label: '条件分支', desc: 'input → llm → condition → 两路 output' },
  { id: 'switch', label: '多路分支', desc: 'input → llm → switch → output' },
  { id: 'loop', label: '循环', desc: 'loop → llm → output' },
  { id: 'trigger', label: '触发器', desc: 'trigger → llm → output' },
  { id: 'code_exec', label: '代码执行', desc: 'llm → code → output' },
  { id: 'var_text', label: '变量与文本', desc: 'variable-set → variable-get → text-process → output' },
  { id: 'memory', label: '记忆系统', desc: 'llm → memory-write → memory-read → output' },
  { id: 'memory_extract', label: '记忆提取', desc: 'memory-write → extract-memory → search-sessions → output' },
  { id: 'knowledge', label: '知识库', desc: 'input → knowledge → llm → output' },
  { id: 'prompt', label: '提示词组装', desc: 'input → prompt-assembly → llm → output' },
  { id: 'ext', label: '外部服务', desc: 'input → search → http → llm → output' },
  { id: 'approval', label: '审批', desc: 'input → llm → approval → output' },
  { id: 'tool_call', label: '工具调用', desc: 'llm → tool-call → output' },
  { id: 'tool_skill', label: '工具与技能', desc: 'register-tool → learn-skill → execute-skill → output' },
  { id: 'role', label: '角色扮演', desc: 'input → llm(角色) → output' },
]

export default function TopToolbar(props: Props) {
  const Btn = ({ title, onClick, primary, children }: { title?: string; onClick: () => void; primary?: boolean; children: React.ReactNode }) => (
    <button className={`notion-btn${primary ? ' primary' : ''}`} onClick={onClick} title={title}>
      {children}
    </button>
  )

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 'var(--header-height)', padding: '0 12px',
      borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)',
      userSelect: 'none', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>fangyu</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Btn onClick={props.onNewFlow} title="新建画布">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建
        </Btn>
        <Btn onClick={props.onSaveFlow} primary title="保存 Ctrl+S">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          保存
        </Btn>
        <Btn onClick={props.onShowHistory} title="保存历史">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          历史
        </Btn>
        <Btn onClick={props.onImportFlow} title="导入流程JSON">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          导入
        </Btn>
        <Btn onClick={props.onExportFlow} title="导出（源码 + 配置 + 可执行文件）">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          导出
        </Btn>
        <DemoMenu demos={DEMOS} onSelect={props.onLoadDemo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-color)', margin: '0 4px' }} />
        <Btn onClick={props.onGroupSelected} title="封装为组合原子">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          组合
        </Btn>
        <Btn onClick={props.onUngroupSelected} title="展开组合原子">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>
          展开
        </Btn>
        <div style={{ width: 1, height: 20, background: 'var(--border-color)', margin: '0 4px' }} />
        <Btn onClick={props.onDeleteSelected} title="删除选中 Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          删除
        </Btn>
        <Btn onClick={props.onOpenFlowConfig} title="画布配置">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
          提示词
        </Btn>
        <Btn onClick={props.onSimulate} primary title="模拟运行" style={props.simulating ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
          {props.simulating ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}>
              <circle cx="12" cy="12" r="10" strokeDasharray="30 70"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
          {props.simulating ? '运行中...' : '模拟运行'}
        </Btn>
        <Btn onClick={props.onBatchTest} title="批量测试">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          批量测试
        </Btn>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100, justifyContent: 'flex-end' }}>
        <Btn onClick={props.onOpenSettings} title="设置">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </Btn>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>v1.0</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function DemoMenu({ demos, onSelect }: { demos: { id: string; label: string; desc: string }[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button ref={btnRef} className="notion-btn" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPos({ top: r.bottom + 4, left: r.left })
        setOpen(o => !o)
      }} title="加载示例流程">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        用例
      </button>
      {open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 10000, background: '#fff', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #eee',
          minWidth: 220, maxHeight: '70vh', overflowY: 'auto',
        }}>
          {demos.map(d => (
            <button key={d.id} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
              border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12,
              borderBottom: '1px solid #f5f5f3',
            }}
              onClick={() => { onSelect(d.id); setOpen(false) }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5f5f3'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontWeight: 600, color: '#37352f', marginBottom: 2 }}>{d.label}</div>
              <div style={{ fontSize: 11, color: '#9b9a97' }}>{d.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
