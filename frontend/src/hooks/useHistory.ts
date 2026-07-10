import { useRef, useCallback } from 'react'
import type { Node, Edge } from 'reactflow'

const MAX_HISTORY = 50

export function useHistory(nodes: Node[], edges: Node[]) {
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const historyIdxRef = useRef(-1)
  const skipHistoryRef = useRef(false)

  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return }
    historyIdxRef.current++
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current)
    historyRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
      historyIdxRef.current--
    }
  }, [nodes, edges])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return null
    historyIdxRef.current--
    skipHistoryRef.current = true
    return historyRef.current[historyIdxRef.current]
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return null
    historyIdxRef.current++
    skipHistoryRef.current = true
    return historyRef.current[historyIdxRef.current]
  }, [])

  const canUndo = historyIdxRef.current > 0
  const canRedo = historyIdxRef.current < historyRef.current.length - 1

  return { pushHistory, undo, redo, canUndo, canRedo, historyRef, historyIdxRef, skipHistoryRef }
}
