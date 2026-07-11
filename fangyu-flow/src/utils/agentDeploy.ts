import type { AgentCanvasNode } from '../store/agentSlice'
import type { AgentCard } from './a2aProtocol'
import { getReactFlowInstance } from '../components/FlowCanvas'
import { convertToExportFormat } from './flowHelper'

/** 将 Flow 画布当前流程快照为 Agent 技能可执行的 nodes/edges */
export function snapshotFlowFromCanvas(): { nodes: unknown[]; edges: unknown[] } | null {
  const rf = getReactFlowInstance()
  if (!rf) return null
  const { nodes, edges } = rf.toObject()
  if (!nodes.length) return null
  const exported = convertToExportFormat(nodes, edges)
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

function resolveSkillFlow(agent: AgentCanvasNode, skillId: string) {
  const bound = agent.skillFlows?.[skillId]
  if (bound?.nodes?.length) return bound
  return buildDefaultSkillFlow(agent.agentCard!, skillId)
}

/** 为 Agent 技能生成默认子流程：start → code(action) → output */
export function buildDefaultSkillFlow(card: AgentCard, skillId: string) {
  const skill = card.skills.find(s => s.id === skillId)
  const code = `result = 'processed: ' + str(_input.get('query') or _input.get('message') or '')`
  return {
    nodes: [
      { id: 's', data: { originType: 'start', config: {}, label: '开始' } },
      {
        id: 'act',
        data: {
          originType: 'code',
          label: skill?.name || '执行',
          config: { code },
        },
      },
      { id: 'o', data: { originType: 'output', config: {}, label: '输出' } },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'act', data: {} },
      { id: 'e2', source: 'act', target: 'o', data: {} },
    ],
  }
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
