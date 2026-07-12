import { useState, useRef, useCallback, useEffect } from 'react'
import ChatInterface from './ChatInterface'
import RunHistory from './RunHistory'
import TriggerPanel from './TriggerPanel'
import MonitorPanel from './MonitorPanel'
import KnowledgePanel from './KnowledgePanel'
import ToolRegistry from './ToolRegistry'
import SkillManager from './SkillManager'
import McpPanel from './McpPanel'
import AssetLibrary from './AssetLibrary'
import WorkerPanel from './WorkerPanel'
import { useAssetContext } from '../context/AssetContext'

const TABS = [
  { key: 'chat', label: '运行预览', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { key: 'workers', label: '方隅·行', icon: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' },
  { key: 'assets', label: '资产库', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { key: 'history', label: '运行历史', icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' },
  { key: 'trigger', label: '调度', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-3.5l6-4.5-6-4.5v9z' },
  { key: 'monitor', label: '执行日志', icon: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' },
  { key: 'mcp', label: 'MCP', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
  { key: 'knowledge', label: '知识库', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6' },
  { key: 'tools', label: '工具', icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  { key: 'skills', label: '技能', icon: 'M12 6v6l4 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z' },
]

export default function BottomPanel({
  focusAssetsSignal,
  focusWorkersSignal,
  highlightWorkerTaskId,
}: {
  focusAssetsSignal?: number
  focusWorkersSignal?: number
  highlightWorkerTaskId?: string | null
}) {
  const [activeTab, setActiveTab] = useState('chat')
  const { loadFlowToCanvas, loadAgentsToCanvas, agentBindTarget, setAgentBindTarget, bindAgentSkillFlow } = useAssetContext()
  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(300)
  const resizingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    resizingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = height
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [height])

  useEffect(() => {
    if (focusAssetsSignal) {
      setActiveTab('assets')
      setCollapsed(false)
    }
  }, [focusAssetsSignal])

  useEffect(() => {
    if (focusWorkersSignal) {
      setActiveTab('workers')
      setCollapsed(false)
    }
  }, [focusWorkersSignal])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = startYRef.current - e.clientY
      const newHeight = Math.max(100, Math.min(window.innerHeight * 0.6, startHeightRef.current + delta))
      setHeight(newHeight)
    }
    const handleMouseUp = () => {
      if (!resizingRef.current) return
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div style={{
      borderTop: '1px solid var(--border-color)',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height,
      position: 'relative',
    }}>
      {/* resize handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          top: -3,
          left: 0,
          right: 0,
          height: 6,
          cursor: 'row-resize',
          zIndex: 10,
        }}
      />

      {/* tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-light)',
        flexShrink: 0,
        paddingLeft: 8,
        gap: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (collapsed) setCollapsed(false) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #37352f' : '2px solid transparent',
              cursor: 'pointer',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setCollapsed(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', color: 'var(--text-muted)', fontSize: 11 }}>
          {collapsed ? '▲ 展开' : '▼ 收起'}
        </button>
      </div>

      {/* tab content */}
      {!collapsed && (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {activeTab === 'chat' && <ChatInterface headerless />}
          {activeTab === 'workers' && (
            <WorkerPanel highlightTaskId={highlightWorkerTaskId} />
          )}
          {activeTab === 'assets' && (
            <AssetLibrary
              onLoadFlow={loadFlowToCanvas}
              onLoadAgents={loadAgentsToCanvas}
              agentBindMode={!!agentBindTarget}
              onBindAgentSkill={(flow) => {
                bindAgentSkillFlow(flow)
                setAgentBindTarget(null)
              }}
            />
          )}
          {activeTab === 'history' && <RunHistory />}
          {activeTab === 'trigger' && <TriggerPanel />}
          {activeTab === 'monitor' && <MonitorPanel headerless />}
          {activeTab === 'mcp' && <McpPanel headerless />}
          {activeTab === 'knowledge' && <KnowledgePanel headerless />}
          {activeTab === 'tools' && <ToolRegistry headerless />}
          {activeTab === 'skills' && <SkillManager headerless />}
        </div>
      )}
    </div>
  )
}
