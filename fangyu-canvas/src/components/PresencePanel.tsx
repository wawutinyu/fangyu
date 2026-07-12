import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { CollaborationEvent, PresenceEntity, PresenceSnapshot } from '@fangyu/core/schema'
import {
  fetchPresenceSnapshot,
  formatEventTime,
  statusColor,
  statusLabel,
} from '../utils/presenceApi'
import { layoutCollaborationGraph } from '../utils/collaborationGraph'

/** 方隅·观 — 多 Agent / Worker 协作现场 */
export default function PresencePanel() {
  const [snap, setSnap] = useState<PresenceSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'agent' | 'worker'>('all')

  const reload = useCallback(async () => {
    try {
      const data = await fetchPresenceSnapshot(100)
      setSnap(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    reload()
    const t = setInterval(reload, 3000)
    return () => clearInterval(t)
  }, [reload])

  const entities = (snap?.presence || []).filter(p =>
    filter === 'all' ? true : p.kind === filter,
  )
  const events: CollaborationEvent[] = snap?.events || []
  const graph = useMemo(
    () => layoutCollaborationGraph(snap?.presence || [], snap?.edges || [], { width: 520, height: 260 }),
    [snap],
  )

  return (
    <div
      data-testid="presence-panel"
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>方隅·观</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            协作现场 — 谁在线、在干嘛、谁在调谁
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {snap && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
            <span>Agent {snap.summary.agents}（忙 {snap.summary.agents_busy}）</span>
            <span>行 {snap.summary.workers_online}/{snap.summary.workers}</span>
            <span>事件 {snap.summary.events}</span>
            <span>边 {snap.summary.edges ?? snap.edges?.length ?? 0}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'agent', 'worker'] as const).map(f => (
            <button
              key={f}
              type="button"
              className="notion-btn"
              onClick={() => setFilter(f)}
              style={{
                fontSize: 11, padding: '3px 8px',
                fontWeight: filter === f ? 700 : 400,
                opacity: filter === f ? 1 : 0.7,
              }}
            >
              {f === 'all' ? '全部' : f === 'agent' ? 'Agent' : '行'}
            </button>
          ))}
        </div>
        <button type="button" className="notion-btn" style={{ fontSize: 11 }} onClick={reload}>刷新</button>
      </div>

      {error && (
        <div style={{ padding: 12, color: '#dc2626', fontSize: 12 }} data-testid="presence-error">
          {error}（请确认 API 已启动）
        </div>
      )}

      {graph.nodes.length > 0 && (
        <div
          data-testid="presence-edges"
          style={{
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            padding: '8px 12px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)' }}>
            协作边（最近交互）
          </div>
          <svg width="100%" height={graph.height} viewBox={`0 0 ${graph.width} ${graph.height}`} style={{ maxHeight: 260 }}>
            {graph.edges.map((e, i) => {
              const a = graph.nodes.find(n => n.id === e.source)
              const b = graph.nodes.find(n => n.id === e.target)
              if (!a || !b) return null
              const hot = e.last_severity === 'deny' || e.last_severity === 'error'
              return (
                <g key={`${e.source}-${e.target}-${i}`}>
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={hot ? '#dc2626' : '#94a3b8'}
                    strokeWidth={Math.min(4, 1 + Math.log2(1 + e.count))}
                    opacity={0.85}
                  />
                  <title>{`${e.source} → ${e.target} ×${e.count} (${e.last_kind})`}</title>
                </g>
              )
            })}
            {graph.nodes.map(n => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={18} fill="var(--bg-primary)" stroke="#64748b" strokeWidth={1.5} />
                <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={9} fill="var(--text-primary)">
                  {(n.label || n.id).slice(0, 6)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{
          flex: 1, overflow: 'auto', padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12, alignContent: 'start',
        }}>
          {entities.length === 0 && !error && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
              暂无 Presence。部署 Agent（编排画布）或启动方隅·行后会出现在这里。
            </div>
          )}
          {entities.map(p => (
            <PresenceCard key={p.id} entity={p} />
          ))}
        </div>

        <div style={{
          width: 340, maxWidth: '42vw', borderLeft: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)',
        }}>
          <div style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--border-color)' }}>
            协作时间线
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }} data-testid="presence-timeline">
            {events.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>暂无事件</div>
            )}
            {events.map(ev => (
              <div
                key={ev.id}
                style={{
                  padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  fontSize: 11, lineHeight: 1.45,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{
                    fontWeight: 600,
                    color: ev.severity === 'deny' || ev.severity === 'error'
                      ? '#dc2626'
                      : ev.severity === 'warn' ? '#ca8a04' : 'var(--text-primary)',
                  }}>
                    {ev.kind}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatEventTime(ev.ts)}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                  {ev.actor}{ev.target ? ` → ${ev.target}` : ''}
                </div>
                {ev.message && (
                  <div style={{ marginTop: 4 }}>{ev.message}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PresenceCard({ entity }: { entity: PresenceEntity }) {
  const color = statusColor(String(entity.status))
  return (
    <div
      data-testid="presence-card"
      style={{
        border: '1px solid var(--border-color)',
        borderRadius: 10,
        padding: 12,
        background: 'var(--bg-secondary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entity.label}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 4,
          background: 'var(--bg-primary)', color: 'var(--text-muted)',
        }}>
          {entity.kind === 'worker' ? '行' : 'Agent'}
        </span>
      </div>
      <div style={{ fontSize: 11, color: color, fontWeight: 600 }}>
        {statusLabel(String(entity.status))}
      </div>
      {entity.current_skill && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          当前: {entity.current_skill}
        </div>
      )}
      {entity.external && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          外部{entity.authorized ? ' · 已授权' : ' · 未授权'}
        </div>
      )}
      {entity.hostname && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {entity.hostname} · {entity.os}
        </div>
      )}
    </div>
  )
}
