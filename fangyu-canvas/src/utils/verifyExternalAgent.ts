/** 外部 Agent 授权后部署校验：本厂注册态 + 对端可达 */
import type { AgentCanvasNode } from '../store/agentSlice'
import { probeApiHealth } from './apiHealth'
import { discoverExternalAgent } from './externalAgent'
import { apiFetch } from '../platform'

export interface VerifyStep {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export interface VerifyResult {
  ok: boolean
  steps: VerifyStep[]
}

export async function verifyExternalAgentDeploy(node: AgentCanvasNode): Promise<VerifyResult> {
  const steps: VerifyStep[] = []
  const name = node.id
  const rpc = node.externalConfig?.rpcUrl || ''

  const apiOk = await probeApiHealth()
  steps.push({
    id: 'platform',
    label: '本厂 API',
    ok: apiOk,
    detail: apiOk ? '健康' : '不可达',
  })

  let registryOk = false
  let registryDetail = '未找到'
  try {
    const resp = await apiFetch('/api/v1/a2a/agents')
    if (resp.ok) {
      const body = await resp.json()
      const list = (Array.isArray(body) ? body : (body.agents || [])) as Array<{
        name?: string
        external?: boolean
        authorized?: boolean
        rpc_url?: string
      }>
      const hit = list.find(a => a.name === name) || null
      if (hit) {
        registryOk = hit.external ? hit.authorized === true : true
        registryDetail = hit.authorized
          ? `已授权 · ${hit.rpc_url || rpc || '—'}`
          : '已注册但未授权'
      } else {
        registryDetail = `通讯录无「${name}」`
      }
    } else {
      registryDetail = `列表失败 (${resp.status})`
    }
  } catch (e) {
    registryDetail = e instanceof Error ? e.message : String(e)
  }
  steps.push({
    id: 'registry',
    label: '本厂注册',
    ok: registryOk,
    detail: registryDetail,
  })

  let remoteOk = false
  let remoteDetail = '跳过（无 RPC）'
  if (rpc) {
    try {
      const discovered = await discoverExternalAgent(rpc)
      const cardName = (discovered.card as { name?: string })?.name
      remoteOk = true
      remoteDetail = cardName
        ? `可达 · Card「${cardName}」`
        : `可达 · ${discovered.rpc_url}`
    } catch (e) {
      remoteDetail = e instanceof Error ? e.message : String(e)
    }
  }
  steps.push({
    id: 'remote',
    label: '对端探测',
    ok: remoteOk || !rpc,
    detail: remoteDetail,
  })

  // 无 RPC 时对端步骤视为跳过且不拖垮整体（仅本厂校验）
  const required = steps.filter(s => s.id !== 'remote' || !!rpc)
  const ok = required.every(s => s.ok)
  return { ok, steps }
}
