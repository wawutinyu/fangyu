import type { AgentCanvasNode } from '../store/agentSlice'
import type { AgentCard } from './a2aProtocol'
import { buildActionLoopFlow } from './actionLoopFlow'
import { snapshotFlowFromCanvas } from './flowSnapshot'

export { snapshotFlowFromCanvas } from './flowSnapshot'

function resolveSkillFlow(agent: AgentCanvasNode, skillId: string) {
  const bound = agent.skillFlows?.[skillId]
  if (bound?.nodes?.length) return bound
  return buildDefaultSkillFlow(agent.agentCard!, skillId)
}

/** 为 Agent 技能生成默认 Action Loop 子流程 */
export function buildDefaultSkillFlow(card: AgentCard, skillId: string, options?: { useLlmPlan?: boolean }) {
  const skill = card.skills.find(s => s.id === skillId)
  return buildActionLoopFlow(skillId, skill?.name || 'action', { useLlmPlan: options?.useLlmPlan })
}

export async function deployAgentsToBackend(agents: AgentCanvasNode[]): Promise<{ success: boolean; count: number }> {
  const payload = agents
    .filter(a => a.type === 'a2a-agent' && a.agentCard)
    .map(agent => {
      const card = agent.agentCard!
      const flow_mappings: Record<string, { nodes: unknown[]; edges: unknown[] }> = {}
      for (const skill of card.skills || []) {
        flow_mappings[skill.id] = resolveSkillFlow(agent, skill.id)
      }
      if (Object.keys(flow_mappings).length === 0) {
        flow_mappings['default'] = resolveSkillFlow(agent, 'default')
      }
      return {
        name: agent.id,
        card: { ...card, name: card.name || agent.label },
        flow_mappings,
        trust: agent.trust,
      }
    })

  if (payload.length === 0) {
    return { success: false, count: 0 }
  }

  const resp = await fetch('/api/v1/a2a/agents/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agents: payload }),
  })
  if (!resp.ok) {
    throw new Error(`部署失败 (${resp.status})`)
  }
  const data = await resp.json()
  return { success: true, count: data.count || payload.length }
}
