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
import IntentPanel from './IntentPanel'
import ScenarioPanel from './ScenarioPanel'
import ExperienceGuide from './ExperienceGuide'
import PresencePanel from './PresencePanel'
import LawPanel from './LawPanel'
import HangBoard from './HangBoard'
import SetupCopilotPanel from './SetupCopilotPanel'
import ExternalAgentAuthWizard from './ExternalAgentAuthWizard'
import { AssetContext, type AgentBindTarget } from '../context/AssetContext'
import { store } from '../store'
import { useAppSelector } from '../store/hooks'
import { toggleSettings, fetchSettings } from '../store/settingsSlice'
import { openFlowConfig } from '../store/flowSlice'
import { toggleHistory, saveFlowApi, fetchAllProjects, createProjectApi } from '../store/saveSlice'
import { updateSkillFlow, loadAgents, addAgentNode, updateAgentNode } from '../store/agentSlice'
import { convertToExportFormat } from '../utils/flowHelper'
import { demoFlows } from '../utils/demoFlows'
import { snapshotFlowFromCanvas, getExportFormatFromCanvas } from '../utils/flowSnapshot'
import { fetchWorkers, pollTaskUntilDone } from '../utils/workerApi'
import { publishAndDispatchFromCanvas, workerStartHint } from '../utils/workerDispatch'
import { apiDownHint, probeApiHealth } from '../utils/apiHealth'
import {
  FULL_EXPERIENCE_SCENARIO_ID,
  instantiateScenario,
  type ScenarioInstantiateResult,
} from '../utils/scenarioApi'
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
  const [view, setView] = useState<'flow' | 'law' | 'worker' | 'presence'>('flow')
  const [xuMode, setXuMode] = useState<'flow' | 'agent'>('flow')
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
  const [intentPanelOpen, setIntentPanelOpen] = useState(false)
  const [scenarioPanelOpen, setScenarioPanelOpen] = useState(false)
  const [setupCopilotOpen, setSetupCopilotOpen] = useState(false)
  const [authWizardNode, setAuthWizardNode] = useState<import('../store/agentSlice').AgentCanvasNode | null>(null)
  const [agentBindTarget, setAgentBindTarget] = useState<AgentBindTarget | null>(null)
  const [agentAssetPickerOpen, setAgentAssetPickerOpen] = useState(false)
  const [fullExperienceBusy, setFullExperienceBusy] = useState(false)
  const [experienceGuide, setExperienceGuide] = useState<ScenarioInstantiateResult | null>(null)
  const [hangHint, setHangHint] = useState<string | null>(null)
  /** null=探测中；false=API 不可达 */
  const [apiUp, setApiUp] = useState<boolean | null>(null)

  const flashHangHint = useCallback((msg: string, ms = 4500) => {
    setHangHint(msg)
    window.setTimeout(() => setHangHint(null), ms)
  }, [])

  const loadFlowToCanvas = useCallback((data: unknown) => {
    flowCanvasRef.current?.importFlow(data)
  }, [])

  const goXuAgent = useCallback(() => {
    setView('flow')
    setXuMode('agent')
    window.dispatchEvent(new CustomEvent('fangyu:switch-chat-mode', { detail: { mode: 'agent' } }))
  }, [])

  const loadAgentsToCanvas = useCallback((data: { nodes: unknown[]; edges: unknown[] }) => {
    store.dispatch(loadAgents({
      nodes: data.nodes as import('../store/agentSlice').AgentCanvasNode[],
      edges: data.edges as import('../store/agentSlice').AgentCanvasEdge[],
    }))
    goXuAgent()
  }, [goXuAgent])

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

  const applyScenarioResult = useCallback((result: ScenarioInstantiateResult) => {
    if (result.flow?.flow) {
      flowCanvasRef.current?.importFlow(result.flow.flow)
    }
    if (result.agents?.graph) {
      // 只装入 Agent 图，不立刻切到 Agent 视图——避免「体验全部」后底部仍停在 Agent 聊天、Flow 有图却输入无输出
      store.dispatch(loadAgents({
        nodes: result.agents.graph.nodes as import('../store/agentSlice').AgentCanvasNode[],
        edges: result.agents.graph.edges as import('../store/agentSlice').AgentCanvasEdge[],
      }))
    }
    if (result.flow?.flow) {
      setView('flow')
      setXuMode('flow')
      window.dispatchEvent(new CustomEvent('fangyu:switch-chat-mode', { detail: { mode: 'flow' } }))
    } else if (result.agents?.graph) {
      goXuAgent()
    }
  }, [goXuAgent])

  const handleFullExperience = useCallback(async () => {
    setFullExperienceBusy(true)
    try {
      const result = await instantiateScenario(FULL_EXPERIENCE_SCENARIO_ID)
      applyScenarioResult(result)
      setView('flow')
      setXuMode('flow')
      window.dispatchEvent(new CustomEvent('fangyu:switch-chat-mode', { detail: { mode: 'flow' } }))
      window.dispatchEvent(new CustomEvent('fangyu:clear-chat'))
      window.dispatchEvent(new CustomEvent('fangyu:focus-bottom-chat'))
      setExperienceGuide(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // API 不可用时：装入带 LLM 的核心链路，便于对照 Key / 预览路径
      const offline = demoFlows.core
      if (offline) {
        flowCanvasRef.current?.importFlow(offline.data)
        setView('flow')
        setXuMode('flow')
        window.dispatchEvent(new CustomEvent('fangyu:switch-chat-mode', { detail: { mode: 'flow' } }))
        alert(
          `${msg}\n\n已先加载离线「核心链路」(含 LLM 节点)。\n完整包需 API：在 Terminal 运行 python -m fangyu --server 后，再点一次「体验全部」。`,
        )
        setTimeout(() => { void flowCanvasRef.current?.runSimulation(true) }, 300)
      } else {
        alert(msg)
      }
    } finally {
      setFullExperienceBusy(false)
    }
  }, [applyScenarioResult])

  useEffect(() => {
    fetchSettings(store.dispatch)
    fetchAllProjects(store.dispatch)
    const onSwitchView = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const next = detail.view
      if (next === 'agent') {
        setView('flow')
        setXuMode('agent')
        return
      }
      if (next === 'worker' || next === 'hang' || next === '行') {
        setView('worker')
        return
      }
      if (next === 'flow' || next === 'presence' || next === 'law') {
        setView(next)
        if (next === 'flow' && (detail.xuMode === 'agent' || detail.xuMode === 'flow')) {
          setXuMode(detail.xuMode)
        }
      }
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
    // 关掉体验引导，否则 z-index 更高会挡住结果弹窗
    setExperienceGuide(null)
    setSimulating(true)
    try {
      await flowCanvasRef.current?.runSimulation(true)
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
        window.alert(workerStartHint())
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
      const targetId = (selectedWorkerId && online.some(w => w.id === selectedWorkerId))
        ? selectedWorkerId
        : online[0].id
      const workerName = online.find(w => w.id === targetId)?.name ?? 'Worker'
      setHighlightWorkerTaskId(result.task_id)
      setView('worker')
      setWorkersFocusSignal(s => s + 1)
      flashHangHint(`已派发至 ${workerName} · 任务 ${result.task_id.slice(0, 8)}…`)

      void pollTaskUntilDone(result.task_id, {
        onUpdate: (task) => setHighlightWorkerTaskId(task.id),
      }).then((task) => {
        setHighlightWorkerTaskId(task.id)
        setView('worker')
        setWorkersFocusSignal(s => s + 1)
        if (task.status === 'failed') {
          flashHangHint(`任务失败：${task.error ?? '未知错误'}`, 6000)
          window.alert(`任务失败：${task.error ?? '未知错误'}`)
        } else if (task.status === 'done') {
          flashHangHint(`任务完成 · ${task.id.slice(0, 8)}…`)
        }
      }).catch((err) => {
        setWorkersFocusSignal(s => s + 1)
        flashHangHint(
          `等待任务结果超时或中断：${err instanceof Error ? err.message : String(err)}`,
          6000,
        )
      })
    } catch (err) {
      window.alert(`派发失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDispatching(false)
    }
  }, [selectedWorkerId, flashHangHint])

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

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const ok = await probeApiHealth()
      if (!cancelled) setApiUp(ok)
    }
    void tick()
    const timer = setInterval(() => { void tick() }, 5000)
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

  useEffect(() => {
    const goLaw = () => setView('law')
    window.addEventListener('fangyu:goto-law', goLaw)
    return () => window.removeEventListener('fangyu:goto-law', goLaw)
  }, [])

  useEffect(() => {
    const openIntent = () => setIntentPanelOpen(true)
    const fullExp = () => { void handleFullExperience() }
    window.addEventListener('fangyu:open-intent', openIntent)
    window.addEventListener('fangyu:full-experience', fullExp)
    return () => {
      window.removeEventListener('fangyu:open-intent', openIntent)
      window.removeEventListener('fangyu:full-experience', fullExp)
    }
  }, [handleFullExperience])

  useEffect(() => {
    const onAddExternal = (e: Event) => {
      const node = (e as CustomEvent).detail?.node
      if (!node) return
      store.dispatch(addAgentNode(node))
      goXuAgent()
      flashHangHint(`已拉入外部 Agent「${node.label || node.id}」`, 4500)
    }
    window.addEventListener('fangyu:add-external-agent', onAddExternal)
    return () => window.removeEventListener('fangyu:add-external-agent', onAddExternal)
  }, [goXuAgent, flashHangHint])

  useEffect(() => {
    const onOpenAuth = (e: Event) => {
      const node = (e as CustomEvent).detail?.node
      if (!node) return
      setAuthWizardNode(node)
      goXuAgent()
    }
    window.addEventListener('fangyu:open-external-auth', onOpenAuth)
    return () => window.removeEventListener('fangyu:open-external-auth', onOpenAuth)
  }, [goXuAgent])

  const flowDirty = useAppSelector(s => s.flow.dirty)

  return (
    <ErrorBoundary>
    <AssetContext.Provider value={assetContextValue}>
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <TopToolbar
        view={view}
        onViewChange={setView}
        xuMode={xuMode}
        onXuModeChange={(mode) => {
          setXuMode(mode)
          if (mode === 'agent') {
            window.dispatchEvent(new CustomEvent('fangyu:switch-chat-mode', { detail: { mode: 'agent' } }))
          } else {
            window.dispatchEvent(new CustomEvent('fangyu:switch-chat-mode', { detail: { mode: 'flow' } }))
          }
        }}
        flowDirty={flowDirty}
        dark={dark}
        onToggleDark={() => setDark(d => !d)}
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
        onOpenIntent={() => setIntentPanelOpen(true)}
        onOpenScenario={() => setScenarioPanelOpen(true)}
        onFullExperience={() => { void handleFullExperience() }}
        fullExperienceBusy={fullExperienceBusy}
        onOpenSetupCopilot={() => setSetupCopilotOpen(true)}
        onBatchTest={() => setBatchVisible(true)}
        onOpenAssets={() => setAssetsFocusSignal(s => s + 1)}
        simulating={simulating}
        apiUp={apiUp}
        dispatching={dispatching}
        workersOnline={workersOnline}
        onlineWorkers={onlineWorkers}
        selectedWorkerId={selectedWorkerId}
        onSelectWorker={setSelectedWorkerId}
      />
      {apiUp === false && (
        <div
          role="alert"
          data-testid="api-down-banner"
          style={{
            padding: '8px 14px',
            fontSize: 12,
            background: '#fef2f2',
            color: '#991b1b',
            borderBottom: '1px solid #fecaca',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ flex: 1, minWidth: 200 }}>{apiDownHint()}</span>
          <button
            type="button"
            className="notion-btn"
            style={{ fontSize: 11 }}
            onClick={() => { void probeApiHealth().then(setApiUp) }}
          >
            重试探测
          </button>
        </div>
      )}
      {hangHint && (
        <div
          role="status"
          style={{
            padding: '8px 14px',
            fontSize: 12,
            background: '#eff6ff',
            color: '#1e40af',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          {hangHint}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelected} />
      {/* 画布始终挂载，通过 display 切换 */}
      <div style={{ display: view === 'flow' && xuMode === 'flow' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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
      <IntentPanel
        open={intentPanelOpen}
        onClose={() => setIntentPanelOpen(false)}
        onApply={(flow) => {
          setView('flow')
          setXuMode('flow')
          window.dispatchEvent(new CustomEvent('fangyu:switch-chat-mode', { detail: { mode: 'flow' } }))
          flowCanvasRef.current?.importFlow(flow)
          setIntentPanelOpen(false)
          // 展开底部预览，避免「应用了却不知道去哪看输出」
          window.dispatchEvent(new CustomEvent('fangyu:focus-bottom-chat'))
          flashHangHint('已载入画布 — 在下方预览聊天发一句，或点工具栏预览（同一后端引擎）', 6000)
        }}
        onApplyAgents={(graph) => {
          loadAgentsToCanvas(graph)
        }}
      />
      <ScenarioPanel
        open={scenarioPanelOpen}
        onClose={() => setScenarioPanelOpen(false)}
        onApply={(result) => {
          applyScenarioResult(result)
          if (result.scenario?.id === FULL_EXPERIENCE_SCENARIO_ID) {
            setExperienceGuide(result)
          }
        }}
      />
      <ExperienceGuide
        open={!!experienceGuide}
        title={experienceGuide?.scenario?.title}
        bundlePath={experienceGuide?.bundle?.path}
        policiesApplied={experienceGuide?.policies_applied}
        onClose={() => setExperienceGuide(null)}
        onPreview={() => {
          setExperienceGuide(null)
          setView('flow')
          setXuMode('flow')
          void handleSimulate()
        }}
        onGoLaw={() => { setExperienceGuide(null); setView('law') }}
        onGoWorker={() => { setExperienceGuide(null); setView('worker') }}
        onGoPresence={() => { setExperienceGuide(null); setView('presence') }}
      />
      <SetupCopilotPanel
        open={setupCopilotOpen}
        onClose={() => setSetupCopilotOpen(false)}
        onRegistered={(node) => {
          store.dispatch(addAgentNode(node))
          goXuAgent()
          setAuthWizardNode(node)
        }}
      />
      <ExternalAgentAuthWizard
        open={!!authWizardNode}
        node={authWizardNode}
        onClose={() => setAuthWizardNode(null)}
        onAuthorized={(node) => {
          store.dispatch(updateAgentNode({
            id: node.id,
            data: {
              externalConfig: node.externalConfig,
              agentCard: node.agentCard,
              label: node.label,
            },
          }))
          // 若不在画布则补上
          const exists = store.getState().agent.nodes.some(n => n.id === node.id)
          if (!exists) store.dispatch(addAgentNode(node))
          flashHangHint(`已授权外部 Agent「${node.label}」`, 4500)
          setAuthWizardNode(null)
        }}
      />
      <SaveHistory
        onRestore={handleRestore}
        selectedWorkerId={selectedWorkerId}
        onDispatchTask={(taskId) => {
          setHighlightWorkerTaskId(taskId)
          setView('worker')
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
      <div style={{ display: view === 'flow' && xuMode === 'agent' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }} data-testid="agent-canvas">
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <AgentCanvas />
          <AgentConfigPanel />
        </div>
      </div>
      <div style={{ display: view === 'worker' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column', minWidth: 0 }} data-testid="hang-board">
        <HangBoard highlightTaskId={highlightWorkerTaskId} />
      </div>
      <div style={{ display: view === 'law' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column', minWidth: 0 }}>
        <LawPanel />
      </div>
      <div style={{ display: view === 'presence' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column', minWidth: 0 }}>
        <PresencePanel />
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
