import { Component, useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, ErrorInfo } from 'react'
import TopToolbar from './TopToolbar'
import NodeLibrary from './NodeLibrary'
import FlowCanvas, { type FlowCanvasHandle } from './FlowCanvas'
import ConfigPanel from './ConfigPanel'
import AgentCanvas from './AgentCanvas'
import AgentConfigPanel from './AgentConfigPanel'
import ExportDialog from './ExportDialog'
import BatchRunner from './BatchRunner'
import BottomPanel from './BottomPanel'
import SaveHistory from './SaveHistory'
import SettingsPanel from './SettingsPanel'
import AssetLibrary from './AssetLibrary'
import { AssetContext, type AgentBindTarget } from '../context/AssetContext'
import { store } from '../store'
import { useAppSelector } from '../store/hooks'
import { toggleSettings, fetchSettings } from '../store/settingsSlice'
import { openFlowConfig } from '../store/flowSlice'
import { toggleHistory, saveFlowApi, fetchAllProjects, createProjectApi } from '../store/saveSlice'
import { updateSkillFlow, loadAgents } from '../store/agentSlice'
import { convertToExportFormat } from '../utils/flowHelper'
import { demoFlows } from '../utils/demoFlows'
import { snapshotFlowFromCanvas, getExportFormatFromCanvas } from '../utils/flowSnapshot'
import { fetchWorkers, pollTaskUntilDone } from '../utils/workerApi'
import { publishAndDispatchFromCanvas } from '../utils/workerDispatch'
import type { WorkerInfo } from '@fangyu/core/schema'


class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ErrorBoundary caught:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#e00' }}>应用崩溃</h2>
          <pre style={{ background: '#fee', padding: 16, borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const flowCanvasRef = useRef<FlowCanvasHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportCodeVisible, setExportCodeVisible] = useState(false)
  const [exportedCode, setExportedCode] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [exportDialogVisible, setExportDialogVisible] = useState(false)
  const [exportNodes, setExportNodes] = useState<any[]>([])
  const [exportEdges, setExportEdges] = useState<any[]>([])
  const [view, setView] = useState<'flow' | 'agent'>('flow')
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [workersOnline, setWorkersOnline] = useState(0)
  const [onlineWorkers, setOnlineWorkers] = useState<WorkerInfo[]>([])
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [dark, setDark] = useState(() => localStorage.getItem('theme-dark') === 'true')
  const [batchVisible, setBatchVisible] = useState(false)
  const [assetsFocusSignal, setAssetsFocusSignal] = useState(0)
  const [workersFocusSignal, setWorkersFocusSignal] = useState(0)
  const [highlightWorkerTaskId, setHighlightWorkerTaskId] = useState<string | null>(null)
  const [agentBindTarget, setAgentBindTarget] = useState<AgentBindTarget | null>(null)
  const [agentAssetPickerOpen, setAgentAssetPickerOpen] = useState(false)

  const loadFlowToCanvas = useCallback((data: unknown) => {
    flowCanvasRef.current?.importFlow(data)
  }, [])

  const loadAgentsToCanvas = useCallback((data: { nodes: unknown[]; edges: unknown[] }) => {
    store.dispatch(loadAgents({
      nodes: data.nodes as import('../store/agentSlice').AgentCanvasNode[],
      edges: data.edges as import('../store/agentSlice').AgentCanvasEdge[],
    }))
    setView('agent')
    window.dispatchEvent(new CustomEvent('fangyu:switch-chat-mode', { detail: { mode: 'agent' } }))
  }, [])

  const bindAgentSkillFlow = useCallback((flow: { nodes: unknown[]; edges: unknown[] }) => {
    if (!agentBindTarget) return
    store.dispatch(updateSkillFlow({
      nodeId: agentBindTarget.nodeId,
      skillId: agentBindTarget.skillId,
      flow,
    }))
    agentBindTarget.onBound?.()
    setAgentBindTarget(null)
    setAgentAssetPickerOpen(false)
  }, [agentBindTarget])

  const assetContextValue = useMemo(() => ({
    loadFlowToCanvas,
    loadAgentsToCanvas,
    agentBindTarget,
    setAgentBindTarget: (t: AgentBindTarget | null) => {
      setAgentBindTarget(t)
      if (t) setAgentAssetPickerOpen(true)
    },
    bindAgentSkillFlow,
  }), [loadFlowToCanvas, loadAgentsToCanvas, agentBindTarget, bindAgentSkillFlow])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : '')
    localStorage.setItem('theme-dark', String(dark))
  }, [dark])

  const handleExportCode = useCallback(() => {
    const handle = flowCanvasRef.current
    if (!handle) return
    setExportedCode(handle.exportCode())
    setExportCodeVisible(true)
  }, [])

  const handleLoadDemo = useCallback(async (demoId: string) => {
    const demo = demoFlows[demoId]
    if (!demo) {
      alert(`用例「${demoId}」不存在，请检查 demoFlows 配置`)
      return
    }
    flowCanvasRef.current?.importFlow(demo.data)
    setTimeout(async () => {
      await flowCanvasRef.current?.runSimulation(true)
    }, 300)
  }, [])

  useEffect(() => {
    fetchSettings(store.dispatch)
    fetchAllProjects(store.dispatch)
    const onSwitchView = (e: Event) => {
      const view = (e as CustomEvent).detail?.view
      if (view === 'flow' || view === 'agent') setView(view)
    }
    window.addEventListener('fangyu:switch-view', onSwitchView)
    // 首次加载时，如果画布为空则添加默认输入节点
    setTimeout(() => {
      const handle = flowCanvasRef.current
      if (handle) {
        const { nodes } = handle.getNodesAndEdges()
        if (nodes.length === 0) {
          handle.importFlow({
            flow_id: '', flow_name: '',
            nodes: [{ id: 'input_default', type: 'input', name: '输入', category: '流程控制', config: { default_value: '' }, position: { x: 300, y: 180 } }],
            links: [], global_meta: { session_id: '', user_id: '' },
          })
        }
      }
    }, 100)
    return () => window.removeEventListener('fangyu:switch-view', onSwitchView)
  }, [])

  const handleNewFlow = useCallback(() => {
    if (!confirm('新建将清空当前画布，是否继续？')) return
    flowCanvasRef.current?.newFlow()
    setTimeout(() => {
      flowCanvasRef.current?.importFlow({
        flow_id: '',
        flow_name: '',
        nodes: [
          {
            id: 'input_default',
            type: 'input',
            name: '输入',
            category: '流程控制',
            config: { default_value: '' },
            position: { x: 300, y: 180 },
          },
        ],
        links: [],
        global_meta: { session_id: '', user_id: '' },
      })
    }, 50)
  }, [])

  const handleSaveFlow = useCallback(async () => {
    const handle = flowCanvasRef.current
    if (!handle) return
    const { nodes, edges } = handle.getNodesAndEdges()
    if (nodes.length === 0) return

    const data = convertToExportFormat(nodes, edges)
    const state = store.getState()

    let project = state.saves.projects.find(p => p.id === state.saves.currentProjectId)
    if (!project) {
      await createProjectApi('默认项目', store.dispatch)
      const newState = store.getState()
      project = newState.saves.projects.find(p => p.id === newState.saves.currentProjectId)
      if (!project) return
    }

    const suggested = `保存 ${(project.saves.length || 0) + 1}`
    const name = window.prompt('输入保存名称：', suggested)
    if (!name?.trim()) return

    if (project.saves[0] && JSON.stringify(project.saves[0].data) === JSON.stringify(data)) {
      alert('内容无变化，未保存')
      return
    }
    await saveFlowApi(project.id, name.trim(), data as unknown as Record<string, unknown>, store.dispatch)
    store.dispatch({ type: 'flow/markClean' })
  }, [])

  const handleShowHistory = useCallback(() => {
    store.dispatch(toggleHistory())
  }, [])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        flowCanvasRef.current?.importFlow(data)
      } catch {
        alert('导入失败：无效的 JSON 文件')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const handleExportBundle = useCallback(() => {
    const handle = flowCanvasRef.current
    if (!handle) return
    const { nodes, edges } = handle.getNodesAndEdges()
    if (nodes.length === 0) {
      alert('Flow 画布为空，请先添加节点')
      return
    }
    setExportNodes(nodes)
    setExportEdges(edges)
    setExportDialogVisible(true)
  }, [])

  const handleExportFlow = useCallback(() => {
    const flowData = flowCanvasRef.current?.exportFlow()
    if (!flowData || (flowData as { nodes: unknown[] }).nodes.length === 0) {
      alert('画布为空，请先添加节点')
      return
    }
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flow_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleGroupSelected = useCallback(() => {
    flowCanvasRef.current?.groupSelected()
  }, [])

  const handleUngroupSelected = useCallback(() => {
    flowCanvasRef.current?.ungroupSelected()
  }, [])

  const handleDeleteSelected = useCallback(() => {
    flowCanvasRef.current?.deleteSelected()
  }, [])

  const handleDeleteNode = useCallback((id: string) => {
    flowCanvasRef.current?.deleteNodeById(id)
  }, [])

  const handleDeleteEdge = useCallback((id: string) => {
    flowCanvasRef.current?.deleteEdgeById(id)
  }, [])

  const handleSimulate = useCallback(async () => {
    setSimulating(true)
    try {
      await flowCanvasRef.current?.runSimulation()
    } finally {
      setSimulating(false)
    }
  }, [])

  const handleDispatchToWorker = useCallback(async () => {
    setDispatching(true)
    try {
      const workers = await fetchWorkers()
      const online = workers.filter(w => w.online)
      if (online.length === 0) {
        window.alert('没有在线的方隅·行 Worker。\n\n请先运行：dev-worker.bat 或 dev-worker-tray.bat\n（需序 API：dev.bat）')
        return
      }

      const snapshot = snapshotFlowFromCanvas()
      if (!snapshot) {
        window.alert('Flow 画布为空，请先添加节点')
        return
      }

      const exportData = getExportFormatFromCanvas()
      if (!exportData) {
        window.alert('无法读取画布快照')
        return
      }

      const state = store.getState()
      let project = state.saves.projects.find(p => p.id === state.saves.currentProjectId)
      if (!project) {
        await createProjectApi('默认项目', store.dispatch)
        const newState = store.getState()
        project = newState.saves.projects.find(p => p.id === newState.saves.currentProjectId)
        if (!project) {
          window.alert('无法创建默认项目')
          return
        }
      }

      const snapshotName = `发布 ${new Date().toLocaleString()}`
      const saveEntry = await saveFlowApi(
        project.id,
        snapshotName,
        exportData as unknown as Record<string, unknown>,
        store.dispatch,
      )

      const result = await publishAndDispatchFromCanvas({
        exportData,
        snapshotName,
        snapshotId: saveEntry.id,
        workerId: selectedWorkerId,
      })
      setHighlightWorkerTaskId(result.task_id)
      setWorkersFocusSignal(s => s + 1)

      void pollTaskUntilDone(result.task_id, {
        onUpdate: (task) => setHighlightWorkerTaskId(task.id),
      }).then((task) => {
        setHighlightWorkerTaskId(task.id)
        setWorkersFocusSignal(s => s + 1)
        if (task.status === 'failed') {
          window.alert(`任务失败：${task.error ?? '未知错误'}`)
        }
      }).catch(() => {
        setWorkersFocusSignal(s => s + 1)
      })
    } catch (err) {
      window.alert(`派发失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDispatching(false)
    }
  }, [selectedWorkerId])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const workers = await fetchWorkers()
        if (cancelled) return
        const online = workers.filter(w => w.online)
        setWorkersOnline(online.length)
        setOnlineWorkers(online)
        setSelectedWorkerId(prev => {
          if (prev && online.some(w => w.id === prev)) return prev
          return online[0]?.id ?? null
        })
      } catch {
        if (!cancelled) {
          setWorkersOnline(0)
          setOnlineWorkers([])
          setSelectedWorkerId(null)
        }
      }
    }
    void refresh()
    const timer = setInterval(refresh, 10_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const handleRestore = useCallback((saveData: unknown) => {
    flowCanvasRef.current?.restoreFromSave(saveData)
  }, [])

  const handleOpenSettings = useCallback(() => {
    store.dispatch(toggleSettings())
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void handleSaveFlow()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        flowCanvasRef.current?.undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        flowCanvasRef.current?.redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSaveFlow])

  return (
    <ErrorBoundary>
    <AssetContext.Provider value={assetContextValue}>
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* 导航栏 */}
      <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', padding: '0 16px', alignItems: 'center', height: 32 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 16 }}>AI Flow Canvas</span>
        <button onClick={() => setView('flow')} style={{
          padding: '3px 12px', border: 'none', borderRadius: '4px 4px 0 0',
          background: view === 'flow' ? 'var(--bg-primary)' : 'transparent',
          color: view === 'flow' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: view === 'flow' ? 600 : 400,
          cursor: 'pointer', fontSize: 12, marginRight: 1,
        }}>Flow 画布{useAppSelector(s => s.flow.dirty) ? ' ●' : ''}</button>
        <button onClick={() => setView('agent')} style={{
          padding: '3px 12px', border: 'none', borderRadius: '4px 4px 0 0',
          background: view === 'agent' ? 'var(--bg-primary)' : 'transparent',
          color: view === 'agent' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: view === 'agent' ? 600 : 400,
          cursor: 'pointer', fontSize: 12,
        }}>Agent 编排</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setDark(d => !d)} style={{
          padding: '3px 10px', border: 'none', borderRadius: 4, cursor: 'pointer',
          background: 'transparent', color: '#888', fontSize: 14,
        }} title={dark ? '切换浅色模式' : '切换深色模式'}>{dark ? '☀' : '☾'}</button>
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>v2.0</span>
      </div>
      {/* 两个画布始终挂载，通过 display 切换 */}
      <div style={{ display: view === 'flow' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <TopToolbar
        onNewFlow={handleNewFlow}
        onSaveFlow={handleSaveFlow}
        onShowHistory={handleShowHistory}
        onImportFlow={handleImportClick}
        onExportFlow={handleExportBundle}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        onDeleteSelected={handleDeleteSelected}
        onSimulate={handleSimulate}
        onDispatchToWorker={handleDispatchToWorker}
        onFileSelected={handleFileSelected}
        onOpenSettings={handleOpenSettings}
        onOpenFlowConfig={() => store.dispatch(openFlowConfig())}
        onLoadDemo={handleLoadDemo}
        onBatchTest={() => setBatchVisible(true)}
        onOpenAssets={() => setAssetsFocusSignal(s => s + 1)}
        simulating={simulating}
        dispatching={dispatching}
        workersOnline={workersOnline}
        onlineWorkers={onlineWorkers}
        selectedWorkerId={selectedWorkerId}
        onSelectWorker={setSelectedWorkerId}
      />
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelected} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {libraryCollapsed ? (
          <button onClick={() => setLibraryCollapsed(false)} style={{ width: 20, border: 'none', borderRight: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="展开组件">
            ▶
          </button>
        ) : (
          <NodeLibrary onCollapse={() => setLibraryCollapsed(true)} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} data-testid="flow-canvas">
            <FlowCanvas ref={flowCanvasRef} />
            <ConfigPanel
          onUpdateEdge={(edgeId, data) => flowCanvasRef.current?.updateEdgeData(edgeId, data)}
          onUpdateNode={(nodeId, data) => flowCanvasRef.current?.updateNodeData(nodeId, data)}
          onDeleteNode={handleDeleteNode}
          onDeleteEdge={handleDeleteEdge}
        />
          </div>
          <BottomPanel
            focusAssetsSignal={assetsFocusSignal}
            focusWorkersSignal={workersFocusSignal}
            highlightWorkerTaskId={highlightWorkerTaskId}
          />
        </div>
      </div>
      <SaveHistory
        onRestore={handleRestore}
        selectedWorkerId={selectedWorkerId}
        onDispatchTask={(taskId) => {
          setHighlightWorkerTaskId(taskId)
          setWorkersFocusSignal(s => s + 1)
        }}
      />
      <SettingsPanel />
      {compiling && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 32,
            textAlign: 'center', minWidth: 300,
          }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              正在编译打包（首次需下载 PyInstaller，约 1-2 分钟）
            </div>
            <div style={{
              width: 40, height: 40, border: '3px solid #e8e8e8',
              borderTopColor: '#0070f3', borderRadius: '50%',
              margin: '0 auto', animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: 12, color: '#999', marginTop: 16 }}>
              完成自动下载 （含 .exe + 源码）
            </div>
          </div>
        </div>,
        document.body
      )}
        </div>
      <div style={{ display: view === 'agent' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }} data-testid="agent-canvas">
        <AgentCanvas />
        <AgentConfigPanel />
      </div>
      {exportDialogVisible && (
        <ExportDialog
          nodes={exportNodes}
          edges={exportEdges}
          onClose={() => setExportDialogVisible(false)}
          onCompileStart={() => setCompiling(true)}
          onCompileEnd={() => setCompiling(false)}
        />
      )}
      <>{batchVisible && <BatchRunner onClose={() => setBatchVisible(false)} />}</>
      {exportCodeVisible && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setExportCodeVisible(false)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 16,
            width: 700, maxWidth: '90vw', maxHeight: '80vh',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>导出 Python 代码</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                onClick={() => setExportCodeVisible(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <textarea readOnly value={exportedCode}
              style={{
                flex: 1, minHeight: 400, fontFamily: 'monospace', fontSize: 12,
                padding: 12, borderRadius: 8, border: '1px solid #e8e8e8',
                background: '#fafafa', resize: 'none', whiteSpace: 'pre', overflow: 'auto',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="notion-btn" onClick={() => {
                navigator.clipboard.writeText(exportedCode)
              }}>复制</button>
              <button className="notion-btn primary" onClick={() => {
                const blob = new Blob([exportedCode], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = 'flow.py'; a.click()
                URL.revokeObjectURL(url)
              }}>下载</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {agentAssetPickerOpen && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setAgentAssetPickerOpen(false); setAgentBindTarget(null) }}>
          <div style={{
            width: 'min(920px, 94vw)', height: 'min(640px, 86vh)', background: 'var(--bg-primary)',
            borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>
              从资产库选择流程 — 绑定到 Agent 技能
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <AssetLibrary
                onLoadFlow={() => {}}
                agentBindMode
                onBindAgentSkill={bindAgentSkillFlow}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
    </AssetContext.Provider>
    </ErrorBoundary>
  )
}
