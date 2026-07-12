import { useMemo, useState } from 'react'
import { store } from '../store'
import { useAppSelector } from '../store/hooks'
import { switchProject, toggleHistory, saveFlowApi, deleteSaveApi, createProjectApi } from '../store/saveSlice'
import { newFlow } from '../store/flowSlice'
import { convertToExportFormat } from '../utils/flowHelper'
import { getReactFlowInstance } from './FlowCanvas'
import { promoteSaveToAsset } from '../utils/assetApi'

import type { ExportFormat } from '@fangyu/core/schema'
import { dispatchFlowSnapshot } from '../utils/workerDispatch'
import { pollTaskUntilDone } from '../utils/workerApi'

interface SaveHistoryProps {
  onRestore: (data: unknown) => void
  selectedWorkerId?: string | null
  onDispatchTask?: (taskId: string) => void
}

export default function SaveHistory({ onRestore, selectedWorkerId, onDispatchTask }: SaveHistoryProps) {
  const { projects, currentProjectId, historyVisible } = useAppSelector(s => s.saves)
  const currentProject = useMemo(() => projects.find(p => p.id === currentProjectId), [projects, currentProjectId])
  const [diffIds, setDiffIds] = useState<string[]>([])
  const [versionFilter, setVersionFilter] = useState<'all' | 'publish' | 'manual'>('all')

  const isPublishSave = (name: string) => name.startsWith('发布 ')

  const savesByDate = useMemo(() => {
    if (!currentProject) return []
    const filtered = currentProject.saves.filter(s => {
      if (versionFilter === 'publish') return isPublishSave(s.name)
      if (versionFilter === 'manual') return !isPublishSave(s.name)
      return true
    })
    const map: Record<string, typeof currentProject.saves> = {}
    for (const s of filtered) {
      const date = new Date(s.time).toLocaleDateString('zh-CN')
      if (!map[date]) map[date] = []
      map[date].push(s)
    }
    return Object.entries(map).map(([date, items]) => ({ date, items }))
  }, [currentProject, versionFilter])

  const toggleDiff = (id: string) => {
    setDiffIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : (prev.length < 2 ? [...prev, id] : [id])
    )
  }

  const diffResult = useMemo(() => {
    if (diffIds.length < 2 || !currentProject) return null
    const a = currentProject.saves.find(s => s.id === diffIds[0])
    const b = currentProject.saves.find(s => s.id === diffIds[1])
    if (!a || !b) return null
    const aNodes = new Set(((a.data as any)?.nodes || []).map((n: any) => n.id))
    const bNodes = new Set(((b.data as any)?.nodes || []).map((n: any) => n.id))
    const added = ((b.data as any)?.nodes || []).filter((n: any) => !aNodes.has(n.id))
    const removed = ((a.data as any)?.nodes || []).filter((n: any) => !bNodes.has(n.id))
    const common = ((a.data as any)?.nodes || []).filter((n: any) => bNodes.has(n.id))
    return { aName: a.name, bName: b.name, added, removed, totalA: aNodes.size, totalB: bNodes.size, common: common.length }
  }, [diffIds, currentProject])

  if (!historyVisible) return null

  const handleSwitchProject = (id: string) => {
    if (id === currentProjectId) return
    store.dispatch(switchProject(id))
    const p = projects.find(p => p.id === id)
    if (p && p.saves[0]) onRestore(p.saves[0].data)
    else store.dispatch(newFlow())
  }

  const handleSaveNow = async () => {
    const name = window.prompt('输入保存名称：', `保存 ${(currentProject?.saves.length || 0) + 1}`)
    if (!name?.trim()) return
    const instance = getReactFlowInstance()
    if (!instance) return
    const nodes = instance.getNodes()
    const edges = instance.getEdges()
    if (nodes.length === 0) { alert('画布为空'); return }
    const data = convertToExportFormat(nodes, edges)
    if (currentProject) await saveFlowApi(currentProject.id, name.trim(), data as unknown as Record<string, unknown>, store.dispatch)
  }

  const handleRestoreSave = (saveData: unknown) => {
    if (!confirm('确定恢复到此版本吗？')) return
    onRestore(saveData)
  }

  const handleDelete = (saveId: string) => {
    if (!confirm('删除此保存？')) return
    deleteSaveApi(saveId, store.dispatch)
  }

  const handleDispatchSave = async (save: { id: string; name: string; data: Record<string, unknown> }) => {
    try {
      const result = await dispatchFlowSnapshot({
        exportData: save.data as unknown as ExportFormat,
        snapshotName: save.name,
        snapshotId: save.id,
        workerId: selectedWorkerId,
      })
      onDispatchTask?.(result.task_id)
      void pollTaskUntilDone(result.task_id).then((task) => {
        onDispatchTask?.(task.id)
        if (task.status === 'failed') {
          window.alert(`任务失败：${task.error ?? '未知错误'}`)
        }
      }).catch(() => { /* ignore timeout */ })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }

  const handlePromoteToAsset = async (save: { id: string; name: string; data: Record<string, unknown> }) => {
    try {
      await promoteSaveToAsset({
        save_id: save.id,
        name: save.name,
        description: `来自项目保存：${currentProject?.name || ''}`,
        category: '流程控制',
        tags: ['用户保存'],
        payload: save.data,
      })
      alert(`「${save.name}」已加入资产库，可在 Agent 编排中绑定使用`)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleNewProject = () => {
    const name = window.prompt('输入项目名称：', `项目 ${projects.length + 1}`)
    if (!name?.trim()) return
    createProjectApi(name.trim(), store.dispatch)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) store.dispatch(toggleHistory()) }}>
      <div style={{ width: 380, height: '100%', background: 'var(--bg-primary)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>项目与保存历史</span>
          <button style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)' }}
            onClick={() => store.dispatch(toggleHistory())}
          ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        {diffResult && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', background: '#f9f9ff', fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>版本对比</div>
            <div style={{ color: '#888', marginBottom: 4 }}>
              {diffResult.aName} → {diffResult.bName}
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
              <span style={{ color: '#52c41a' }}>+{diffResult.added.length} 新增</span>
              <span style={{ color: '#ff4d4f' }}>-{diffResult.removed.length} 删除</span>
              <span style={{ color: '#888' }}>={diffResult.common} 不变</span>
            </div>
            {diffResult.added.length > 0 && (
              <div style={{ marginBottom: 4 }}><span style={{ color: '#52c41a' }}>新增:</span> {diffResult.added.map((n: any) => n.name || n.id).join(', ')}</div>
            )}
            {diffResult.removed.length > 0 && (
              <div><span style={{ color: '#ff4d4f' }}>删除:</span> {diffResult.removed.map((n: any) => n.name || n.id).join(', ')}</div>
            )}
            <button style={{ marginTop: 6, fontSize: 11, color: '#666', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setDiffIds([])}>关闭对比</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>项目</span>
            <button style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={handleNewProject}>+ 新建</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {projects.map(p => (
              <div key={p.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13, background: p.id === currentProjectId ? '#f0f0ee' : undefined }}
                onClick={() => handleSwitchProject(p.id)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.saves.length}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>版本历史</span>
            <button className="notion-btn" style={{ fontSize: 11, padding: '2px 8px', background: '#37352f', color: '#fff', borderColor: '#37352f', fontWeight: 500 }}
              onClick={handleSaveNow}>保存当前</button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {([
              ['all', '全部'],
              ['publish', '发布'],
              ['manual', '手动'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setVersionFilter(key)}
                style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 999,
                  border: '1px solid var(--border-color)',
                  background: versionFilter === key ? 'var(--bg-secondary)' : 'transparent',
                  cursor: 'pointer',
                  color: versionFilter === key ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {diffIds.length > 0 && <div style={{ fontSize: 11, color: '#722ed1', marginBottom: 4 }}>选择两个版本进行对比（已选 {diffIds.length}/2）</div>}
          {!currentProject && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '30px 0' }}>请先创建一个项目</div>}
          {currentProject && savesByDate.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '30px 0' }}>暂无保存记录</div>}
          {savesByDate.map(g => (
            <div key={g.date} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>{g.date}</div>
              {g.items.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 8, borderRadius: 6, marginBottom: 4 }}>
                  <input type="checkbox" checked={diffIds.includes(s.id)} onChange={() => toggleDiff(s.id)}
                    style={{ cursor: 'pointer' }} />
                  <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => handleRestoreSave(s.data)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                      {isPublishSave(s.name) && (
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 999, flexShrink: 0,
                          background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb',
                        }}>发布</span>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(s.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <button
                    style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)' }}
                    title="回滚到此版本"
                    onClick={() => handleRestoreSave(s.data)}
                  >
                    回滚
                  </button>
                  <button
                    style={{ fontSize: 10, padding: '2px 6px', border: '1px solid rgba(37,99,235,0.35)', borderRadius: 4, background: 'rgba(37,99,235,0.08)', cursor: 'pointer', color: '#2563eb' }}
                    title="将此版本快照派发到行"
                    onClick={() => void handleDispatchSave(s as { id: string; name: string; data: Record<string, unknown> })}
                  >
                    派发行
                  </button>
                  <button style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: '#1890ff', borderRadius: 4, fontSize: 10 }}
                    title="存为资产"
                    onClick={() => handlePromoteToAsset(s as { id: string; name: string; data: Record<string, unknown> })}
                  >资产</button>
                  <button style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 4 }}
                    onClick={() => handleDelete(s.id)}
                  ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
