/** 从告警 target / detail 解析可试跑的外部 Agent 节点 */
import type { AgentCanvasNode } from '../store/agentSlice'
import { apiFetch } from '../platform'

function stripAgentPrefix(id: string): string {
  const s = (id || '').trim()
  if (s.startsWith('agent:')) return s.slice('agent:'.length)
  return s
}

export async function resolveAgentForPing(input: {
  target?: string | null
  detail?: Record<string, unknown> | null
}): Promise<AgentCanvasNode> {
  const detail = input.detail || {}
  const rawTarget = String(input.target || detail.agent || detail.agent_id || '').trim()
  const name = stripAgentPrefix(rawTarget)
  if (!name) throw new Error('告警缺少 target，无法复测')

  let rpcUrl = String(detail.rpc_url || '')
  let authorized = true
  let label = name
  let skills: Array<{ id: string; name?: string }> = []
  const skillHint = String(detail.skill_id || '')

  try {
    const resp = await apiFetch('/api/v1/a2a/agents')
    if (resp.ok) {
      const body = await resp.json()
      const list = (Array.isArray(body) ? body : (body.agents || [])) as Array<{
        name?: string
        external?: boolean
        authorized?: boolean
        rpc_url?: string
        card?: { name?: string; skills?: Array<{ id: string; name?: string }> }
      }>
      const hit = list.find(a => a.name === name)
      if (hit) {
        authorized = hit.authorized !== false
        rpcUrl = rpcUrl || String(hit.rpc_url || '')
        label = hit.card?.name || name
        if (Array.isArray(hit.card?.skills)) skills = hit.card!.skills!
      }
    }
  } catch {
    /* fall through to card fetch */
  }

  if (!skills.length) {
    try {
      const cardResp = await apiFetch(`/api/v1/a2a/agents/${encodeURIComponent(name)}/card`)
      if (cardResp.ok) {
        const card = await cardResp.json() as {
          name?: string
          skills?: Array<{ id: string; name?: string }>
          url?: string
        }
        label = card.name || label
        if (Array.isArray(card.skills)) skills = card.skills
        if (!rpcUrl && card.url) rpcUrl = String(card.url)
      }
    } catch {
      /* optional */
    }
  }

  const allowed = skillHint && skillHint !== '*'
    ? [skillHint]
    : skills.map(s => s.id).filter(Boolean).slice(0, 8)

  return {
    id: name,
    label,
    type: 'a2a-external',
    position: { x: 0, y: 0 },
    agentCard: {
      name: label,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false },
      skills: skills.length
        ? skills
        : (allowed.length ? allowed.map(id => ({ id, name: id })) : [{ id: 'default', name: 'default' }]),
      defaultInterface: { type: 'a2a', url: rpcUrl || undefined },
    },
    externalConfig: {
      rpcUrl,
      agentId: name,
      publicKey: '',
      remoteName: label,
      authorized,
      allowedSkills: allowed.length ? allowed : ['default'],
    },
  }
}
