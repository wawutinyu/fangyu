import type { AgentCanvasNode } from '../store/agentSlice'

export interface ViolationPayload {
  type: 'constitution' | 'trust' | 'unknown'
  rule?: string
  message: string
  violations?: { rule: string; message: string; node_id?: string; tool_name?: string; label?: string; context?: string }[]
  agent?: string
  skill_id?: string
}

export interface OrchestrateStep {
  agent: string
  skill_id: string
  label: string
}

export interface CollabStepResult {
  index: number
  agent: string
  label: string
  skill_id: string
  input: string
  output: string
  state: string
  task_id: string
  duration_ms: number
  violation?: ViolationPayload
}

export interface OrchestrateResult {
  success: boolean
  steps: CollabStepResult[]
  final_output: string
  pipeline_id?: string
  error?: string
  violation?: ViolationPayload
}

const PIPELINE_SKILL_ORDER = ['web_search', 'analyze', 'summarize', 'search', 'default']

/** 从 Agent 画布推断链式协作 pipeline（需存在 router + 多条路由规则） */
export function buildPipelineFromCanvas(nodes: AgentCanvasNode[]): OrchestrateStep[] | null {
  const router = nodes.find(n => n.type === 'a2a-router')
  if (!router?.routingRules?.length || router.routingRules.length < 2) return null

  const sorted = [...router.routingRules].sort((a, b) => {
    const ia = PIPELINE_SKILL_ORDER.indexOf(a.sourceSkill)
    const ib = PIPELINE_SKILL_ORDER.indexOf(b.sourceSkill)
    const pa = ia === -1 ? a.priority : ia
    const pb = ib === -1 ? b.priority : ib
    return pa - pb
  })

  const steps: OrchestrateStep[] = []
  for (const rule of sorted) {
    const agent = nodes.find(n => n.id === rule.targetAgentId && n.type === 'a2a-agent')
    if (!agent) continue
    steps.push({
      agent: rule.targetAgentId,
      skill_id: rule.sourceSkill,
      label: agent.label || agent.agentCard?.name || rule.targetAgentId,
    })
  }
  return steps.length >= 2 ? steps : null
}

export function hasCollaborationPipeline(nodes: AgentCanvasNode[]): boolean {
  return buildPipelineFromCanvas(nodes) !== null
}

export async function orchestrateAgents(
  query: string,
  steps: OrchestrateStep[],
  passMode: 'replace' | 'append' = 'append',
): Promise<OrchestrateResult> {
  const resp = await fetch('/api/v1/a2a/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, steps, pass_mode: passMode }),
  })
  if (!resp.ok) {
    throw new Error(`协作编排失败 (${resp.status})`)
  }
  return resp.json()
}
