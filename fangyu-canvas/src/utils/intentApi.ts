/** Intent → Flow API client */

export type IntentTemplateId = 'action_loop' | 'doc_assistant' | 'simple_io'

export interface IntentScanResult {
  deny: unknown[]
  warn: unknown[]
  all: unknown[]
  blocked: boolean
}

export interface IntentToFlowResult {
  intent: string
  template: IntentTemplateId
  mode: string
  use_llm_plan: boolean
  flow: {
    flow_id: string
    flow_name: string
    nodes: unknown[]
    links: unknown[]
    global_meta: { session_id: string; user_id: string }
  }
  scan: IntentScanResult
  rationale: string
}

export interface IntentToFlowOptions {
  template?: IntentTemplateId | null
  use_llm_plan?: boolean
  model?: string
}

export async function intentToFlow(
  intent: string,
  options: IntentToFlowOptions = {},
): Promise<IntentToFlowResult> {
  const text = intent.trim()
  if (!text) throw new Error('intent 不能为空')

  const res = await fetch('/api/v1/intent/to-flow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: text,
      template: options.template ?? null,
      use_llm_plan: options.use_llm_plan ?? false,
      model: options.model ?? 'deepseek-chat',
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Intent→Flow 失败 (${res.status}): ${detail || res.statusText}`)
  }
  return res.json() as Promise<IntentToFlowResult>
}

export async function intentToAgents(
  intent: string,
  options: { template?: string | null } = {},
): Promise<{
  intent: string
  template: string
  rationale: string
  graph: { graph_name: string; nodes: unknown[]; edges: unknown[]; pipeline: string[] }
}> {
  const text = intent.trim()
  if (!text) throw new Error('intent 不能为空')
  const res = await fetch('/api/v1/intent/to-agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: text,
      template: options.template ?? null,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Intent→Agents 失败 (${res.status}): ${detail || res.statusText}`)
  }
  return res.json()
}

export async function fetchIntentTemplates(): Promise<
  Array<{ id: IntentTemplateId; label: string; desc: string }>
> {
  const res = await fetch('/api/v1/intent/templates')
  if (!res.ok) throw new Error(`无法加载模板列表 (${res.status})`)
  const data = await res.json() as { templates: Array<{ id: IntentTemplateId; label: string; desc: string }> }
  return data.templates
}

/** 校验 API 返回是否可导入画布（纯函数，供单测） */
export function assertImportableIntentFlow(result: IntentToFlowResult): void {
  if (!result.flow || !Array.isArray(result.flow.nodes) || !Array.isArray(result.flow.links)) {
    throw new Error('Flow 缺少 nodes/links')
  }
  if (result.flow.nodes.length === 0) {
    throw new Error('Flow 节点为空')
  }
  if (result.scan?.blocked) {
    throw new Error('宪法扫描拒绝应用此 Flow')
  }
}
