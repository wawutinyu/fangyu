import { useState } from 'react'
import { createPortal } from 'react-dom'
import { downloadFlowExport } from '../utils/exportFlow'
import { useAppSelector } from '../store/hooks'
import type { Node, Edge } from 'reactflow'

interface Props {
  nodes: Node[]
  edges: Edge[]
  onClose: () => void
  onCompileStart: () => void
  onCompileEnd: () => void
}

export default function ExportDialog({ nodes, edges, onClose, onCompileStart, onCompileEnd }: Props) {
  const agentNodes = useAppSelector(s => s.agent.nodes)
  const globalPrompts = useAppSelector(s => s.flow.globalPrompts)
  const [enableA2A, setEnableA2A] = useState(agentNodes.length > 0)
  const [includeDesktopGUI, setIncludeDesktopGUI] = useState(true)
  const [compileExe, setCompileExe] = useState(false)

  const handleExport = async () => {
    onCompileStart()
    try {
      await downloadFlowExport(
        nodes,
        edges,
        {
          desktopGUI: includeDesktopGUI,
          enableA2A,
          globalPrompts,
          exportMode: compileExe ? 'compile' : 'source',
        },
        '',
        undefined,
        enableA2A ? agentNodes : undefined,
      )
    } catch (e: any) {
      alert(`导出失败: ${e.message}`)
    } finally {
      onCompileEnd()
      onClose()
    }
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24,
        width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>导出流程</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={includeDesktopGUI} onChange={e => setIncludeDesktopGUI(e.target.checked)} />
            包含桌面 GUI（Tkinter 窗口）
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={enableA2A} onChange={e => setEnableA2A(e.target.checked)} />
            启用 A2A 智能体通讯
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={compileExe} onChange={e => setCompileExe(e.target.checked)} />
            服务端编译可执行文件（慢，可选）
          </label>

          {enableA2A && agentNodes.length > 0 && (
            <div style={{ fontSize: 12, color: '#666', background: '#f5f5f5', borderRadius: 6, padding: 8 }}>
              将包含 {agentNodes.filter(n => n.type === 'a2a-agent').length} 个智能体
              {agentNodes.filter(n => n.type === 'a2a-router').length > 0 && `、${agentNodes.filter(n => n.type === 'a2a-router').length} 个路由器`}
            </div>
          )}

          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            {compileExe
              ? '将尝试服务端编译并打包 ZIP（可能数分钟；Linux 服务器上通常不是 Windows .exe）'
              : '默认导出源码 ZIP（秒级）：含 .py / flow_config.json / build_exe.bat，可在本机编译'}
          </div>
          <div style={{ fontSize: 11, color: '#b8860b', marginTop: 4 }}>
            运行前请设置 LLM_API_KEY 与 LLM_ENDPOINT 环境变量
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{
            padding: '6px 16px', border: '1px solid #ddd', borderRadius: 6,
            background: '#fff', cursor: 'pointer', fontSize: 13,
          }}>取消</button>
          <button onClick={handleExport} style={{
            padding: '6px 16px', border: 'none', borderRadius: 6,
            background: '#0070f3', color: '#fff', cursor: 'pointer', fontSize: 13,
          }}>确认导出</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
