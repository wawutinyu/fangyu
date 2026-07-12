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
  promoteSaveToAsset,
  type AssetMeta,
  type AssetScope,
  type AssetType,
} from '../utils/assetApi'
import { convertToExportFormat } from '../utils/flowHelper'
import { getReactFlowInstance } from './FlowCanvas'

interface Props {
  onLoadFlow: (data: unknown) => void
  onLoadAgents?: (data: { nodes: unknown[]; edges: unknown[] }) => void
  onBindAgentSkill?: (skillFlow: { nodes: unknown[]; edges: unknown[] }) => void
  agentBindMode?: boolean
}

const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部类型' },
  { value: 'flow_template', label: '流程模板' },
  { value: 'agent_topology', label: 'Agent 拓扑' },
  { value: 'subflow', label: '子流程' },
  { value: 'skill_ref', label: '技能' },
  { value: 'tool_ref', label: '工具' },
  { value: 'knowledge_ref', label: '知识库' },
]

const SCOPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部来源' },
  { value: 'official', label: '官方内置' },
  { value: 'user', label: '我的资产' },
]

export default function AssetLibrary({ onLoadFlow, onLoadAgents, onBindAgentSkill, agentBindMode }: Props) {
  const [assets, setAssets] = useState<AssetMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [scopeFilter, setScopeFilter] = useState('')
  const [query, setQuery] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await fetchAssets({
        type: typeFilter || undefined,
        scope: scopeFilter || undefined,
        q: query.trim() || undefined,
      })
      setAssets(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [typeFilter, scopeFilter, query])

  useEffect(() => { reload() }, [reload])

  const grouped = useMemo(() => {
    const map = new Map<string, AssetMeta[]>()
    for (const a of assets) {
      const key = a.scope === 'official' ? `官方 · ${a.category || assetTypeLabel(a.type)}` : `我的 · ${assetTypeLabel(a.type)}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return Array.from(map.entries())
  }, [assets])

  const handleLoadToCanvas = async (asset: AssetMeta) => {
    try {
      const payload = await fetchAssetPayload(asset.id)
      if (isAgentTopology(asset.type)) {
        const topo = payload as { nodes?: unknown[]; edges?: unknown[] }
        if (!topo.nodes?.length) {
          alert('Agent 拓扑为空')
          return
        }
        if (!onLoadAgents) {
          alert('请切换到 Agent 编排视图后从资产库加载')
          return
        }
        if (!confirm(`加载种子 Agent「${asset.name}」到 Agent 画布？`)) return
        onLoadAgents({ nodes: topo.nodes, edges: topo.edges || [] })
        return
      }
      if (!isFlowAsset(asset.type)) {
        alert(`「${asset.name}」是${assetTypeLabel(asset.type)}，请在对应面板查看详情。`)
        return
      }
      onLoadFlow(payload)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleBindAgent = async (asset: AssetMeta) => {
    if (!onBindAgentSkill) return
    try {
      const flow = await fetchAssetSkillFlow(asset.id)
      onBindAgentSkill(flow)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleSaveCurrentAsAsset = async () => {
    const instance = getReactFlowInstance()
    if (!instance) return
    const nodes = instance.getNodes()
    const edges = instance.getEdges()
    if (!nodes.length) { alert('画布为空'); return }
    const name = window.prompt('资产名称', '我的流程模板')
    if (!name?.trim()) return
    const desc = window.prompt('描述（可选）', '') || ''
    const category = window.prompt('分类', '流程控制') || '流程控制'
    const payload = convertToExportFormat(nodes, edges)
    try {
      await createAsset({
        type: 'flow_template',
        name: name.trim(),
        description: desc,
        category,
        tags: ['用户创建'],
        payload: payload as unknown as Record<string, unknown>,
      })
      await reload()
      alert('已保存到资产库')
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async (asset: AssetMeta) => {
    if (asset.scope === 'official' || asset.federated) return
    if (!confirm(`删除资产「${asset.name}」？`)) return
    try {
      await deleteAsset(asset.id)
      await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {agentBindMode && (
          <span style={{ fontSize: 12, color: '#722ed1', fontWeight: 600 }}>选择流程绑定到 Agent 技能</span>
        )}
        <input
          className="notion-input"
          placeholder="搜索资产..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <select className="notion-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {TYPE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select className="notion-input" value={scopeFilter} onChange={e => setScopeFilter(e.target.value)}>
          {SCOPE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {!agentBindMode && (
          <button className="notion-btn primary" onClick={handleSaveCurrentAsAsset}>存当前画布为资产</button>
        )}
        <button className="notion-btn" onClick={reload}>刷新</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {loading && <div style={{ color: 'var(--text-muted)' }}>加载中...</div>}
        {error && <div style={{ color: '#cf1322' }}>{error}</div>}
        {!loading && !error && assets.length === 0 && (
          <div style={{ color: 'var(--text-muted)' }}>暂无资产。可保存流程，或使用官方种子 Agent。</div>
        )}

        {grouped.map(([group, items]) => (
          <div key={group} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{group} ({items.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {items.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  agentBindMode={agentBindMode}
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

function AssetCard({
  asset,
  agentBindMode,
  onLoad,
  onBind,
  onDelete,
}: {
  asset: AssetMeta
  agentBindMode?: boolean
  onLoad: () => void
  onBind: () => void
  onDelete: () => void
}) {
  const canFlow = isFlowAsset(asset.type)
  const canAgent = isAgentTopology(asset.type)
  return (
    <div style={{
      border: '1px solid var(--border-color)', borderRadius: 8, padding: 10,
      background: asset.scope === 'official' ? 'var(--bg-secondary)' : 'var(--bg-primary)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{asset.name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{assetTypeLabel(asset.type)}</span>
      </div>
      {asset.description && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>{asset.description}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {(asset.tags || []).slice(0, 4).map(t => (
          <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>{t}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {agentBindMode && canFlow && (
          <button className="notion-btn primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={onBind}>绑定到技能</button>
        )}
        {!agentBindMode && canFlow && (
          <button className="notion-btn primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={onLoad}>加载到 Flow 画布</button>
        )}
        {!agentBindMode && canAgent && (
          <button className="notion-btn primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={onLoad}>加载到 Agent 画布</button>
        )}
        {asset.scope === 'user' && !asset.federated && (
          <button className="notion-btn" style={{ fontSize: 11, padding: '2px 8px', color: '#cf1322' }} onClick={onDelete}>删除</button>
        )}
      </div>
    </div>
  )
}

export { promoteSaveToAsset }
