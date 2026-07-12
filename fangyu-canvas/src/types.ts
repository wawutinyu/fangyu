import type { Node, Edge } from 'reactflow'

export type {
  FlowNodeType,
  ExportFormat,
  ExportNode,
  ExportLink,
} from '@fangyu/core/schema'

export interface FlowNodeData {
  originType: import('@fangyu/core/schema').FlowNodeType | string
  label: string
  name?: string
  desc?: string
  category?: string
  config: Record<string, unknown>
  mappings?: Record<string, string>
  is_group?: boolean
  inner_nodes?: InnerNodeDef[]
  inner_links?: InnerLinkDef[]
  [key: string]: unknown
}

export interface InnerNodeDef {
  id: string
  originType: string
  name?: string
  label?: string
  category?: string
  config?: Record<string, unknown>
  mappings?: Record<string, string>
  relativeX?: number
  relativeY?: number
}

export interface InnerLinkDef {
  sourceNodeId: string
  targetNodeId: string
  linkType?: string
  mappings?: Record<string, string>
}

export type FlowNode = Node<FlowNodeData>
export type FlowEdge = Edge<Record<string, unknown>>
