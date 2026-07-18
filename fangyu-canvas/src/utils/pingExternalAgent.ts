/** 外部 Agent 试跑：经平台 A2A 发一条 ping */
import type { AgentCanvasNode } from '../store/agentSlice'
import { a2aSend } from './a2aSend'

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

export async function pingExternalAgent(
  node: AgentCanvasNode,
  *,
  text = 'ping from 方隅授权向导',
  skillId?: string,
): Promise<PingResult> {
  const skill = skillId
    || node.externalConfig?.allowedSkills?.[0]
    || node.agentCard?.skills?.[0]?.id
    || 'default'
  try {
    const resp = await a2aSend({
      target_agent: node.id,
      message: {
        role: 'user',
        parts: [{ type: 'text', text }],
        metadata: { skill_id: skill === '*' ? 'default' : skill },
      },
    })
    const task = await resp.json() as Record<string, unknown>
    if (!resp.ok) {
      return {
        ok: false,
        error: typeof task.detail === 'string' ? task.detail : `HTTP ${resp.status}`,
      }
    }
    if (task.violation) {
      return {
        ok: false,
        state: 'denied',
        excerpt: extractA2aTaskText(task),
        error: extractA2aTaskText(task),
        taskId: String(task.id || ''),
      }
    }
    const status = task.status as { state?: string } | undefined
    const state = String(status?.state || '')
    const ok = state === 'completed' || state === 'working' || state === 'submitted'
    return {
      ok: ok && state === 'completed',
      state,
      excerpt: extractA2aTaskText(task).slice(0, 240),
      taskId: String(task.id || ''),
      error: state && state !== 'completed' ? `state=${state}` : undefined,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
