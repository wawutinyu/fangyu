import type { ExportFormat } from '@fangyu/core/schema'
import { getReactFlowInstance } from '../components/FlowCanvas'
import { convertToExportFormat } from './flowHelper'

/** 将 Flow 画布当前流程快照为引擎可执行的 nodes/edges */
export function snapshotFlowFromCanvas(): { nodes: unknown[]; edges: unknown[] } | null {
  const exported = getExportFormatFromCanvas()
  if (!exported) return null
  return exportFormatToRunPayload(exported)
}

export function getExportFormatFromCanvas(): ExportFormat | null {
  const rf = getReactFlowInstance()
  if (!rf) return null
  const { nodes, edges } = rf.toObject()
  if (!nodes.length) return null
  return convertToExportFormat(nodes, edges)
}

export function exportFormatToRunPayload(exported: ExportFormat): { nodes: unknown[]; edges: unknown[] } {
  return {
    nodes: exported.nodes.map(n => ({
      id: n.id,
      data: {
        originType: n.type,
        label: n.name,
        config: n.config,
        inner_nodes: n.inner_nodes,
        inner_links: n.inner_links,
        mappings: n.mappings,
      },
    })),
    edges: exported.links.map(l => ({
      id: l.id,
      source: l.sourceNodeId,
      target: l.targetNodeId,
      data: { linkType: l.linkType, mappings: l.mappings },
    })),
  }
}
