import { useMemo } from 'react'
import { store } from '../store'
import { useAppSelector } from '../store/hooks'
import { switchProject, toggleHistory, saveFlowApi, deleteSaveApi, createProjectApi } from '../store/saveSlice'
import { newFlow } from '../store/flowSlice'
import { convertToExportFormat } from '../utils/flowHelper'
import { getReactFlowInstance } from './FlowCanvas'

interface SaveHistoryProps {
  onRestore: (data: unknown) => void
}

export default function SaveHistory({ onRestore }: SaveHistoryProps) {
  const { projects, currentProjectId, historyVisible } = useAppSelector(s => s.saves)
  const currentProject = useMemo(() => projects.find(p => p.id === currentProjectId), [projects, currentProjectId])

  const savesByDate = useMemo(() => {
    if (!currentProject) return []
    const map: Record<string, typeof currentProject.saves> = {}
    for (const s of currentProject.saves) {
      const date = new Date(s.time).toLocaleDateString('zh-CN')
      if (!map[date]) map[date] = []
      map[date].push(s)
    }
    return Object.entries(map).map(([date, items]) => ({ date, items }))
  }, [currentProject])

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

  const handleNewProject = () => {
    const name = window.prompt('输入项目名称：', `项目 ${projects.length + 1}`)
    if (!name?.trim()) return
    createProjectApi(name.trim(), store.dispatch)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) store.dispatch(toggleHistory()) }}>
      <div style={{ width: 340, height: '100%', background: 'var(--bg-primary)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>项目与保存历史</span>
          <button style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)' }}
            onClick={() => store.dispatch(toggleHistory())}
          ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
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
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>保存历史</span>
            <button className="notion-btn" style={{ fontSize: 11, padding: '2px 8px', background: '#37352f', color: '#fff', borderColor: '#37352f', fontWeight: 500 }}
              onClick={handleSaveNow}>保存当前</button>
          </div>
          {!currentProject && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '30px 0' }}>请先创建一个项目</div>}
          {currentProject && savesByDate.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '30px 0' }}>暂无保存记录</div>}
          {savesByDate.map(g => (
            <div key={g.date} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>{g.date}</div>
              {g.items.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 8, borderRadius: 6, marginBottom: 4 }}>
                  <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => handleRestoreSave(s.data)}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(s.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
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
