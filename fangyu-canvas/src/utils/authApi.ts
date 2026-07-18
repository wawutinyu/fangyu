/** Studio 认证 / SSO API */
import { apiFetch } from '../platform'

const TOKEN_KEY = 'fangyu_access_token'

export interface AuthConfig {
  enabled: boolean
  issuer?: string
  audience?: string
  oidc?: {
    authorization_endpoint?: string
    token_endpoint?: string
    jwks_uri?: string
    client_id?: string
    redirect_uri?: string
    scope?: string
    login_ready?: boolean
  }
  modes?: string[]
  hint?: string
}

export interface AuthMe {
  principal_id: string
  name?: string
  roles?: string[]
  sso_enabled?: boolean
}

export function getStoredAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredAccessToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await apiFetch('/api/v1/auth/config')
  if (!res.ok) throw new Error('读取认证配置失败')
  return res.json()
}

export async function fetchAuthMe(): Promise<AuthMe | null> {
  const token = getStoredAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await apiFetch('/api/v1/auth/me', { headers })
  if (res.status === 401) return null
  if (!res.ok) throw new Error('读取身份失败')
  return res.json()
}

export async function startOidcLogin(redirectUri?: string): Promise<{
  authorization_url: string
  state: string
  redirect_uri: string
}> {
  const res = await apiFetch('/api/v1/auth/oidc/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uri: redirectUri || window.location.origin + '/' }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || '无法启动 OIDC 登录')
  return body
}

export async function completeOidcCallback(code: string, state: string): Promise<{
  access_token: string
  principal_id: string
}> {
  const res = await apiFetch('/api/v1/auth/oidc/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || 'OIDC 回调失败')
  if (body.access_token) setStoredAccessToken(body.access_token)
  return body
}

/** 若 URL 带 code/state，完成回调并清掉查询参数。 */
export async function tryConsumeOidcCallbackFromUrl(): Promise<boolean> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return false
  await completeOidcCallback(code, state)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('session_state')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)
  return true
}
