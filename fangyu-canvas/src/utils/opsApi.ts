/** Studio 运维 API — 托管 + 组织 ACL */
import { apiFetch } from '../platform'

export interface ManagedInstance {
  id: string
  name: string
  bundle_dir: string
  host: string
  port: number
  status: string
  alive?: boolean
  agent?: string
  health?: { status?: string; mode?: string; uptime_sec?: number }
  log_path?: string
}

export interface AclDoc {
  version?: string
  org_id?: string
  org_name?: string
  enabled: boolean
  require_principal?: boolean
  members: Record<string, { name?: string; roles?: string[] }>
  roles: Record<string, { description?: string; permissions?: string[] }>
}

export async function quickStartDemo(): Promise<ManagedInstance> {
  const res = await apiFetch('/api/v1/managed/quick-demo', { method: 'POST' })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || body.message || '一键启动失败')
  return body
}

export async function listManagedInstances(): Promise<ManagedInstance[]> {
  const res = await apiFetch('/api/v1/managed/instances')
  if (!res.ok) return []
  const body = await res.json()
  return body.instances ?? []
}

export async function startManaged(input: {
  bundle_dir: string
  name?: string
  port?: number | null
}): Promise<ManagedInstance> {
  const res = await apiFetch('/api/v1/managed/instances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bundle_dir: input.bundle_dir,
      name: input.name || '',
      port: input.port ?? null,
      wait: true,
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || body.message || '启动失败')
  return body
}

export async function stopManaged(id: string): Promise<ManagedInstance> {
  const res = await apiFetch(`/api/v1/managed/instances/${encodeURIComponent(id)}/stop`, {
    method: 'POST',
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '停止失败')
  return body
}

export async function restartManaged(id: string): Promise<ManagedInstance> {
  const res = await apiFetch(`/api/v1/managed/instances/${encodeURIComponent(id)}/restart`, {
    method: 'POST',
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '重启失败')
  return body
}

export async function upgradeManaged(id: string, bundleDir?: string): Promise<ManagedInstance> {
  const res = await apiFetch(`/api/v1/managed/instances/${encodeURIComponent(id)}/upgrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bundle_dir: bundleDir || '', wait: true }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '升级失败')
  return body
}

export async function fetchManagedLogs(id: string, tail = 40): Promise<string[]> {
  const res = await apiFetch(
    `/api/v1/managed/instances/${encodeURIComponent(id)}/logs?tail=${tail}`,
  )
  if (!res.ok) return []
  const body = await res.json()
  return body.lines ?? []
}

export async function fetchAcl(): Promise<AclDoc | null> {
  const res = await apiFetch('/api/v1/acl')
  if (!res.ok) return null
  return res.json()
}

export async function initAcl(orgName = '方隅默认组织'): Promise<AclDoc> {
  const res = await apiFetch('/api/v1/acl/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_name: orgName, enabled: true, require_principal: true }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '初始化失败')
  return body
}

export async function enableAcl(enabled: boolean): Promise<AclDoc> {
  const res = await apiFetch('/api/v1/acl/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, require_principal: enabled ? true : null }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '切换失败')
  return body
}

export async function addAclMember(memberId: string, name: string, roles: string[]): Promise<AclDoc> {
  const res = await apiFetch('/api/v1/acl/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id: memberId, name, roles }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '添加失败')
  return body
}

export async function checkAcl(input: {
  principal_id: string
  agent?: string
  skill?: string
  tool?: string
}): Promise<{ allowed: boolean; message?: string; rule?: string }> {
  const res = await apiFetch('/api/v1/acl/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return res.json()
}

export async function syncSsoToAcl(input?: {
  roles?: string[]
  name?: string
  update_existing?: boolean
}): Promise<{
  ok: boolean
  created: boolean
  member_id: string
  hint?: string | null
  status?: { is_member?: boolean; roles?: string[] }
}> {
  const res = await apiFetch('/api/v1/acl/sync-sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roles: input?.roles || ['operator'],
      name: input?.name || '',
      update_existing: !!input?.update_existing,
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '同步 SSO→ACL 失败')
  return body
}

/** 人审 — shell ask */
export interface ApprovalItem {
  id: string
  kind?: string
  command?: string
  status: string
  created_at?: number
  resolved_at?: number | null
}

export async function listApprovals(status = ''): Promise<{
  approvals: ApprovalItem[]
  pending_count: number | null
}> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  const res = await apiFetch(`/api/v1/approvals${q}`)
  if (!res.ok) return { approvals: [], pending_count: 0 }
  return res.json()
}

export async function approveApproval(
  id: string,
  execute = true,
): Promise<{ ok: boolean; approval: ApprovalItem; execution?: { exit_code?: number; stdout?: string; stderr?: string; status?: string } }> {
  const res = await apiFetch(`/api/v1/approvals/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ execute }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '批准失败')
  return body
}

export async function denyApproval(id: string): Promise<{ ok: boolean; approval: ApprovalItem }> {
  const res = await apiFetch(`/api/v1/approvals/${encodeURIComponent(id)}/deny`, {
    method: 'POST',
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '拒绝失败')
  return body
}

/** 飞书 / IM 凭证向导 */
export interface ImWizardStep {
  id: string
  label: string
  ok: boolean
  hint?: string
}

export interface ImStatus {
  ok: boolean
  bundle_dir?: string | null
  default_bundle?: string | null
  exists?: boolean
  channel?: string
  mode?: string
  enabled?: boolean
  has_topology?: boolean
  topology_ready_for_orchestrate?: boolean
  im_config_path?: string | null
  app_id?: string
  app_id_set?: boolean
  app_secret_set?: boolean
  verification_token_set?: boolean
  verification_token?: string
  events_url_hint?: string
  bundle_events_url_hint?: string
  steps?: ImWizardStep[]
  ready_for_challenge?: boolean
  ready_for_reply?: boolean
  note?: string
}

export async function fetchImStatus(bundleDir = ''): Promise<ImStatus> {
  const q = bundleDir ? `?bundle_dir=${encodeURIComponent(bundleDir)}` : ''
  const res = await apiFetch(`/api/v1/im/status${q}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '读取 IM 状态失败')
  return body
}

export async function bindFeishuChannel(input: {
  bundle_dir: string
  mode?: string
  verification_token?: string
  app_id?: string
  app_secret?: string
}): Promise<{ ok: boolean; im_config?: string; events_url_hint?: string; status?: ImStatus }> {
  const res = await apiFetch('/api/v1/im/feishu/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bundle_dir: input.bundle_dir,
      mode: input.mode || 'chat',
      verification_token: input.verification_token || '',
      app_id: input.app_id || '',
      app_secret: input.app_secret || '',
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '绑定飞书失败')
  return body
}
