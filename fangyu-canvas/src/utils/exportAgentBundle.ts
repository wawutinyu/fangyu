import type { AgentCanvasNode } from '../store/agentSlice'
import type { AgentKind } from './a2aProtocol'
import { buildDefaultSkillFlow } from './agentDeploy'

export interface ExportAgentBundleOptions {
  a2aPort?: number
  requireEnvelope?: boolean
  agentKind?: AgentKind
  /** zip = 仅目录结构；exe = 含 PyInstaller 编译的 .exe（默认） */
  format?: 'zip' | 'exe'
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
    format: options.format ?? 'exe',
  }
}

export interface BundleRunbook {
  name: string
  run: string
  health: string
  rpc: string
  validate: string
  rpcExample: string
}

export function buildRunbook(name: string, a2aPort: number = 9001): BundleRunbook {
  const bundleDir = `./${name}.bundle`
  const rpc = `http://127.0.0.1:${a2aPort}/rpc`
  return {
    name,
    run: `py -3 -m fangyu bundle run "${bundleDir}" --port ${a2aPort} --daemon`,
    health: `http://127.0.0.1:${a2aPort}/health`,
    rpc,
    validate: `py -3 -m fangyu bundle validate "${bundleDir}"`,
    rpcExample: `py -3 -m fangyu bundle rpc "${bundleDir}" --url ${rpc} -m "hello"`,
  }
}

/** 导出单个 Agent 为 .bundle.zip（调用后端 API） */
export async function downloadAgentBundle(
  agent: AgentCanvasNode,
  options: ExportAgentBundleOptions = {},
): Promise<BundleRunbook> {
  const payload = buildBundleExportPayload(agent, options)

  const resp = await fetch('/api/v1/bundle/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(payload.format === 'exe' ? 960_000 : 120_000),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(err || `导出失败 (${resp.status})`)
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const isExe = payload.format === 'exe'
  a.download = isExe ? `${payload.name}_agent.zip` : `${payload.name}.bundle.zip`
  a.click()
  URL.revokeObjectURL(url)
  const exeBuilt = resp.headers.get('X-Fangyu-Exe-Built')
  if (isExe && exeBuilt === 'false') {
    alert('exe 编译未成功，ZIP 内仍含 Bundle 目录与 compile.log，请查看日志或运行 start.bat')
  }
  return buildRunbook(payload.name, payload.a2a_port)
}
