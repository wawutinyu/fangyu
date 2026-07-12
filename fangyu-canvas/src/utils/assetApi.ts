export type AssetType =
  | 'flow_template'
  | 'subflow'
  | 'agent_topology'
  | 'skill_ref'
  | 'tool_ref'
  | 'knowledge_ref'
  | 'constitution_pack'
  | 'bundle_ref'

export type AssetScope = 'official' | 'user'

export interface AssetMeta {
  id: string
  type: AssetType
  scope: AssetScope
  name: string
  description: string
  category: string
  tags: string[]
  source_ref: string
  version: string
  has_payload: boolean
  federated?: boolean
  created_at: string
  updated_at: string
}

export interface SkillFlowPayload {
  nodes: unknown[]
  edges: unknown[]
}

const TYPE_LABELS: Record<AssetType, string> = {
  flow_template: '流程模板',
  subflow: '子流程',
  agent_topology: 'Agent 拓扑',
  skill_ref: '技能',
  tool_ref: '工具',
  knowledge_ref: '知识库',
  constitution_pack: '策略包',
  bundle_ref: 'Bundle',
}

export function assetTypeLabel(type: AssetType | string): string {
  return TYPE_LABELS[type as AssetType] || type
}

export async function fetchAssets(opts?: {
  type?: string
  scope?: string
  category?: string
  q?: string
  includeFederated?: boolean
}): Promise<AssetMeta[]> {
  const params = new URLSearchParams()
  if (opts?.type) params.set('type', opts.type)
  if (opts?.scope) params.set('scope', opts.scope)
  if (opts?.category) params.set('category', opts.category)
  if (opts?.q) params.set('q', opts.q)
  if (opts?.includeFederated === false) params.set('include_federated', 'false')
  const resp = await fetch(`/api/v1/assets/?${params}`)
  if (!resp.ok) throw new Error(`加载资产失败 (${resp.status})`)
  const data = await resp.json()
  return data.assets || []
}

export async function fetchAssetPayload(assetId: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`/api/v1/assets/${encodeURIComponent(assetId)}/payload`)
  if (!resp.ok) throw new Error(`加载资产内容失败 (${resp.status})`)
  const data = await resp.json()
  return (data.payload || {}) as Record<string, unknown>
}

export async function fetchAssetSkillFlow(assetId: string): Promise<SkillFlowPayload> {
  const resp = await fetch(`/api/v1/assets/${encodeURIComponent(assetId)}/skill-flow`)
  if (!resp.ok) throw new Error(`加载 Agent 流程失败 (${resp.status})`)
  return resp.json()
}

export async function createAsset(body: {
  type: AssetType
  name: string
  description?: string
  category?: string
  tags?: string[]
  payload: Record<string, unknown>
  scope?: AssetScope
}): Promise<AssetMeta> {
  const resp = await fetch('/api/v1/assets/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: 'user',
      ...body,
    }),
  })
  if (!resp.ok) throw new Error(`创建资产失败 (${resp.status})`)
  return resp.json()
}

export async function promoteSaveToAsset(body: {
  save_id?: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  payload?: Record<string, unknown>
}): Promise<AssetMeta> {
  const resp = await fetch('/api/v1/assets/from-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`晋升为资产失败 (${resp.status})`)
  return resp.json()
}

export async function deleteAsset(assetId: string): Promise<void> {
  const resp = await fetch(`/api/v1/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error(`删除资产失败 (${resp.status})`)
}

export function exportFormatToSkillFlow(data: Record<string, unknown>): SkillFlowPayload {
  const nodesRaw = (data.nodes as unknown[]) || []
  const linksRaw = (data.links as unknown[]) || (data.edges as unknown[]) || []

  const nodes = nodesRaw.map((n: unknown) => {
    const node = n as Record<string, unknown>
    if (node.data) return node
    return {
      id: node.id,
      data: {
        originType: node.type || node.originType,
        label: node.name || node.label || '',
        config: node.config || {},
        inner_nodes: node.inner_nodes || [],
        inner_links: node.inner_links || [],
        mappings: node.mappings || {},
      },
    }
  })

  const edges = linksRaw.map((l: unknown) => {
    const link = l as Record<string, unknown>
    if (link.source) return link
    return {
      id: link.id,
      source: link.sourceNodeId || link.source,
      target: link.targetNodeId || link.target,
      sourceHandle: link.sourceHandle,
      targetHandle: link.targetHandle,
      data: {
        linkType: link.linkType || 'serial',
        mappings: link.mappings || {},
      },
    }
  })

  return { nodes, edges }
}

export function isFlowAsset(type: string): boolean {
  return type === 'flow_template' || type === 'subflow'
}

export function isAgentTopology(type: string): boolean {
  return type === 'agent_topology'
}
