/** 外部 Agent 试跑：经平台 A2A 发一条 ping，并写入观事件 */
import type { AgentCanvasNode } from '../store/agentSlice'
import { a2aSend } from './a2aSend'
import { emitPresenceEvent } from './presenceApi'

export interface PingResult {
  ok: boolean
  state?: string
  excerpt?: string
  error?: string
  taskId?: string
}

export function extractA2aTaskText(task: Record<string, unknown>): string {
  if (task.violation) {
    const v = task.violation as { message?: string; rule?: string }
    return v.message || v.rule || 'ACL/信任拒绝'
  }
  const history = task.history as Array<{ role?: string; parts?: Array<{ text?: string }> }> | undefined
  const lastAgentMsg = history?.filter(m => m.role === 'agent').pop()
  const fromHistory = lastAgentMsg?.parts?.[0]?.text
  if (fromHistory) return String(fromHistory)
  const output = task.output as { results?: Array<{ outputs?: { result?: string } }> } | undefined
  const fromOut = output?.results?.slice(-1)?.[0]?.outputs?.result
  if (fromOut) return String(fromOut)
  const status = task.status as { message?: string; state?: string } | undefined
  if (status?.message) return String(status.message)
  return '(无输出)'
}

async function emitPingPresence(
  node: AgentCanvasNode,
  result: PingResult,
  skill: string,
  source: string,
): Promise<void> {
  const ok = result.ok
  await emitPresenceEvent({
    kind: 'external.ping',
    actor: 'studio:external-auth',
    target: node.id,
    message: `试跑${ok ? '通过' : '未过'} · ${node.label || node.id}`,
    severity: ok ? 'info' : (result.state === 'denied' ? 'deny' : 'warn'),
    detail: {
      ok,
      state: result.state,
      task_id: result.taskId,
      skill_id: skill,
      excerpt: result.excerpt,
      error: result.error,
      rpc_url: node.externalConfig?.rpcUrl,
      source,
    },
  })
}

export async function pingExternalAgent(
  node: AgentCanvasNode,
  opts: {
    text?: string
    skillId?: string
    emitPresence?: boolean
    source?: string
  } = {},
): Promise<PingResult> {
  const {
    text = 'ping from 方隅授权向导',
    skillId,
    emitPresence = true,
    source = 'ExternalAgentAuthWizard',
  } = opts
  const skill = skillId
    || node.externalConfig?.allowedSkills?.[0]
    || node.agentCard?.skills?.[0]?.id
    || 'default'
  const resolvedSkill = skill === '*' ? 'default' : skill
  let result: PingResult
  try {
    const resp = await a2aSend({
      target_agent: node.id,
      message: {
        role: 'user',
        parts: [{ type: 'text', text }],
        metadata: { skill_id: resolvedSkill },
      },
    })
    const task = await resp.json() as Record<string, unknown>
    if (!resp.ok) {
      result = {
        ok: false,
        error: typeof task.detail === 'string' ? task.detail : `HTTP ${resp.status}`,
      }
    } else if (task.violation) {
      result = {
        ok: false,
        state: 'denied',
        excerpt: extractA2aTaskText(task),
        error: extractA2aTaskText(task),
        taskId: String(task.id || ''),
      }
    } else {
      const status = task.status as { state?: string } | undefined
      const state = String(status?.state || '')
      result = {
        ok: state === 'completed',
        state,
        excerpt: extractA2aTaskText(task).slice(0, 240),
        taskId: String(task.id || ''),
        error: state && state !== 'completed' ? `state=${state}` : undefined,
      }
    }
  } catch (e) {
    result = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
  if (emitPresence) {
    void emitPingPresence(node, result, resolvedSkill, source)
  }
  return result
}
