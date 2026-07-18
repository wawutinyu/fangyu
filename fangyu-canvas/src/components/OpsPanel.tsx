/** 运维面板 — 托管启停 + 组织 ACL + 人审 + SSO + 飞书凭证向导 + A2A 工厂目录 */
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
  alignFactoriesPresence,
  buildExternalAgentFromFactory,
  deleteRemoteFactory,
  fetchFactoryHeartbeatLoop,
  heartbeatFactories,
  listRemoteFactories,
  probeAndSaveFactory,
  probeRemoteFactory,
  pullFactoryToCanvas,
  setFactoryHeartbeatLoop,
  type FactoryHeartbeatLoopStatus,
} from '../utils/externalAgent'
import {
  addAclMember,
  approveApproval,
  bindFeishuChannel,
  checkAcl,
  denyApproval,
  enableAcl,
  fetchAcl,
  fetchImStatus,
  fetchManagedLogs,
  initAcl,
  listApprovals,
  listManagedInstances,
  quickStartDemo,
  restartManaged,
  startManaged,
  stopManaged,
  syncSsoToAcl,
  upgradeManaged,
  type AclDoc,
  type ApprovalItem,
  type ImStatus,
  type ManagedInstance,
} from '../utils/opsApi'

interface OpsPanelProps {
  headerless?: boolean
}

export default function OpsPanel({ headerless }: OpsPanelProps) {
  const [tab, setTab] = useState<'managed' | 'acl' | 'approvals' | 'sso' | 'im' | 'factories'>('managed')
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

  const [imStatus, setImStatus] = useState<ImStatus | null>(null)
  const [imBundleDir, setImBundleDir] = useState('')
  const [imMode, setImMode] = useState('chat')
  const [imAppId, setImAppId] = useState('')
  const [imAppSecret, setImAppSecret] = useState('')
  const [imToken, setImToken] = useState('')
  const [imNote, setImNote] = useState<string | null>(null)

  const [facUrl, setFacUrl] = useState('')
  const [facLabel, setFacLabel] = useState('')
  const [factories, setFactories] = useState<Array<{
    id: string
    base_url: string
    rpc_url?: string
    label?: string
    card_name?: string
    updated_at?: number
    online?: boolean
    last_heartbeat_at?: number
  }>>([])
  const [facProbe, setFacProbe] = useState<{
    ok?: boolean
    base_url?: string
    rpc_url?: string
    card?: { name?: string; version?: string } | null
    hits?: Array<{ path: string; ok: boolean }>
  } | null>(null)
  const [facNote, setFacNote] = useState<string | null>(null)
  const [facLoop, setFacLoop] = useState<FactoryHeartbeatLoopStatus | null>(null)
  const [facLoopSec, setFacLoopSec] = useState(90)

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

  const onSyncSsoAcl = async () => {
    setLoading(true)
    setError(null)
    setAuthNote(null)
    try {
      const out = await syncSsoToAcl({ roles: [memberRole || 'operator'] })
      const base = out.created
        ? `已将 ${out.member_id} 加入 ACL`
        : `${out.member_id} 已在 ACL 中`
      setAuthNote(out.hint ? `${base} · ${out.hint}` : base)
      await reload()
      await reloadAuth()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const reloadIm = useCallback(async (dir?: string) => {
    const target = (dir ?? imBundleDir).trim()
    try {
      const st = await fetchImStatus(target)
      setImStatus(st)
      if (st.bundle_dir && !imBundleDir.trim()) setImBundleDir(st.bundle_dir)
      else if (!target && st.default_bundle) setImBundleDir(st.default_bundle)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [imBundleDir])

  useEffect(() => {
    if (tab !== 'im') return
    void reloadIm()
  }, [tab, reloadIm])

  const onBindFeishu = async () => {
    const dir = imBundleDir.trim()
    if (!dir) {
      setError('请填写 Bundle 目录')
      return
    }
    setLoading(true)
    setError(null)
    setImNote(null)
    try {
      const out = await bindFeishuChannel({
        bundle_dir: dir,
        mode: imMode,
        verification_token: imToken,
        app_id: imAppId,
        app_secret: imAppSecret,
      })
      setImStatus(out.status || await fetchImStatus(dir))
      setImNote(`已写入 ${out.im_config || 'config/im.json'} · 回调 ${out.events_url_hint || ''}`)
      setImAppSecret('')
      setImToken('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const reloadFactories = useCallback(async () => {
    try {
      setFactories(await listRemoteFactories())
      try {
        const st = await fetchFactoryHeartbeatLoop()
        setFacLoop(st)
        if (st.interval_sec) setFacLoopSec(st.interval_sec)
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (tab !== 'factories') return
    void reloadFactories()
  }, [tab, reloadFactories])

  const onProbeFactory = async (urlOverride?: string) => {
    const url = (urlOverride ?? facUrl).trim()
    if (!url) {
      setError('请填写工厂 base_url')
      return
    }
    setFacUrl(url)
    setLoading(true)
    setError(null)
    setFacNote(null)
    try {
      const out = await probeRemoteFactory(url)
      setFacProbe(out)
      setFacNote(out.ok
        ? `探测成功 · card=${out.card?.name || '—'} · rpc=${out.rpc_url || '—'}`
        : '探测未拿到 Card，仍可手动入库')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFacProbe(null)
    }
    setLoading(false)
  }

  const onSaveFactory = async () => {
    const url = (facProbe?.base_url || facUrl).trim()
    if (!url) {
      setError('请先探测或填写 base_url')
      return
    }
    setLoading(true)
    setError(null)
    setFacNote(null)
    try {
      const out = await probeAndSaveFactory({
        base_url: url,
        label: facLabel || facProbe?.card?.name || '',
      })
      setFacProbe(out.probe || facProbe)
      setFacNote(`已入库 ${out.factory?.label || out.factory?.base_url || url}`)
      setFacUrl('')
      setFacLabel('')
      await reloadFactories()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onRegisterManagedFactory = async (inst: ManagedInstance) => {
    setLoading(true)
    setError(null)
    setFacNote(null)
    try {
      const out = await probeAndSaveFactory({
        instance_id: inst.id,
        label: inst.name || inst.id,
      })
      setTab('factories')
      setFacProbe(out.probe || null)
      setFacNote(`托管「${inst.name || inst.id}」已探测入库 · ${out.factory?.base_url || ''}`)
      await reloadFactories()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onPullFactoryToCanvas = async (f: {
    id: string
    base_url: string
    rpc_url?: string
    label?: string
    card_name?: string
  }) => {
    setLoading(true)
    setError(null)
    setFacNote(null)
    try {
      const node = await buildExternalAgentFromFactory(f)
      pullFactoryToCanvas(node)
      setFacNote(`已拉入画布 · ${node.label}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const onDeleteFactory = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await deleteRemoteFactory(id)
      await reloadFactories()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onHeartbeatFactories = async () => {
    setLoading(true)
    setError(null)
    setFacNote(null)
    try {
      const out = await heartbeatFactories({ sync_presence: true })
      if (out.factories) setFactories(out.factories)
      else await reloadFactories()
      setFacNote(`批量心跳：在线 ${out.online}/${out.total}（已同步 Presence）`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onAlignFactories = async () => {
    setLoading(true)
    setError(null)
    setFacNote(null)
    try {
      const out = await alignFactoriesPresence({ import_hosts: true, export_factories: true, probe: false })
      if (out.factories) setFactories(out.factories)
      else await reloadFactories()
      setFacNote(`对齐完成：导入 ${out.imported} · 导出 ${out.exported}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onToggleFacLoop = async (enabled: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const st = await setFactoryHeartbeatLoop({
        enabled,
        interval_sec: facLoopSec,
        sync_presence: true,
        align: true,
      })
      setFacLoop(st)
      setFacNote(enabled
        ? `定时心跳已开启（每 ${st.interval_sec}s）`
        : '定时心跳已关闭')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
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

  const onRestart = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await restartManaged(id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const onUpgrade = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const dir = bundleDir.trim()
      await upgradeManaged(id, dir || undefined)
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
        <button
          className="notion-btn"
          style={{ fontSize: 12, fontWeight: tab === 'im' ? 600 : 400 }}
          onClick={() => setTab('im')}
          title="飞书凭证配置向导（真机订阅暂缓）"
        >
          飞书
        </button>
        <button
          className="notion-btn"
          style={{ fontSize: 12, fontWeight: tab === 'factories' ? 600 : 400 }}
          onClick={() => setTab('factories')}
          title="A2A 跨厂通讯录"
        >
          工厂
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
                <button
                  className="notion-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => void onRestart(inst.id)}
                  disabled={loading}
                  title="同 Bundle 热重启"
                >重启</button>
                <button
                  className="notion-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => void onUpgrade(inst.id)}
                  disabled={loading}
                  title="升级：可先在上方填新 Bundle 路径，否则沿用原路径"
                >升级</button>
                <button
                  className="notion-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => void onRegisterManagedFactory(inst)}
                  disabled={loading || !inst.port}
                  title="探测 http://host:port 并写入 A2A 工厂通讯录"
                  data-testid="managed-register-factory"
                >入库工厂</button>
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
          {authNote && <div style={{ color: '#1a7f37' }}>{authNote}</div>}
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

          <div style={{
            padding: 8, background: 'var(--bg-secondary)', borderRadius: 6,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div>
              SSO 主体：{' '}
              <code>{authMe?.principal_id || '（未登录）'}</code>
              {authMe?.acl?.is_member
                ? ` · 已在 ACL（${(authMe.acl.roles || []).join(',') || '—'}）`
                : authMe?.principal_id
                  ? ' · 尚未入库'
                  : ''}
            </div>
            <button
              className="notion-btn primary"
              style={{ fontSize: 12, alignSelf: 'flex-start' }}
              type="button"
              onClick={() => void onSyncSsoAcl()}
              disabled={loading || !authMe?.principal_id}
              title="把当前 Bearer 主体写入组织成员"
            >
              将当前 SSO 主体加入 ACL
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

      {tab === 'im' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {imNote && <div style={{ color: '#1a7f37' }}>{imNote}</div>}
          <div style={{ color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {imStatus?.note || '真机事件订阅仍暂缓；此处只写 Bundle 凭证与回调 URL。'}
          </div>
          <input
            className="notion-input"
            style={{ fontSize: 12 }}
            placeholder="Bundle 目录绝对路径"
            value={imBundleDir}
            onChange={e => setImBundleDir(e.target.value)}
            data-testid="im-bundle-dir"
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select
              className="notion-input"
              style={{ fontSize: 12, minWidth: 100 }}
              value={imMode}
              onChange={e => setImMode(e.target.value)}
            >
              <option value="chat">mode=chat</option>
              <option value="orchestrate">mode=orchestrate</option>
            </select>
            <input
              className="notion-input"
              style={{ flex: 1, minWidth: 120, fontSize: 12 }}
              placeholder="App ID"
              value={imAppId}
              onChange={e => setImAppId(e.target.value)}
              data-testid="im-app-id"
            />
            <input
              className="notion-input"
              style={{ flex: 1, minWidth: 120, fontSize: 12 }}
              placeholder="App Secret"
              type="password"
              value={imAppSecret}
              onChange={e => setImAppSecret(e.target.value)}
              data-testid="im-app-secret"
            />
            <input
              className="notion-input"
              style={{ flex: 1, minWidth: 140, fontSize: 12 }}
              placeholder="Verification Token"
              type="password"
              value={imToken}
              onChange={e => setImToken(e.target.value)}
              data-testid="im-verification-token"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="notion-btn primary"
              style={{ fontSize: 12 }}
              type="button"
              onClick={() => void onBindFeishu()}
              disabled={loading}
              data-testid="im-bind"
            >
              写入并设为默认
            </button>
            <button
              className="notion-btn"
              style={{ fontSize: 12 }}
              type="button"
              onClick={() => void reloadIm()}
              disabled={loading}
              data-testid="im-refresh"
            >
              刷新检查清单
            </button>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: 10, borderRadius: 6, border: '1px solid var(--border-light)',
          }} data-testid="im-checklist">
            {(imStatus?.steps || []).map(step => (
              <div key={step.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: step.ok ? '#1a7f37' : '#c0392b', minWidth: 16 }}>
                  {step.ok ? '✓' : '○'}
                </span>
                <div>
                  <div>{step.label}</div>
                  {step.hint && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{step.hint}</div>
                  )}
                </div>
              </div>
            ))}
            {!imStatus?.steps?.length && (
              <div style={{ color: 'var(--text-muted)' }}>填写 Bundle 后点刷新，查看检查清单。</div>
            )}
          </div>
          <div style={{ color: 'var(--text-muted)', lineHeight: 1.5, fontSize: 11 }}>
            challenge 就绪={String(!!imStatus?.ready_for_challenge)}
            {' · '}
            主动回消息就绪={String(!!imStatus?.ready_for_reply)}
            <br />
            事件 URL：<code>{imStatus?.events_url_hint || '—'}</code>
            {imStatus?.im_config_path ? (
              <>
                <br />
                配置：<code>{imStatus.im_config_path}</code>
              </>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'factories' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="a2a-factories">
          {facNote && <div style={{ color: '#1a7f37' }}>{facNote}</div>}
          <div style={{ color: 'var(--text-muted)', lineHeight: 1.45, fontSize: 11 }}>
            探测远程工厂根 URL（不必手写 /rpc），入库后供跨厂发现与外部 Agent 使用。
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              className="notion-input"
              style={{ flex: 2, minWidth: 180, fontSize: 12 }}
              placeholder="https://peer.example:8787"
              value={facUrl}
              onChange={e => setFacUrl(e.target.value)}
              data-testid="factory-url"
            />
            <input
              className="notion-input"
              style={{ flex: 1, minWidth: 100, fontSize: 12 }}
              placeholder="备注名（可选）"
              value={facLabel}
              onChange={e => setFacLabel(e.target.value)}
            />
            <button className="notion-btn" style={{ fontSize: 12 }} type="button" onClick={() => void onProbeFactory()} disabled={loading} data-testid="factory-probe">
              探测
            </button>
            <button className="notion-btn primary" style={{ fontSize: 12 }} type="button" onClick={() => void onSaveFactory()} disabled={loading} data-testid="factory-save">
              探测入库
            </button>
            <button
              className="notion-btn"
              style={{ fontSize: 12 }}
              type="button"
              onClick={() => void onHeartbeatFactories()}
              disabled={loading || factories.length === 0}
              data-testid="factory-heartbeat"
              title="批量探测通讯录并同步到观·主机"
            >
              批量心跳
            </button>
            <button
              className="notion-btn"
              style={{ fontSize: 12 }}
              type="button"
              onClick={() => void onAlignFactories()}
              disabled={loading}
              data-testid="factory-align"
              title="Presence 主机 ↔ 工厂通讯录双向对齐"
            >
              对齐 Presence
            </button>
          </div>
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-light)', fontSize: 11,
          }} data-testid="factory-heartbeat-loop">
            <span style={{ color: 'var(--text-muted)' }}>
              定时心跳 {facLoop?.running ? '运行中' : '关闭'}
              {facLoop?.runs != null ? ` · 已跑 ${facLoop.runs} 次` : ''}
            </span>
            <input
              className="notion-input"
              style={{ width: 64, fontSize: 11 }}
              type="number"
              min={15}
              value={facLoopSec}
              onChange={e => setFacLoopSec(Math.max(15, Number(e.target.value) || 90))}
              title="间隔秒"
            />
            <span style={{ color: 'var(--text-muted)' }}>秒</span>
            <button
              className="notion-btn"
              style={{ fontSize: 11 }}
              type="button"
              disabled={loading}
              onClick={() => void onToggleFacLoop(!(facLoop?.running || facLoop?.enabled))}
            >
              {facLoop?.running || facLoop?.enabled ? '停止定时' : '开启定时'}
            </button>
            {facLoop?.env_interval_sec ? (
              <span style={{ color: 'var(--text-muted)' }}>
                env={facLoop.env_interval_sec}s
              </span>
            ) : null}
          </div>
          {facProbe && (
            <div style={{ fontSize: 11, padding: 8, borderRadius: 6, border: '1px solid var(--border-light)' }}>
              <div>ok={String(!!facProbe.ok)} · card={facProbe.card?.name || '—'} · rpc=<code>{facProbe.rpc_url || '—'}</code></div>
              {facProbe.hits && (
                <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                  {facProbe.hits.map(h => `${h.ok ? '✓' : '✗'} ${h.path}`).join(' · ')}
                </div>
              )}
            </div>
          )}
          {factories.length === 0 && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>通讯录为空</div>
          )}
          {factories.map(f => (
            <div
              key={f.id}
              style={{ border: '1px solid var(--border-light)', borderRadius: 6, padding: 10 }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong>{f.label || f.card_name || f.id}</strong>
                {f.online != null && (
                  <span style={{ fontSize: 11, color: f.online ? '#1a7f37' : '#c0392b' }}>
                    {f.online ? '在线' : '离线'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {f.base_url}
                {f.rpc_url ? ` · rpc ${f.rpc_url}` : ''}
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  className="notion-btn"
                  style={{ fontSize: 11 }}
                  type="button"
                  onClick={() => {
                    setFacLabel(f.label || '')
                    void onProbeFactory(f.base_url)
                  }}
                  disabled={loading}
                >
                  再探测
                </button>
                <button
                  className="notion-btn primary"
                  style={{ fontSize: 11 }}
                  type="button"
                  onClick={() => void onPullFactoryToCanvas(f)}
                  disabled={loading}
                  data-testid="factory-to-canvas"
                  title="探测 Card 并作为 a2a-external 节点写入序·Agent 画布"
                >
                  拉入画布
                </button>
                <button
                  className="notion-btn"
                  style={{ fontSize: 11, color: '#c0392b' }}
                  type="button"
                  onClick={() => void onDeleteFactory(f.id)}
                  disabled={loading}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (headerless) return body

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)', fontWeight: 600, fontSize: 13 }}>
        运维 · 托管 / ACL / 人审 / SSO / 飞书 / 工厂
      </div>
      {body}
    </div>
  )
}
