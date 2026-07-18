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
  discovered_from?: string
}> {
  const resp = await fetch('/api/v1/a2a/agents/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rpc_url: rpcUrl,
      base_url: rpcUrl,
    }),
  })
  if (!resp.ok) throw new Error(`发现失败 (${resp.status})`)
  return resp.json()
}

export async function probeRemoteFactory(baseUrl: string): Promise<{
  ok: boolean
  base_url: string
  rpc_url: string
  card?: AgentCard | null
  hits?: Array<{ path: string; ok: boolean }>
}> {
  const resp = await fetch('/api/v1/a2a/factories/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: baseUrl }),
  })
  if (!resp.ok) throw new Error(`探测失败 (${resp.status})`)
  return resp.json()
}

export async function listRemoteFactories(): Promise<Array<{
  id: string
  base_url: string
  rpc_url?: string
  label?: string
}>> {
  const resp = await fetch('/api/v1/a2a/factories')
  if (!resp.ok) return []
  const data = await resp.json()
  return data.factories || []
}

export async function saveRemoteFactory(input: {
  base_url: string
  label?: string
  rpc_url?: string
  card_name?: string
}): Promise<{ id?: string; base_url?: string; label?: string }> {
  const resp = await fetch('/api/v1/a2a/factories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) throw new Error(`保存工厂失败 (${resp.status})`)
  const data = await resp.json()
  return data.factory || data
}

export async function probeAndSaveFactory(input: {
  base_url?: string
  rpc_url?: string
  label?: string
  instance_id?: string
  persist?: boolean
}): Promise<{
  ok: boolean
  persisted?: boolean
  probe?: {
    ok?: boolean
    base_url?: string
    rpc_url?: string
    card?: { name?: string } | null
    hits?: Array<{ path: string; ok: boolean }>
  }
  factory?: { id?: string; base_url?: string; label?: string }
}> {
  const resp = await fetch('/api/v1/a2a/factories/probe-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_url: input.base_url || '',
      rpc_url: input.rpc_url || '',
      label: input.label || '',
      instance_id: input.instance_id || '',
      persist: input.persist !== false,
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.detail || `探测入库失败 (${resp.status})`)
  return data
}

export async function heartbeatFactories(input?: {
  factory_ids?: string[]
  sync_presence?: boolean
  ttl_sec?: number
}): Promise<{
  ok: boolean
  total: number
  online: number
  offline: number
  results: Array<{ id: string; base_url: string; ok: boolean; online: boolean; error?: string | null }>
  factories?: Array<{
    id: string
    base_url: string
    label?: string
    online?: boolean
    last_heartbeat_at?: number
    card_name?: string
  }>
}> {
  const resp = await fetch('/api/v1/a2a/factories/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      factory_ids: input?.factory_ids || [],
      sync_presence: input?.sync_presence !== false,
      ttl_sec: input?.ttl_sec ?? 120,
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.detail || `批量心跳失败 (${resp.status})`)
  return data
}

export async function alignFactoriesPresence(input?: {
  import_hosts?: boolean
  export_factories?: boolean
  probe?: boolean
}): Promise<{
  ok: boolean
  imported: number
  exported: number
  factories?: Array<{ id: string; base_url: string; label?: string; online?: boolean }>
}> {
  const resp = await fetch('/api/v1/a2a/factories/align', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      import_hosts: input?.import_hosts !== false,
      export_factories: input?.export_factories !== false,
      probe: !!input?.probe,
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.detail || `对齐失败 (${resp.status})`)
  return data
}

export interface FactoryHeartbeatLoopStatus {
  enabled: boolean
  running: boolean
  interval_sec: number
  sync_presence?: boolean
  align?: boolean
  last_run_at?: number | null
  last_ok?: boolean | null
  last_error?: string | null
  last_summary?: unknown
  runs?: number
  env_interval_sec?: number
}

export async function fetchFactoryHeartbeatLoop(): Promise<FactoryHeartbeatLoopStatus> {
  const resp = await fetch('/api/v1/a2a/factories/heartbeat-loop')
  if (!resp.ok) throw new Error(`读取定时心跳失败 (${resp.status})`)
  return resp.json()
}

export async function setFactoryHeartbeatLoop(input: {
  enabled: boolean
  interval_sec?: number
  sync_presence?: boolean
  align?: boolean
}): Promise<FactoryHeartbeatLoopStatus> {
  const resp = await fetch('/api/v1/a2a/factories/heartbeat-loop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: input.enabled,
      interval_sec: input.interval_sec ?? 90,
      sync_presence: input.sync_presence !== false,
      align: input.align !== false,
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.detail || `设置定时心跳失败 (${resp.status})`)
  return data
}

export async function deleteRemoteFactory(factoryId: string): Promise<void> {
  const resp = await fetch(`/api/v1/a2a/factories/${encodeURIComponent(factoryId)}`, {
    method: 'DELETE',
  })
  if (!resp.ok) throw new Error(`删除工厂失败 (${resp.status})`)
}

/** 从工厂通讯录条目构造外部 Agent 画布节点（探测 Card + 身份） */
export async function buildExternalAgentFromFactory(factory: {
  id?: string
  base_url: string
  rpc_url?: string
  label?: string
  card_name?: string
}): Promise<AgentCanvasNode> {
  const target = (factory.rpc_url || factory.base_url || '').trim()
  if (!target) throw new Error('工厂缺少 base_url / rpc_url')
  const discovered = await discoverExternalAgent(target)
  const card = discovered.card as AgentCard
  const name = String(
    factory.label || factory.card_name || card.name || factory.id || '外部工厂',
  )
  const id = `ext_fac_${(factory.id || name).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || Date.now()}`
    const skillIds = (card.skills || [])
      .map(s => (typeof s === 'string' ? s : s?.id))
      .filter((id): id is string => !!id && id.trim().length > 0)
    return {
      id,
      label: name,
      type: 'a2a-external',
      position: {
        x: 220 + Math.random() * 280,
        y: 80 + Math.random() * 220,
      },
      agentCard: {
        name,
        version: card.version || '1.0.0',
        description: card.description,
        capabilities: card.capabilities || { streaming: false, pushNotifications: false },
        skills: card.skills?.length ? card.skills : [{ id: 'default', name: 'default' }],
        defaultInterface: card.defaultInterface || { type: 'a2a', url: discovered.rpc_url },
        metadata: { ...(card.metadata || {}), external: true, factory_id: factory.id, factory_base: factory.base_url },
      },
      externalConfig: {
        rpcUrl: discovered.rpc_url,
        agentId: discovered.identity?.agent_id || '',
        publicKey: discovered.identity?.public_key || '',
        remoteName: name,
        authorized: false,
        allowedSkills: skillIds.length ? skillIds : ['default'],
      },
    }
}

/** 派发到 App：写入画布并切到序·Agent */
export function pullFactoryToCanvas(node: AgentCanvasNode): void {
  window.dispatchEvent(new CustomEvent('fangyu:add-external-agent', { detail: { node } }))
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
