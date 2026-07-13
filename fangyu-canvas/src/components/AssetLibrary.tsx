import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  assetTypeLabel,
  createAsset,
  deleteAsset,
  fetchAssetPayload,
  fetchAssetSkillFlow,
  fetchAssets,
  isFlowAsset,
  isAgentTopology,
  type AssetMeta,
} from '../utils/assetApi'
import { convertToExportFormat } from '../utils/flowHelper'
import { getReactFlowInstance } from './FlowCanvas'

interface Props {
  onLoadFlow: (data: unknown) => void
  onLoadAgents?: (data: { nodes: unknown[]; edges: unknown[] }) => void
  onBindAgentSkill?: (skillFlow: { nodes: unknown[]; edges: unknown[] }) => void
  agentBindMode?: boolean
}

/** 可打开到画布的类型；引用类默认藏起来 */
const CANVAS_TYPES = new Set(['flow_template', 'subflow', 'agent_topology'])

type BrowseTab = 'usable' | 'mine' | 'refs'

const BROWSE_TABS: Array<{ id: BrowseTab; label: string; hint: string }> = [
  { id: 'usable', label: '可用', hint: '可加载到画布的模板与 Agent' },
  { id: 'mine', label: '我的', hint: '用户保存的资产' },
  { id: 'refs', label: '引用', hint: '工具 / 技能 / 知识库索引' },
]

export default function AssetLibrary({ onLoadFlow, onLoadAgents, onBindAgentSkill, agentBindMode }: Props) {
  const [assets, setAssets] = useState<AssetMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<BrowseTab>(agentBindMode ? 'usable' : 'usable')
  const [query, setQuery] = useState('')
  const [queryDebounced, setQueryDebounced] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('我的流程模板')
  const [saveDesc, setSaveDesc] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setQueryDebounced(query.trim()), 220)
    return () => window.clearTimeout(t)
  }, [query])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await fetchAssets({
        q: queryDebounced || undefined,
        // 可用/我的：不拉联邦 tool/skill，避免列表被淹没
        includeFederated: tab === 'refs',
        scope: tab === 'mine' ? 'user' : undefined,
      })
      setAssets(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [queryDebounced, tab])

  useEffect(() => { reload() }, [reload])

  const visible = useMemo(() => {
    let list = assets
    if (tab === 'usable') {
      list = list.filter(a => CANVAS_TYPES.has(a.type) || (agentBindMode && isFlowAsset(a.type)))
    } else if (tab === 'mine') {
      list = list.filter(a => a.scope === 'user' && !a.federated)
    } else {
      list = list.filter(a => !CANVAS_TYPES.has(a.type) || a.federated)
    }
    if (agentBindMode) {
      list = list.filter(a => isFlowAsset(a.type))
    }
    return list
  }, [assets, tab, agentBindMode])

  const grouped = useMemo(() => {
    const map = new Map<string, AssetMeta[]>()
    for (const a of visible) {
      let key: string
      if (isAgentTopology(a.type)) key = '种子 Agent'
      else if (isFlowAsset(a.type)) key = a.scope === 'official' ? '官方流程' : '我的流程'
      else key = assetTypeLabel(a.type)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    const order = ['种子 Agent', '官方流程', '我的流程']
    return Array.from(map.entries()).sort((a, b) => {
      const ia = order.indexOf(a[0])
      const ib = order.indexOf(b[0])
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0])
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  }, [visible])

  const handleLoadToCanvas = async (asset: AssetMeta) => {
    setBusyId(asset.id)
    try {
      const payload = await fetchAssetPayload(asset.id)
      if (isAgentTopology(asset.type)) {
        const topo = payload as { nodes?: unknown[]; edges?: unknown[] }
        if (!topo.nodes?.length) {
          setError('Agent 拓扑为空')
          return
        }
        if (!onLoadAgents) {
          setError('当前无法打开 Agent 画布')
          return
        }
        onLoadAgents({ nodes: topo.nodes, edges: topo.edges || [] })
        return
      }
      if (!isFlowAsset(asset.type)) {
        setError(`「${asset.name}」是${assetTypeLabel(asset.type)}，在「引用」里仅作索引，不能加载到画布`)
        return
      }
      onLoadFlow(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const handleBindAgent = async (asset: AssetMeta) => {
    if (!onBindAgentSkill) return
    setBusyId(asset.id)
    try {
      const flow = await fetchAssetSkillFlow(asset.id)
      onBindAgentSkill(flow)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const handleSaveCurrentAsAsset = async () => {
    const instance = getReactFlowInstance()
    if (!instance) return
    const nodes = instance.getNodes()
    const edges = instance.getEdges()
    if (!nodes.length) {
      setError('画布为空，先拖几个节点再保存')
      return
    }
    if (!saveName.trim()) {
      setError('请填写资产名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = convertToExportFormat(nodes, edges)
      await createAsset({
        type: 'flow_template',
        name: saveName.trim(),
        description: saveDesc.trim(),
        category: '流程控制',
        tags: ['用户创建'],
        payload: payload as unknown as Record<string, unknown>,
      })
      setSaveOpen(false)
      setSaveName('我的流程模板')
      setSaveDesc('')
      setTab('mine')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (asset: AssetMeta) => {
    if (asset.scope === 'official' || asset.federated) return
    if (!confirm(`删除「${asset.name}」？`)) return
    try {
      await deleteAsset(asset.id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13, minHeight: 0 }}>
      {/* 顶栏：浏览维度 + 搜索 + 存 */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}>
        {agentBindMode ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            选择流程绑定到技能
          </span>
        ) : (
          <div style={{
            display: 'flex', gap: 2, padding: 2, borderRadius: 8,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
          }}>
            {BROWSE_TABS.map(t => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.hint}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '4px 10px', border: 'none', borderRadius: 6, fontSize: 12,
                    fontWeight: active ? 600 : 450, cursor: 'pointer',
                    background: active ? 'var(--bg-primary)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        <input
          className="notion-input"
          placeholder="搜索名称、描述…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 140, maxWidth: 280 }}
        />

        {!agentBindMode && (
          <button
            type="button"
            className="notion-btn primary"
            onClick={() => setSaveOpen(v => !v)}
            title="把当前 Flow 画布存为我的资产"
          >
            {saveOpen ? '取消' : '存为资产'}
          </button>
        )}
        <button type="button" className="notion-btn" onClick={reload} title="刷新列表">刷新</button>
      </div>

      {saveOpen && !agentBindMode && (
        <div style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        }}>
          <input
            className="notion-input"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="名称"
            style={{ width: 180 }}
          />
          <input
            className="notion-input"
            value={saveDesc}
            onChange={e => setSaveDesc(e.target.value)}
            placeholder="描述（可选）"
            style={{ flex: 1, minWidth: 160 }}
          />
          <button
            type="button"
            className="notion-btn primary"
            disabled={saving}
            onClick={handleSaveCurrentAsAsset}
          >
            {saving ? '保存中…' : '确认保存'}
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px', minHeight: 0 }}>
        {loading && <div style={{ color: 'var(--text-muted)', padding: 8 }}>加载中…</div>}
        {error && (
          <div style={{
            color: '#b42318', background: 'rgba(180,35,24,0.06)',
            border: '1px solid rgba(180,35,24,0.2)', borderRadius: 8,
            padding: '8px 10px', marginBottom: 10, fontSize: 12,
          }}>
            {error}
            <button
              type="button"
              onClick={() => setError('')}
              style={{ marginLeft: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 12 }}
            >
              关闭
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <EmptyState tab={tab} agentBindMode={agentBindMode} onSave={() => setSaveOpen(true)} />
        )}

        {grouped.map(([group, items]) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              marginBottom: 6, letterSpacing: '0.3px',
            }}>
              {group}
              <span style={{ fontWeight: 500, marginLeft: 6 }}>{items.length}</span>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              {items.map(asset => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  agentBindMode={agentBindMode}
                  busy={busyId === asset.id}
                  onLoad={() => handleLoadToCanvas(asset)}
                  onBind={() => handleBindAgent(asset)}
                  onDelete={() => handleDelete(asset)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({
  tab,
  agentBindMode,
  onSave,
}: {
  tab: BrowseTab
  agentBindMode?: boolean
  onSave: () => void
}) {
  if (agentBindMode) {
    return <div style={{ color: 'var(--text-muted)', padding: 8 }}>没有可绑定的流程资产。</div>
  }
  if (tab === 'mine') {
    return (
      <div style={{ color: 'var(--text-muted)', padding: 8, lineHeight: 1.5 }}>
        还没有自己的资产。
        <button type="button" className="notion-btn" style={{ marginLeft: 8 }} onClick={onSave}>
          存当前画布
        </button>
      </div>
    )
  }
  if (tab === 'refs') {
    return <div style={{ color: 'var(--text-muted)', padding: 8 }}>暂无工具 / 技能引用。</div>
  }
  return (
    <div style={{ color: 'var(--text-muted)', padding: 8 }}>
      暂无可用模板。可在「创建 → 场景模板」生成，或把画布存为资产。
    </div>
  )
}

function AssetRow({
  asset,
  agentBindMode,
  busy,
  onLoad,
  onBind,
  onDelete,
}: {
  asset: AssetMeta
  agentBindMode?: boolean
  busy?: boolean
  onLoad: () => void
  onBind: () => void
  onDelete: () => void
}) {
  const canFlow = isFlowAsset(asset.type)
  const canAgent = isAgentTopology(asset.type)
  const actionable = canFlow || canAgent
  const primaryLabel = agentBindMode && canFlow
    ? '绑定'
    : canAgent
      ? '打开 Agent'
      : canFlow
        ? '打开'
        : '仅索引'

  const onPrimary = () => {
    if (agentBindMode && canFlow) onBind()
    else if (actionable) onLoad()
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-primary)',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        background: canAgent ? 'rgba(22,163,74,0.12)' : canFlow ? 'var(--bg-secondary)' : 'var(--bg-hover)',
        color: canAgent ? '#15803d' : 'var(--text-secondary)',
      }}>
        {canAgent ? 'A' : canFlow ? 'F' : '·'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.name}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
            {assetTypeLabel(asset.type)}
            {asset.scope === 'official' ? ' · 官方' : ''}
          </span>
        </div>
        {asset.description && (
          <div style={{
            fontSize: 11, color: 'var(--text-secondary)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {asset.description}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {actionable || (agentBindMode && canFlow) ? (
          <button
            type="button"
            className="notion-btn primary"
            style={{ fontSize: 11, padding: '3px 10px' }}
            disabled={busy}
            onClick={onPrimary}
          >
            {busy ? '…' : primaryLabel}
          </button>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 4px' }}>不可加载</span>
        )}
        {asset.scope === 'user' && !asset.federated && (
          <button
            type="button"
            className="notion-btn"
            style={{ fontSize: 11, padding: '3px 8px', color: '#b42318' }}
            onClick={onDelete}
          >
            删
          </button>
        )}
      </div>
    </div>
  )
}
