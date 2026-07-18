/** 工厂原料货架 API */
import { apiFetch } from '../platform'

export interface MaterialsDoc {
  version?: string
  tools?: Array<{ id: string; source?: string; belts?: string[]; note?: string }>
  roles?: Array<{ id: string; tools?: string[]; note?: string }>
  skills?: Array<{ id: string; status?: string; path?: string; note?: string }>
  mcp?: Array<{ id: string; tools?: string[] }>
  policies?: {
    shell?: string
    default_agent_mode?: string
    [key: string]: unknown
  }
}

export interface MaterialsCatalog {
  materials: MaterialsDoc
  skill_files: Array<{
    id: string
    description: string
    when: string
    has_body: boolean
  }>
  active_skill_catalog: Array<{ id: string; description?: string }>
  mcp_internal_tools: string[]
}

export interface HarnessTrace {
  ts?: number
  kind?: string
  goal?: string
  agent_mode?: string
  success?: boolean
  turns?: number
  error?: string | null
  plan?: string[]
  tools_used?: string[]
  result_preview?: string
  trace_len?: number
  task_depth?: number
  task_id?: string
  subagent_type?: string
  task_ids?: string[]
  count?: number
  ok?: boolean
}

export async function fetchMaterialsCatalog(): Promise<MaterialsCatalog> {
  const res = await apiFetch('/api/v1/materials/catalog')
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '加载货架失败')
  return body
}

export async function fetchMaterialsDraft(): Promise<{ source: string; materials: MaterialsDoc }> {
  const res = await apiFetch('/api/v1/materials/draft')
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '加载草稿失败')
  return body
}

export async function saveMaterialsSelection(input: {
  coding_tools?: string[]
  active_skills?: string[]
  mcp_internal_tools?: string[]
  shell_policy?: string
  default_agent_mode?: string
  target?: 'draft' | 'bundle'
  bundle_dir?: string
}): Promise<{ ok: boolean; materials: MaterialsDoc }> {
  const res = await apiFetch('/api/v1/materials/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coding_tools: input.coding_tools,
      active_skills: input.active_skills,
      mcp_internal_tools: input.mcp_internal_tools,
      shell_policy: input.shell_policy,
      default_agent_mode: input.default_agent_mode,
      target: input.target || 'draft',
      bundle_dir: input.bundle_dir || '',
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || body.message || '保存失败')
  return body
}

export async function fetchHarnessTraces(opts?: {
  bundle_dir?: string
  workspace?: string
  limit?: number
}): Promise<{ path: string | null; traces: HarnessTrace[]; summary?: Record<string, unknown> }> {
  const q = new URLSearchParams()
  if (opts?.bundle_dir) q.set('bundle_dir', opts.bundle_dir)
  if (opts?.workspace) q.set('workspace', opts.workspace)
  if (opts?.limit) q.set('limit', String(opts.limit))
  const qs = q.toString()
  const res = await apiFetch(`/api/v1/materials/traces${qs ? `?${qs}` : ''}`)
  if (!res.ok) return { path: null, traces: [] }
  return res.json()
}

export async function fetchSkillDetail(skillId: string): Promise<{
  ok: boolean
  skill_id: string
  description: string
  when: string
  body: string
}> {
  const res = await apiFetch(`/api/v1/materials/skills/${encodeURIComponent(skillId)}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '加载技能失败')
  return body
}
