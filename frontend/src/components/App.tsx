import { Component, useEffect, useRef, useCallback } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import TopToolbar from './TopToolbar'
import NodeLibrary from './NodeLibrary'
import FlowCanvas, { type FlowCanvasHandle } from './FlowCanvas'
import ConfigPanel from './ConfigPanel'
import BottomPanel from './BottomPanel'
import SaveHistory from './SaveHistory'
import SettingsPanel from './SettingsPanel'
import { store } from '../store'
import { toggleSettings, fetchSettings } from '../store/settingsSlice'
import { toggleHistory, saveFlowApi, fetchAllProjects, createProjectApi } from '../store/saveSlice'
import { convertToExportFormat } from '../utils/flowHelper'

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

  useEffect(() => {
    fetchSettings(store.dispatch)
    fetchAllProjects(store.dispatch)
  }, [])

  const handleNewFlow = useCallback(() => {
    if (!confirm('新建将清空当前画布，是否继续？')) return
    flowCanvasRef.current?.newFlow()
    setTimeout(() => {
      flowCanvasRef.current?.importFlow({
        nodes: [{
          id: 'start_default',
          originType: 'start',
          name: '开始',
          category: '流程控制',
          label: '开始',
          config: {},
          mappings: {},
          x: 300, y: 100,
        }],
        links: [],
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

  const handleSimulate = useCallback(() => {
    flowCanvasRef.current?.runSimulation()
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <TopToolbar
        onNewFlow={handleNewFlow}
        onSaveFlow={handleSaveFlow}
        onShowHistory={handleShowHistory}
        onImportFlow={handleImportClick}
        onExportFlow={handleExportFlow}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        onDeleteSelected={handleDeleteSelected}
        onSimulate={handleSimulate}
        onFileSelected={handleFileSelected}
        onOpenSettings={handleOpenSettings}
      />
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelected} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <NodeLibrary />
        <FlowCanvas ref={flowCanvasRef} />
        <ConfigPanel
          onUpdateEdge={(edgeId, data) => flowCanvasRef.current?.updateEdgeData(edgeId, data)}
          onUpdateNode={(nodeId, data) => flowCanvasRef.current?.updateNodeData(nodeId, data)}
          onDeleteNode={handleDeleteNode}
          onDeleteEdge={handleDeleteEdge}
        />
      </div>
      <BottomPanel />
      <SaveHistory onRestore={handleRestore} />
      <SettingsPanel />
    </div>
    </ErrorBoundary>
  )
}
