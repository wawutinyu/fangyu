/** 运维面板 — 托管启停 + 组织 ACL + 人审 + SSO（G2-D / G2-C Studio 面） */
import { useCallback, useEffect, useState } from 'react'
import {
  fetchAuthConfig,
  fetchAuthMe,
  setStoredAccessToken,
  startOidcLogin,
  tryConsumeOidcCallbackFromUrl,
  type AuthConfig,
  type AuthMe,
} from '../utils/authApi'
import {
  addAclMember,
  approveApproval,
  checkAcl,
  denyApproval,
  enableAcl,
  fetchAcl,
  fetchManagedLogs,
  initAcl,
  listApprovals,
  listManagedInstances,
  quickStartDemo,
  startManaged,
  stopManaged,
  type AclDoc,
  type ApprovalItem,
  type ManagedInstance,
} from '../utils/opsApi'

interface OpsPanelProps {
  headerless?: boolean
}

export default function OpsPanel({ headerless }: OpsPanelProps) {
  const [tab, setTab] = useState<'managed' | 'acl' | 'approvals' | 'sso'>('managed')
  const [instances, setInstances] = useState<ManagedInstance[]>([])
  const [acl, setAcl] = useState<AclDoc | null>(null)
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bundleDir, setBundleDir] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [logLines, setLogLines] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [execNote, setExecNote] = useState<string | null>(null)

  const [memberId, setMemberId] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState('viewer')
  const [checkPrincipal, setCheckPrincipal] = useState('operator')
  const [checkTool, setCheckTool] = useState('shell')
  const [checkResult, setCheckResult] = useState<string | null>(null)

  const [authCfg, setAuthCfg] = useState<AuthConfig | null>(null)
  const [authMe, setAuthMe] = useState<AuthMe | null>(null)
  const [authNote, setAuthNote] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [inst, a, ap] = await Promise.all([
        listManagedInstances(),
        fetchAcl(),
        listApprovals(),
      ])
      setInstances(inst)
      setAcl(a)
      setApprovals(ap.approvals)
      setPendingCount(
        ap.pending_count
        ?? ap.approvals.filter(x => x.status === 'pending').length,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    void (async () => {
      try {
        const consumed = await tryConsumeOidcCallbackFromUrl()
        if (consumed) setAuthNote('OIDC 登录成功，已写入本地 Bearer')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      try {
        setAuthCfg(await fetchAuthConfig())
        setAuthMe(await fetchAuthMe())
      } catch {
        /* 配置可读失败不挡运维 */
      }
    })()
  }, [])

  useEffect(() => {
    if (tab !== 'approvals') return
    const t = window.setInterval(() => { void reload() }, 3000)
    return () => window.clearInterval(t)
  }, [tab, reload])

  const reloadAuth = async () => {
    setAuthCfg(await fetchAuthConfig())
    setAuthMe(await fetchAuthMe())
  }

  const onOidcLogin = async () => {
    setLoading(true)
    setError(null)
    setAuthNote(null)
    try {
      const started = await startOidcLogin(window.location.origin + '/')
      window.location.href = started.authorization_url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    }
  }

  const onLogout = () => {
    setStoredAccessToken(null)
    setAuthMe(null)
    setAuthNote('已清除本地 Bearer')
  }

  const onQuickDemo = async () => {
    setLoading(true)
    setError(null)
    try {
      await quickStartDemo()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onStart = async () => {
    const dir = bundleDir.trim()
    if (!dir) {
      setError('请填写 Bundle 目录路径')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await startManaged({ bundle_dir: dir, name: instanceName.trim() || undefined })
      setBundleDir('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onStop = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await stopManaged(id)
      if (selectedId === id) {
        setSelectedId(null)
        setLogLines([])
      }
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onLogs = async (id: string) => {
    setSelectedId(id)
    const lines = await fetchManagedLogs(id, 50)
    setLogLines(lines)
  }

  const onInitAcl = async () => {
    setLoading(true)
    try {
      setAcl(await initAcl())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onToggleAcl = async () => {
    if (!acl) return
    setLoading(true)
    try {
      setAcl(await enableAcl(!acl.enabled))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onAddMember = async () => {
    const id = memberId.trim()
    if (!id) return
    setLoading(true)
    try {
      setAcl(await addAclMember(id, memberName.trim() || id, [memberRole]))
      setMemberId('')
      setMemberName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onCheck = async () => {
    const r = await checkAcl({
      principal_id: checkPrincipal.trim(),
      tool: checkTool.trim() || undefined,
    })
    setCheckResult(
      r.allowed
        ? `允许 — ${checkPrincipal} 使用 ${checkTool || '(无工具)'}`
        : `拒绝 — ${r.rule || ''} ${r.message || ''}`.trim(),
    )
  }

  const onApprove = async (id: string, execute: boolean) => {
    setLoading(true)
    setError(null)
    setExecNote(null)
    try {
      const out = await approveApproval(id, execute)
      if (execute && out.execution) {
        const ex = out.execution
        setExecNote(
          ex.status === 'needs_approval'
            ? `仍待确认: ${ex.status}`
            : `已执行 exit=${ex.exit_code ?? '?'}${(ex.stdout || '').trim() ? ` · ${(ex.stdout || '').trim().slice(0, 80)}` : ''}`,
        )
      }
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onDeny = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await denyApproval(id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const members = acl?.members ? Object.entries(acl.members) : []
  const pending = approvals.filter(a => a.status === 'pending')
  const recent = approvals.filter(a => a.status !== 'pending').slice(0, 12)

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontSize: 12 }}>
      <div style={{
        display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border-light)',
        flexShrink: 0, alignItems: 'center',
      }}>
        <button
          className="notion-btn"
          style={{ fontSize: 12, fontWeight: tab === 'managed' ? 600 : 400 }}
          onClick={() => setTab('managed')}
        >
          托管
        </button>
        <button
          className="notion-btn"
          style={{ fontSize: 12, fontWeight: tab === 'acl' ? 600 : 400 }}
          onClick={() => setTab('acl')}
        >
          组织 ACL
        </button>
        <button
          className="notion-btn"
          style={{ fontSize: 12, fontWeight: tab === 'approvals' ? 600 : 400 }}
          onClick={() => setTab('approvals')}
          title="shell ask 人审队列"
        >
          人审{pendingCount > 0 ? ` · ${pendingCount}` : ''}
        </button>
        <button
          className="notion-btn"
          style={{ fontSize: 12, fontWeight: tab === 'sso' ? 600 : 400 }}
          onClick={() => setTab('sso')}
          title="企业 OIDC / 本地 Bearer"
        >
          SSO
        </button>
        <div style={{ flex: 1 }} />
        <button className="notion-btn" style={{ fontSize: 12 }} onClick={reload} disabled={loading}>
          刷新
        </button>
      </div>

      {error && (
        <div style={{ padding: '6px 12px', color: '#c0392b', background: 'var(--bg-secondary)', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {tab === 'managed' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="notion-btn primary"
              style={{ fontSize: 12 }}
              onClick={onQuickDemo}
              disabled={loading}
              title="自动创建演示 Bundle 并后台启动"
            >
              一键启动演示托管
            </button>
            <input
              className="notion-input"
              style={{ flex: 2, minWidth: 180, fontSize: 12 }}
              placeholder="或填 Bundle 目录绝对路径"
              value={bundleDir}
              onChange={e => setBundleDir(e.target.value)}
            />
            <input
              className="notion-input"
              style={{ flex: 1, minWidth: 100, fontSize: 12 }}
              placeholder="实例名（可选）"
              value={instanceName}
              onChange={e => setInstanceName(e.target.value)}
            />
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={onStart} disabled={loading}>
              启动
            </button>
          </div>

          {instances.length === 0 && (
            <div style={{ color: 'var(--text-muted)', padding: 12, textAlign: 'center' }}>
              暂无托管实例。点上方「一键启动演示托管」即可，无需手填路径。
            </div>
          )}

          {instances.map(inst => (
            <div
              key={inst.id}
              style={{
                border: '1px solid var(--border-light)',
                borderRadius: 6,
                padding: '8px 10px',
                background: 'var(--bg-secondary)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <strong>{inst.name || inst.id}</strong>
                <span style={{
                  color: inst.alive ? '#1a7f37' : 'var(--text-muted)',
                  fontSize: 11,
                }}>
                  {inst.alive ? '运行中' : inst.status || '已停'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  :{inst.port} {inst.agent ? `· ${inst.agent}` : ''}
                </span>
                <div style={{ flex: 1 }} />
                <button className="notion-btn" style={{ fontSize: 11 }} onClick={() => onLogs(inst.id)}>日志</button>
                {inst.alive && (
                  <button className="notion-btn" style={{ fontSize: 11 }} onClick={() => onStop(inst.id)}>停止</button>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, wordBreak: 'break-all' }}>
                {inst.bundle_dir}
              </div>
            </div>
          ))}

          {selectedId && (
            <div>
              <div className="section-title" style={{ marginBottom: 4 }}>日志 · {selectedId}</div>
              <pre style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: 4,
                padding: 8,
                fontSize: 10,
                maxHeight: 140,
                overflow: 'auto',
                margin: 0,
                whiteSpace: 'pre-wrap',
              }}>
                {logLines.length ? logLines.join('\n') : '(空)'}
              </pre>
            </div>
          )}
        </div>
      )}

      {tab === 'acl' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              组织：{acl?.org_name || '未初始化'}
              {' · '}
              <strong style={{ color: acl?.enabled ? '#1a7f37' : 'var(--text-muted)' }}>
                {acl?.enabled ? '已启用' : '已关闭'}
              </strong>
            </span>
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={onInitAcl} disabled={loading}>
              初始化
            </button>
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={onToggleAcl} disabled={loading || !acl}>
              {acl?.enabled ? '关闭 ACL' : '启用 ACL'}
            </button>
          </div>

          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>成员</div>
            {members.length === 0 && (
              <div style={{ color: 'var(--text-muted)' }}>无成员。先初始化。</div>
            )}
            {members.map(([id, m]) => (
              <div key={id} style={{
                display: 'flex', gap: 8, padding: '4px 0',
                borderBottom: '1px solid var(--border-light)',
              }}>
                <code style={{ fontSize: 11 }}>{id}</code>
                <span>{m.name || id}</span>
                <span style={{ color: 'var(--text-muted)' }}>{(m.roles || []).join(', ')}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="notion-input" style={{ width: 100, fontSize: 12 }} placeholder="成员 id"
              value={memberId} onChange={e => setMemberId(e.target.value)} />
            <input className="notion-input" style={{ width: 100, fontSize: 12 }} placeholder="显示名"
              value={memberName} onChange={e => setMemberName(e.target.value)} />
            <select className="notion-input" style={{ width: 110, fontSize: 12 }}
              value={memberRole} onChange={e => setMemberRole(e.target.value)}>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </select>
            <button className="notion-btn" style={{ fontSize: 12 }} onClick={onAddMember} disabled={loading}>
              添加成员
            </button>
          </div>

          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>权限试探</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="notion-input" style={{ width: 110, fontSize: 12 }} placeholder="principal"
                value={checkPrincipal} onChange={e => setCheckPrincipal(e.target.value)} />
              <input className="notion-input" style={{ width: 110, fontSize: 12 }} placeholder="tool"
                value={checkTool} onChange={e => setCheckTool(e.target.value)} />
              <button className="notion-btn" style={{ fontSize: 12 }} onClick={onCheck}>校验</button>
            </div>
            {checkResult && (
              <div style={{ marginTop: 6, color: checkResult.startsWith('允许') ? '#1a7f37' : '#c0392b' }}>
                {checkResult}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            ask 策略下，非只读 shell 会进入此队列。批准并执行会立刻跑命令；也可只批准，由 Agent 带 approval_id 重试。
          </div>
          {execNote && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{execNote}</div>
          )}
          {pending.length === 0 && (
            <div style={{ color: 'var(--text-muted)', padding: 8 }}>暂无待审请求</div>
          )}
          {pending.map(item => (
            <div
              key={item.id}
              style={{
                border: '1px solid var(--border-light)',
                borderRadius: 6,
                padding: '8px 10px',
                background: 'var(--bg-secondary)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ color: '#ca8a04' }}>pending</strong>
                <code style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.id}</code>
                <div style={{ flex: 1 }} />
                <button
                  className="notion-btn primary"
                  style={{ fontSize: 11 }}
                  disabled={loading}
                  onClick={() => onApprove(item.id, true)}
                >
                  批准并执行
                </button>
                <button
                  className="notion-btn"
                  style={{ fontSize: 11 }}
                  disabled={loading}
                  onClick={() => onApprove(item.id, false)}
                >
                  仅批准
                </button>
                <button
                  className="notion-btn"
                  style={{ fontSize: 11 }}
                  disabled={loading}
                  onClick={() => onDeny(item.id)}
                >
                  拒绝
                </button>
              </div>
              <pre style={{
                margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}>
                {item.command || '(空命令)'}
              </pre>
            </div>
          ))}

          {recent.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>最近</div>
              {recent.map(item => (
                <div key={item.id} style={{
                  display: 'flex', gap: 8, padding: '4px 0',
                  borderBottom: '1px solid var(--border-light)', fontSize: 11,
                }}>
                  <span style={{
                    color: item.status === 'consumed' || item.status === 'approved' ? '#1a7f37' : '#c0392b',
                    minWidth: 64,
                  }}>
                    {item.status}
                  </span>
                  <code style={{ color: 'var(--text-muted)' }}>{item.id}</code>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.command}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'sso' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {authNote && <div style={{ color: '#1a7f37' }}>{authNote}</div>}
          <div>
            当前主体：{' '}
            <code>{authMe?.principal_id || '（未登录）'}</code>
            {authMe?.name ? ` · ${authMe.name}` : ''}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            SSO {authCfg?.enabled ? '已启用' : '未强制'} · issuer={authCfg?.issuer || '—'}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            OIDC login_ready={String(!!authCfg?.oidc?.login_ready)} · client={authCfg?.oidc?.client_id || '—'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="notion-btn primary"
              style={{ fontSize: 12 }}
              type="button"
              onClick={() => void onOidcLogin()}
              disabled={loading || !authCfg?.oidc?.login_ready}
            >
              企业 OIDC 登录
            </button>
            <button className="notion-btn" style={{ fontSize: 12 }} type="button" onClick={onLogout} disabled={loading}>
              退出本地 Bearer
            </button>
            <button
              className="notion-btn"
              style={{ fontSize: 12 }}
              type="button"
              onClick={() => void reloadAuth()}
              disabled={loading}
            >
              刷新身份
            </button>
          </div>
          <div style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            配置 DATA_DIR/sso.json 的 oidc.*（含 jwks_uri）；IdP 回调需回 Studio 同源并带 ?code=&state=。
          </div>
        </div>
      )}
    </div>
  )

  if (headerless) return body

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: 13 }}>
        运维 · 托管 / ACL / 人审 / SSO
      </div>
      {body}
    </div>
  )
}
