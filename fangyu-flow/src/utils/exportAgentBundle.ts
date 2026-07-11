import type { AgentCanvasNode } from '../store/agentSlice'
import type { AgentKind } from './a2aProtocol'
import { buildDefaultSkillFlow } from './agentDeploy'

export interface ExportAgentBundleOptions {
  a2aPort?: number
  requireEnvelope?: boolean
  agentKind?: AgentKind
}

function resolveSkills(agent: AgentCanvasNode) {
  const card = agent.agentCard!
  const skills: { skill_id: string; nodes: unknown[]; edges: unknown[] }[] = []
  const skillIds = card.skills?.length ? card.skills.map(s => s.id) : ['default']
  for (const skillId of skillIds) {
    const bound = agent.skillFlows?.[skillId]
    const flow = bound?.nodes?.length ? bound : buildDefaultSkillFlow(card, skillId)
    skills.push({
      skill_id: skillId,
      nodes: flow.nodes,
      edges: flow.edges,
    })
  }
  return skills
}

function buildAgentCard(agent: AgentCanvasNode, a2aPort: number) {
  const card = { ...agent.agentCard! }
  const kind = agent.agentKind || (card.metadata?.agentKind as AgentKind) || 'worker'
  const workerOnly = kind === 'worker'
  const userEnabled = kind === 'interface' || kind === 'hybrid'
  const a2aUrl = `http://127.0.0.1:${a2aPort}/rpc`
  card.interfaces = {
    user: { enabled: userEnabled },
    a2a: { enabled: true, url: a2aUrl },
  }
  card.defaultInterface = { type: 'a2a', url: a2aUrl }
  card.metadata = { ...card.metadata, agentKind: kind, workerOnly }
  return { card, kind, workerOnly }
}

export function buildBundleExportPayload(agent: AgentCanvasNode, options: ExportAgentBundleOptions = {}) {
  if (!agent.agentCard) throw new Error('Agent 缺少 AgentCard')
  const a2aPort = options.a2aPort ?? 9001
  const { card, kind, workerOnly } = buildAgentCard(agent, a2aPort)
  const name = card.name || agent.label || 'agent'
  return {
    name,
    worker_only: workerOnly,
    agent_kind: options.agentKind || kind,
    a2a_port: a2aPort,
    require_envelope: options.requireEnvelope ?? true,
    agent_card: card,
    skills: resolveSkills(agent),
  }
}

/** 导出单个 Agent 为 .bundle.zip（调用后端 API） */
export async function downloadAgentBundle(
  agent: AgentCanvasNode,
  options: ExportAgentBundleOptions = {},
): Promise<void> {
  const payload = buildBundleExportPayload(agent, options)

  const resp = await fetch('/api/v1/bundle/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(err || `导出失败 (${resp.status})`)
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${payload.name}.bundle.zip`
  a.click()
  URL.revokeObjectURL(url)
}
