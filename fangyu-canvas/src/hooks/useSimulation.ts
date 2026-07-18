import { useCallback } from 'react'
import type { Node, Edge } from 'reactflow'
import { runLocalFlow, type PendingInteraction } from '../utils/localExecutor'
import { store } from '../store'
import { saveRunRecord } from '../components/RunHistory'
import { formatViolationSummary, type ViolationPayload } from '../components/ViolationPanel'
import {
  denyToViolationPayload,
  scanFlowConstitution,
  warningsToViolationPayload,
} from '../utils/constitutionWarnings'
import { formatFlowChatOutput } from '../utils/formatFlowOutput'
import { queuePreviewResult } from '../utils/pendingPreview'

export interface ShowResultsOptions {
  constitutionWarnings?: ViolationPayload | null
}

export function useSimulation(
  nodes: Node[],
  edges: Edge[],
  setLocalNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  showToast: (msg: string, type: string) => void,
  setPendingInteraction: (p: PendingInteraction | null) => void,
  setSimResults: (r: { nodeName: string; output: Record<string, unknown> }[] | null) => void,
  setSimConstitutionWarnings: (v: ViolationPayload | null) => void,
) {
  const runSimulation = useCallback(async (autoResolveInput?: boolean) => {
    if (nodes.length === 0) return
    setSimConstitutionWarnings(null)

    let pendingWarnings: ViolationPayload | null = null
    try {
      const scan = await scanFlowConstitution(nodes)
      if (scan.blocked) {
        const payload = denyToViolationPayload(scan.deny)
        setSimConstitutionWarnings(payload)
        setSimResults([])
        showToast(formatViolationSummary(payload), 'warn')
        return
      }
      if (scan.warn.length) {
        pendingWarnings = warningsToViolationPayload(scan.warn)
      }
    } catch {
      // 后端不可用时仍允许本地模拟
    }

    setPendingInteraction(null)
    setLocalNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, _simulating: false, _output: null, _status: null } })))
    const result = await runLocalFlow(nodes, edges, {
      autoResolveInput,
      breakpoints: store.getState().flow.breakpoints,
      onProgress: (nodeId, status) => {
        setLocalNodes(prev => prev.map(n => ({
          ...n,
          data: { ...n.data, _simulating: n.id === nodeId && status === 'running' },
        })))
      },
      onPending: (interaction) => {
        setPendingInteraction(interaction)
      },
    })
    setPendingInteraction(null)
    const results = result.results.map(r => ({ nodeId: r.nodeId, nodeName: r.nodeName, output: r.output || {} }))
    setSimResults(results.map(r => ({ nodeName: r.nodeName, output: r.output })))
    setSimConstitutionWarnings(pendingWarnings)
    setLocalNodes(nds => nds.map(n => {
      const res = results.find(r => r.nodeId === n.id)
      return { ...n, data: { ...n.data, _simulating: false, _output: res?.output || null, _status: 'done' as const } }
    }))
    saveRunRecord({
      id: `run_${Date.now()}`,
      time: Date.now(),
      success: result.success,
      nodeCount: result.results.length,
      results: results.map(r => ({ nodeName: r.nodeName, output: r.output })),
      error: result.error,
    })
    if (result.success) {
      const mockedLlm = result.results.some(r => r.output?._mocked === true)
      const warnNote = pendingWarnings ? `（${pendingWarnings.violations?.length || 0} 条宪法警告）` : ''
      showToast(`运行完成，${result.results.length} 个节点已执行${warnNote}`, pendingWarnings ? 'warn' : 'success')
      if (mockedLlm) {
        showToast('LLM 节点使用了 mock 响应，请确认后端已启动且已配置 API Key', 'warn')
      }
      // 先展开底部预览，再投递结果（未挂载时会写入队列，挂载后补上）
      const chatRows = results.map(r => ({
        type: String((nodes.find(n => n.id === r.nodeId)?.data?.originType) || ''),
        nodeName: r.nodeName,
        outputs: r.output,
      }))
      const text = formatFlowChatOutput(chatRows)
      window.dispatchEvent(new CustomEvent('fangyu:focus-bottom-chat'))
      queuePreviewResult(text)
    } else {
      showToast(result.error || '运行中止', 'warn')
    }
  }, [nodes, edges, setLocalNodes, showToast, setPendingInteraction, setSimResults, setSimConstitutionWarnings])

  const showResults = useCallback((
    results: Array<{ nodeId: string; nodeName: string; output: Record<string, unknown> }>,
    options?: ShowResultsOptions,
  ) => {
    setSimConstitutionWarnings(options?.constitutionWarnings ?? null)
    setSimResults(results.map(r => ({ nodeName: r.nodeName, output: r.output })))
    setLocalNodes(nds => nds.map(n => {
      const res = results.find(r => r.nodeId === n.id)
      return { ...n, data: { ...n.data, _simulating: false, _output: res?.output || null, _status: 'done' as const } }
    }))
  }, [setLocalNodes, setSimResults, setSimConstitutionWarnings])

  return { runSimulation, showResults }
}
