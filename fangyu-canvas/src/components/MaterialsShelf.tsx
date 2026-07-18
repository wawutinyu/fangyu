/** 原料货架 — 工具/技能/MCP 勾选 + harness trace */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  fetchHarnessTraces,
  fetchMaterialsCatalog,
  fetchMaterialsDraft,
  saveMaterialsSelection,
  type HarnessTrace,
  type MaterialsCatalog,
  type MaterialsDoc,
} from '../utils/materialsApi'

interface MaterialsShelfProps {
  headerless?: boolean
}

function codingToolIds(mat: MaterialsDoc): string[] {
  return (mat.tools || [])
    .filter(t => (t.belts || []).includes('coding') || t.id === 'task')
    .map(t => t.id)
    .filter(Boolean)
}

function activeSkillIds(mat: MaterialsDoc): string[] {
  return (mat.skills || [])
    .filter(s => s.status === 'active')
    .map(s => s.id)
    .filter(Boolean)
}

function mcpToolIds(mat: MaterialsDoc): string[] {
  const row = (mat.mcp || []).find(m => m.id === '__internal__')
  return row?.tools || []
}

export default function MaterialsShelf({ headerless }: MaterialsShelfProps) {
  const [catalog, setCatalog] = useState<MaterialsCatalog | null>(null)
  const [materials, setMaterials] = useState<MaterialsDoc | null>(null)
  const [source, setSource] = useState('default')
  const [coding, setCoding] = useState<Set<string>>(new Set())
  const [skills, setSkills] = useState<Set<string>>(new Set())
  const [mcp, setMcp] = useState<Set<string>>(new Set())
  const [shellPolicy, setShellPolicy] = useState('ask')
  const [agentMode, setAgentMode] = useState('build')
  const [bundleDir, setBundleDir] = useState('')
  const [traces, setTraces] = useState<HarnessTrace[]>([])
  const [tracePath, setTracePath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'shelf' | 'traces'>('shelf')

  const allToolIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of catalog?.materials.tools || []) {
      if (t.id) ids.add(t.id)
    }
    for (const t of materials?.tools || []) {
      if (t.id) ids.add(t.id)
    }
    return [...ids].sort()
  }, [catalog, materials])

  const skillOptions = useMemo(() => {
    const fromFiles = catalog?.skill_files || []
    const fromMat = (materials?.skills || []).map(s => ({
      id: s.id,
      description: s.note || '',
      when: '',
      has_body: true,
    }))
    const byId = new Map<string, { id: string; description: string; when: string; has_body: boolean }>()
    for (const s of [...fromMat, ...fromFiles]) {
      if (s.id) byId.set(s.id, s as { id: string; description: string; when: string; has_body: boolean })
    }
    return [...byId.values()]
  }, [catalog, materials])

  const mcpOptions = catalog?.mcp_internal_tools || []

  const applyMat = (mat: MaterialsDoc, src: string) => {
    setMaterials(mat)
    setSource(src)
    setCoding(new Set(codingToolIds(mat)))
    setSkills(new Set(activeSkillIds(mat)))
    setMcp(new Set(mcpToolIds(mat)))
    setShellPolicy(String(mat.policies?.shell || 'ask'))
    setAgentMode(String(mat.policies?.default_agent_mode || 'build'))
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cat, draft, tr] = await Promise.all([
        fetchMaterialsCatalog(),
        fetchMaterialsDraft(),
        fetchHarnessTraces({
          bundle_dir: bundleDir.trim() || undefined,
          limit: 30,
        }),
      ])
      setCatalog(cat)
      applyMat(draft.materials, draft.source)
      setTraces(tr.traces)
      setTracePath(tr.path)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }, [bundleDir])

  useEffect(() => {
    reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }

  const onSave = async (target: 'draft' | 'bundle') => {
    if (target === 'bundle' && !bundleDir.trim()) {
      setError('写入 Bundle 需填写目录路径')
      return
    }
    setLoading(true)
    setError(null)
    setMsg(null)
    try {
      const out = await saveMaterialsSelection({
        coding_tools: [...coding],
        active_skills: [...skills],
        mcp_internal_tools: [...mcp],
        shell_policy: shellPolicy,
        default_agent_mode: agentMode,
        target,
        bundle_dir: bundleDir.trim(),
      })
      applyMat(out.materials, target)
      setMsg(target === 'draft' ? '已保存平台草稿' : '已写入 Bundle materials + toolbelt')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  const sectionTitle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    margin: '12px 0 6px',
    letterSpacing: 0.3,
  }
  const chipRow: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  }
  const chip = (on: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 11,
    borderRadius: 6,
    border: `1px solid ${on ? 'var(--text-primary)' : 'var(--border-color)'}`,
    background: on ? 'var(--bg-hover)' : 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!headerless && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)', fontSize: 13, fontWeight: 600 }}>
          原料货架
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border-light)', alignItems: 'center' }}>
        <button type="button" onClick={() => setTab('shelf')} style={{ fontSize: 12, fontWeight: tab === 'shelf' ? 600 : 400, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)' }}>
          货架
        </button>
        <button type="button" onClick={() => setTab('traces')} style={{ fontSize: 12, fontWeight: tab === 'traces' ? 600 : 400, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)' }}>
          Trace
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>来源 · {source}</span>
        <button type="button" onClick={reload} disabled={loading} style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}>
          刷新
        </button>
      </div>

      {error && (
        <div style={{ padding: '6px 12px', fontSize: 12, color: '#c0392b' }}>{error}</div>
      )}
      {msg && (
        <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{msg}</div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px 16px' }}>
        {tab === 'shelf' && (
          <>
            <div style={sectionTitle}>Coding 工具带</div>
            <div style={chipRow}>
              {allToolIds.map(id => {
                const on = coding.has(id)
                const locked = id === 'task'
                return (
                  <label key={id} style={chip(on || locked)}>
                    <input
                      type="checkbox"
                      checked={on || locked}
                      disabled={locked}
                      onChange={e => setCoding(toggle(coding, id, e.target.checked))}
                    />
                    {id}
                  </label>
                )
              })}
            </div>

            <div style={sectionTitle}>技能（active）</div>
            <div style={chipRow}>
              {skillOptions.map(s => {
                const on = skills.has(s.id)
                return (
                  <label key={s.id} style={chip(on)} title={s.description || s.when}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={e => setSkills(toggle(skills, s.id, e.target.checked))}
                    />
                    {s.id}
                  </label>
                )
              })}
              {!skillOptions.length && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>暂无技能文件</span>
              )}
            </div>

            <div style={sectionTitle}>MCP · __internal__</div>
            <div style={chipRow}>
              {mcpOptions.map(id => {
                const on = mcp.has(id)
                return (
                  <label key={id} style={chip(on)}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={e => setMcp(toggle(mcp, id, e.target.checked))}
                    />
                    {id}
                  </label>
                )
              })}
              {!mcpOptions.length && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>无内部 MCP 工具</span>
              )}
            </div>

            <div style={sectionTitle}>策略</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              <label>
                shell{' '}
                <select value={shellPolicy} onChange={e => setShellPolicy(e.target.value)}>
                  <option value="ask">ask</option>
                  <option value="allow">allow</option>
                  <option value="deny">deny</option>
                </select>
              </label>
              <label>
                agent_mode{' '}
                <select value={agentMode} onChange={e => setAgentMode(e.target.value)}>
                  <option value="build">build</option>
                  <option value="plan">plan</option>
                </select>
              </label>
            </div>

            <div style={sectionTitle}>角色（只读）</div>
            <div style={chipRow}>
              {(materials?.roles || catalog?.materials.roles || []).map(r => (
                <span key={r.id} style={{ ...chip(false), cursor: 'default' }} title={(r.tools || []).join(', ')}>
                  {r.id}
                </span>
              ))}
            </div>

            <div style={{ ...sectionTitle, marginTop: 16 }}>落盘目标</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={bundleDir}
                onChange={e => setBundleDir(e.target.value)}
                placeholder="Bundle 目录（可选）"
                style={{ flex: 1, minWidth: 180, fontSize: 12, padding: '6px 8px' }}
              />
              <button type="button" disabled={loading} onClick={() => onSave('draft')} style={{ fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>
                存草稿
              </button>
              <button type="button" disabled={loading} onClick={() => onSave('bundle')} style={{ fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>
                写入 Bundle
              </button>
            </div>
          </>
        )}

        {tab === 'traces' && (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              {tracePath || '尚无 trace 文件（跑过带 workspace 的 agent-loop 后会出现）'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {traces.map((t, i) => (
                <div
                  key={`${t.ts}-${i}`}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: t.success === false ? '#c0392b' : t.success ? '#1a7f37' : 'var(--text-secondary)' }}>
                      {t.kind || 'trace'}{t.success === true ? ' · ok' : t.success === false ? ' · fail' : ''}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {[t.agent_mode, t.subagent_type, t.turns != null ? `${t.turns} turns` : null, t.task_depth != null ? `depth ${t.task_depth}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {t.ts && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {new Date(t.ts * 1000).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div style={{ marginBottom: 4 }}>{t.goal || (t.task_ids ? `parallel ×${t.count}` : '(无 goal)')}</div>
                  {!!t.tools_used?.length && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                      tools: {t.tools_used.join(', ')}
                    </div>
                  )}
                  {t.error && (
                    <div style={{ color: '#c0392b', fontSize: 11, marginTop: 4 }}>{t.error}</div>
                  )}
                </div>
              ))}
              {!traces.length && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无记录</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
