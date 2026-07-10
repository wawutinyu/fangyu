import type { Node, Edge } from 'reactflow'

export type FlowNodeType =
  | 'start' | 'end' | 'condition' | 'switch' | 'loop' | 'composite'
  | 'trigger' | 'input' | 'output' | 'approval'
  | 'llm' | 'code' | 'knowledge' | 'search' | 'prompt-assembly'
  | 'http' | 'json-parse' | 'transform' | 'text-process'
  | 'variable-set' | 'variable-get'
  | 'memory-read' | 'memory-write' | 'extract-memory' | 'search-sessions'
  | 'tool-call' | 'register-tool' | 'execute-skill' | 'learn-skill'
  | 'mcp-tools' | 'mcp-call'

export interface FlowNodeData {
  originType: FlowNodeType | string
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

export interface ExportFormat {
  flow_id: string
  flow_name: string
  nodes: ExportNode[]
  links: ExportLink[]
  global_meta: { session_id: string; user_id: string }
}

export interface ExportNode {
  id: string
  type: string
  name: string
  category: string
  is_group: boolean
  inner_nodes: unknown[]
  inner_links: unknown[]
  config: Record<string, unknown>
  mappings?: Record<string, string>
  position: { x: number; y: number }
}

export interface ExportLink {
  id: string
  sourceNodeId: string
  sourceHandle?: string
  targetNodeId: string
  targetHandle?: string
  linkType: string
  mappings?: Record<string, string>
}
