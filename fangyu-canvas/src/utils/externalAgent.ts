import type { AgentCanvasNode } from '../store/agentSlice'
import type { AgentCard } from './a2aProtocol'

export interface ExternalAgentConfig {
  rpcUrl: string
  agentId: string
  publicKey: string
  remoteName: string
  authorized: boolean
  allowedSkills: string[]
}

export async function discoverExternalAgent(rpcUrl: string): Promise<{
  rpc_url: string
  card: AgentCard
  identity?: { agent_id: string; public_key: string; require_envelope?: boolean }
}> {
  const resp = await fetch('/api/v1/a2a/agents/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpc_url: rpcUrl }),
  })
  if (!resp.ok) throw new Error(`发现失败 (${resp.status})`)
  return resp.json()
}

export async function registerExternalAgent(node: AgentCanvasNode): Promise<void> {
  const ext = node.externalConfig
  const card = node.agentCard
  if (!ext || !card) throw new Error('外部 Agent 配置不完整')

  const resp = await fetch('/api/v1/a2a/agents/register_external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: node.id,
      card: { ...card, name: card.name || node.label },
      rpc_url: ext.rpcUrl,
      agent_id: ext.agentId,
      public_key: ext.publicKey,
      remote_name: ext.remoteName || card.name,
      allowed_skills: ext.allowedSkills?.length ? ext.allowedSkills : ['*'],
      authorized: ext.authorized,
    }),
  })
  if (!resp.ok) throw new Error(`注册外部 Agent 失败 (${resp.status})`)
}

export async function authorizeExternalAgent(
  name: string,
  authorized: boolean,
  allowedSkills?: string[],
): Promise<void> {
  const resp = await fetch(`/api/v1/a2a/agents/${encodeURIComponent(name)}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorized, allowed_skills: allowedSkills }),
  })
  if (!resp.ok) throw new Error(`授权失败 (${resp.status})`)
}

export async function deployAllAgents(agents: AgentCanvasNode[]): Promise<{ success: boolean; count: number }> {
  const locals = agents.filter(a => a.type === 'a2a-agent' && a.agentCard)
  const externals = agents.filter(a => a.type === 'a2a-external' && a.agentCard && a.externalConfig)

  let count = 0
  if (locals.length) {
    const { deployAgentsToBackend } = await import('./agentDeploy')
    const r = await deployAgentsToBackend(locals)
    count += r.count
  }
  for (const ext of externals) {
    await registerExternalAgent(ext)
    count += 1
  }
  return { success: count > 0, count }
}
