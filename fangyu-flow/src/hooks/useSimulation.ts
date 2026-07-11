import { useCallback } from 'react'
import type { Node, Edge } from 'reactflow'
import { runLocalFlow, type PendingInteraction } from '../utils/localExecutor'
import { store } from '../store'
import { saveRunRecord } from '../components/RunHistory'

export function useSimulation(
  nodes: Node[],
  edges: Edge[],
  setLocalNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  showToast: (msg: string, type: string) => void,
  setPendingInteraction: (p: PendingInteraction | null) => void,
  setSimResults: (r: { nodeName: string; output: Record<string, unknown> }[] | null) => void,
) {
  const runSimulation = useCallback(async (autoResolveInput?: boolean) => {
    if (nodes.length === 0) return
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
      showToast(`运行完成，${result.results.length} 个节点已执行`, 'success')
    } else {
      showToast(result.error || '运行中止', 'warn')
    }
  }, [nodes, edges, setLocalNodes, showToast, setPendingInteraction, setSimResults])

  const showResults = useCallback((results: Array<{ nodeId: string; nodeName: string; output: Record<string, unknown> }>) => {
    setSimResults(results.map(r => ({ nodeName: r.nodeName, output: r.output })))
    setLocalNodes(nds => nds.map(n => {
      const res = results.find(r => r.nodeId === n.id)
      return { ...n, data: { ...n.data, _simulating: false, _output: res?.output || null, _status: 'done' as const } }
    }))
  }, [setLocalNodes, setSimResults])

  return { runSimulation, showResults }
}
