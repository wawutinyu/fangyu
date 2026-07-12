/** 与 Python engine 对齐的导出结构（无 React Flow 依赖） */

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

export type FlowNodeType =
  | 'start' | 'end' | 'condition' | 'switch' | 'branch' | 'loop' | 'composite'
  | 'trigger' | 'input' | 'output' | 'approval'
  | 'llm' | 'code' | 'knowledge' | 'search' | 'prompt-assembly'
  | 'http' | 'json-parse' | 'transform' | 'text-process'
  | 'variable-set' | 'variable-get'
  | 'memory-read' | 'memory-write' | 'extract-memory' | 'search-sessions' | 'memory'
  | 'tool-call' | 'register-tool' | 'execute-skill' | 'learn-skill' | 'execute' | 'register'
  | 'mcp-tools' | 'mcp-call' | 'mcp'
