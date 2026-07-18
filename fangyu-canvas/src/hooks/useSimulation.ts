import { useCallback } from 'react'
import type { Node, Edge } from 'reactflow'
import type { PendingInteraction } from '../utils/localExecutor'
import { convertToExportFormat } from '../utils/flowHelper'
import { Executor } from '../utils/executor'
import { saveRunRecord } from '../components/RunHistory'
import { type ViolationPayload } from '../components/ViolationPanel'
import {
  warningsToViolationPayload,
} from '../utils/constitutionWarnings'
import { formatFlowChatOutput } from '../utils/formatFlowOutput'
import { queuePreviewResult } from '../utils/pendingPreview'
import { formatPreviewFailure } from '../utils/previewErrors'

export interface ShowResultsOptions {
  constitutionWarnings?: ViolationPayload | null
}

/**
 * 工具栏「预览」与底部 Flow 聊天同一引擎：Executor → /api/v1/flow/run/stream。
 * localExecutor 仍供 BatchRunner / demoFlows 单测使用。
 */
export function useSimulation(
  nodes: Node[],
  edges: Edge[],
  setLocalNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  showToast: (msg: string, type: string) => void,
  setPendingInteraction: (p: PendingInteraction | null) => void,
  setSimResults: (r: { nodeName: string; output: Record<string, unknown> }[] | null) => void,
  setSimConstitutionWarnings: (v: ViolationPayload | null) => void,
) {
  const runSimulation = useCallback(async (_autoResolveInput?: boolean) => {
    if (nodes.length === 0) return
    setSimConstitutionWarnings(null)
    setPendingInteraction(null)
    setLocalNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, _simulating: false, _output: null, _status: null },
    })))

    const flowData = convertToExportFormat(nodes, edges)
    const executor = new Executor(flowData.nodes, flowData.links)
    // 工具栏无聊天文案：后端 input 节点用 default_value
    executor.setExternalInputs({})
    executor.onNodeProgress((nodeId, status) => {
      setLocalNodes(prev => prev.map(n => ({
        ...n,
        data: {
          ...n.data,
          _simulating: n.id === nodeId && status === 'running',
        },
      })))
    })

    const result = await executor.run()

    let pendingWarnings: ViolationPayload | null = null
    if (result.constitution_warnings?.length) {
      pendingWarnings = warningsToViolationPayload(result.constitution_warnings)
    }
    if (result.violation) {
      const payload = result.violation as ViolationPayload
      setSimConstitutionWarnings(payload)
      setSimResults([])
      const summary = formatPreviewFailure(null, { violation: payload })
      showToast(summary.split('\n')[0], 'warn')
      window.dispatchEvent(new CustomEvent('fangyu:focus-bottom-chat'))
      queuePreviewResult(summary)
      setLocalNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data, _simulating: false },
      })))
      return
    }

    const results = result.results.map(r => ({
      nodeId: r.nodeId,
      nodeName: r.nodeName,
      output: (r.outputs || {}) as Record<string, unknown>,
    }))
    setSimResults(results.map(r => ({ nodeName: r.nodeName, output: r.output })))
    setSimConstitutionWarnings(pendingWarnings)
    setLocalNodes(nds => nds.map(n => {
      const res = results.find(r => r.nodeId === n.id)
      return {
        ...n,
        data: {
          ...n.data,
          _simulating: false,
          _output: res?.output || null,
          _status: 'done' as const,
        },
      }
    }))
    saveRunRecord({
      id: `run_${Date.now()}`,
      time: Date.now(),
      success: result.success,
      nodeCount: result.results.length,
      results: results.map(r => ({ nodeName: r.nodeName, output: r.output })),
      error: result.error,
    })

    const chatRows = result.results.map(r => ({
      type: r.type,
      nodeName: r.nodeName,
      outputs: r.outputs,
    }))

    if (result.success) {
      const warnNote = pendingWarnings
        ? `（${pendingWarnings.violations?.length || 0} 条宪法警告）`
        : ''
      showToast(`运行完成，${result.results.length} 个节点已执行${warnNote}`, pendingWarnings ? 'warn' : 'success')
      const text = formatFlowChatOutput(chatRows)
      window.dispatchEvent(new CustomEvent('fangyu:focus-bottom-chat'))
      queuePreviewResult(text)
    } else {
      const errText = formatPreviewFailure(result.error || '运行中止')
      showToast(errText.split('\n')[0], 'warn')
      window.dispatchEvent(new CustomEvent('fangyu:focus-bottom-chat'))
      queuePreviewResult(errText)
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
