import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Schedule { id: string; name: string; cron_expr: string; enabled: boolean; created_at: number }
interface Webhook { id: string; name: string; enabled: boolean; secret: string; created_at: number }

export default function TriggerPanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [newSchedName, setNewSchedName] = useState('')
  const [newCron, setNewCron] = useState('')
  const [newWhName, setNewWhName] = useState('')
  const [showNewSched, setShowNewSched] = useState(false)
  const [showNewWh, setShowNewWh] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [sRes, wRes] = await Promise.all([
        fetch('/api/v1/trigger/schedules'),
        fetch('/api/v1/trigger/webhooks'),
      ])
      if (sRes.ok) setSchedules(await sRes.json())
      if (wRes.ok) setWebhooks(await wRes.json())
    } catch {}
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const delSchedule = async (id: string) => {
    await fetch(`/api/v1/trigger/schedules/${id}`, { method: 'DELETE' })
    setSchedules(prev => prev.filter(s => s.id !== id))
  }
  const delWebhook = async (id: string) => {
    await fetch(`/api/v1/trigger/webhooks/${id}`, { method: 'DELETE' })
    setWebhooks(prev => prev.filter(w => w.id !== id))
  }
  const createSchedule = async () => {
    if (!newSchedName || !newCron) return
    const flowConfig = { nodes: [], edges: [] }
    const res = await fetch('/api/v1/trigger/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSchedName, cron_expr: newCron, flow_config: flowConfig }),
    })
    if (res.ok) { fetchData(); setNewSchedName(''); setNewCron(''); setShowNewSched(false) }
  }
  const createWebhook = async () => {
    if (!newWhName) return
    const flowConfig = { nodes: [], edges: [] }
    const res = await fetch('/api/v1/trigger/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newWhName, flow_config: flowConfig }),
    })
    if (res.ok) { fetchData(); setNewWhName(''); setShowNewWh(false) }
  }

  const copySecret = (secret: string) => navigator.clipboard.writeText(secret)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontSize: 12, padding: '8px 12px', overflow: 'auto' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>定时调度</div>
      {schedules.length === 0 && <div style={{ color: '#999', marginBottom: 8 }}>暂无定时任务</div>}
      {schedules.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #eee', borderRadius: 6, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>{s.name}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#888' }}>{s.cron_expr}</span>
          <span style={{ color: s.enabled ? '#52c41a' : '#999' }}>{s.enabled ? '开' : '关'}</span>
          <button onClick={() => delSchedule(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: 12 }}>✕</button>
        </div>
      ))}
      <button onClick={() => setShowNewSched(true)} className="notion-btn" style={{ fontSize: 11, marginTop: 4, alignSelf: 'flex-start' }}>+ 添加定时任务</button>

      <div style={{ fontWeight: 600, marginTop: 16, marginBottom: 8 }}>Webhook</div>
      {webhooks.length === 0 && <div style={{ color: '#999', marginBottom: 8 }}>暂无 Webhook</div>}
      {webhooks.map(w => (
        <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #eee', borderRadius: 6, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>{w.name}</span>
          <span style={{ color: w.enabled ? '#52c41a' : '#999' }}>{w.enabled ? '开' : '关'}</span>
          <button onClick={() => copySecret(w.secret)} className="notion-btn" style={{ fontSize: 10, padding: '2px 6px' }} title={w.secret}>复制密钥</button>
          <button onClick={() => delWebhook(w.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4d4f', fontSize: 12 }}>✕</button>
        </div>
      ))}
      <button onClick={() => setShowNewWh(true)} className="notion-btn" style={{ fontSize: 11, marginTop: 4, alignSelf: 'flex-start' }}>+ 添加 Webhook</button>

      {showNewSched && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowNewSched(false)}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 16, width: 360 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>新建定时任务</div>
            <input className="notion-input" style={{ marginBottom: 8 }} placeholder="任务名称" value={newSchedName} onChange={e => setNewSchedName(e.target.value)} />
            <input className="notion-input" style={{ marginBottom: 12 }} placeholder="Cron 表达式 如 */5 * * * *" value={newCron} onChange={e => setNewCron(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="notion-btn" onClick={() => setShowNewSched(false)}>取消</button>
              <button className="notion-btn primary" onClick={createSchedule}>创建</button>
            </div>
          </div>
        </div>, document.body
      )}

      {showNewWh && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowNewWh(false)}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 16, width: 360 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>新建 Webhook</div>
            <input className="notion-input" style={{ marginBottom: 12 }} placeholder="名称" value={newWhName} onChange={e => setNewWhName(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="notion-btn" onClick={() => setShowNewWh(false)}>取消</button>
              <button className="notion-btn primary" onClick={createWebhook}>创建</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  )
}
