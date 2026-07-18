import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CollaborationEvent, PresenceEntity, PresenceSnapshot } from '@fangyu/core/schema'
import {
  fetchPresenceSnapshot,
  formatEventTime,
  factoryHealthColor,
  factoryHealthLabel,
  factoryIdFromHostEntity,
  mergePresenceEvent,
  runPresenceDemo,
  statusColor,
  statusLabel,
  subscribePresenceStream,
  listPresenceReplays,
  savePresenceReplay,
  importPresenceReplay,
  loadPresenceReplay,
  loadPresenceSample,
  deletePresenceReplay,
  type PresenceReplayMeta,
} from '../utils/presenceApi'
import { layoutHouseSettlement, departmentsToGroupHints } from '../utils/houseSettlement'
import {
  clampReplayIndex,
  frameAtIndex,
  sortEventsAsc,
} from '../utils/presenceReplay'
import {
  buildReplayPack,
  downloadReplayJson,
  downloadReplayMarkdown,
  readReplayPackFromFile,
} from '../utils/presenceExport'
import PresenceAlertBell from './PresenceAlertBell'
import PresenceAlertStrip from './PresenceAlertStrip'
import ActorDetailPanel from './ActorDetailPanel'
import FactoryOfflineRetestButton from './FactoryOfflineRetestButton'
import EventExplainCard from './EventExplainCard'
import HouseCommonsScene from './HouseCommonsScene'
import TimelineReplayBar from './TimelineReplayBar'
import { stopManaged } from '../utils/opsApi'
import {
  eventMatchesTimelineFilter,
  timelineFilterForFocusKind,
  TIMELINE_KIND_CHIPS,
  type TimelineKindFilter,
} from '../utils/presenceTimelineFilter'

/** 方隅·观 — 宅子共场：序律为轨，人文协作 */
export default function PresencePanel() {
  const [snap, setSnap] = useState<PresenceSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [filter, setFilter] = useState<'all' | 'agent' | 'worker' | 'managed' | 'host'>('all')
  const [preWallFilter, setPreWallFilter] = useState<'all' | 'agent' | 'worker' | 'managed' | 'host'>('all')
  const [preWallDept, setPreWallDept] = useState<string | null>(null)
  const [deptId, setDeptId] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<{ source: string; target: string } | null>(null)
  /** 点宅间径：按两端宅成员筛跨宅往来 */
  const [pathFilter, setPathFilter] = useState<{ fromHouseId: string; toHouseId: string } | null>(null)
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoHint, setDemoHint] = useState<string | null>(null)
  const [managedBusy, setManagedBusy] = useState(false)
  /** null = 实时；number = 回放帧下标（-1 起点） */
  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  const [replayPlaying, setReplayPlaying] = useState(false)
  /** 值班大屏：全屏投屏，场景为主 */
  const [wallMode, setWallMode] = useState(false)
  /** 正在看归档回放（忽略实时 SSE） */
  const [archiveMode, setArchiveMode] = useState(false)
  const [archiveTitle, setArchiveTitle] = useState<string | null>(null)
  const [library, setLibrary] = useState<PresenceReplayMeta[]>([])
  const [focusKind, setFocusKind] = useState<string | null>(null)
  const [timelineKindFilter, setTimelineKindFilter] = useState<TimelineKindFilter>('all')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const archiveModeRef = useRef(false)
  archiveModeRef.current = archiveMode

  const sceneW = wallMode ? 1440 : 1100
  const sceneH = wallMode ? 780 : 520

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await listPresenceReplays(50))
    } catch {
      /* 库未就绪时静默 */
    }
  }, [])

  useEffect(() => {
    void refreshLibrary()
  }, [refreshLibrary])

  const applyArchiveSnapshot = useCallback((snapData: PresenceSnapshot, title?: string) => {
    setSnap(snapData)
    setError(null)
    setArchiveMode(true)
    setArchiveTitle(title || (snapData as PresenceSnapshot & { archive_exported_at?: string }).archive_exported_at || '归档')
    setReplayPlaying(false)
    setReplayIndex(0)
    setSelectedActorId(null)
    setSelectedEdge(null)
    setPathFilter(null)
  }, [])

  const exitArchive = useCallback(async () => {
    setArchiveMode(false)
    setArchiveTitle(null)
    setReplayIndex(null)
    setReplayPlaying(false)
    try {
      const data = await fetchPresenceSnapshot(100)
      setSnap(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const enterWallMode = useCallback(async () => {
    setPreWallFilter(filter)
    setPreWallDept(deptId)
    // 值班墙默认聚焦跨机主机（可再改筛选项）
    setFilter('host')
    setDeptId('dept-hosts')
    setWallMode(true)
    const el = panelRef.current
    if (el && !document.fullscreenElement) {
      try {
        await el.requestFullscreen?.()
      } catch {
        // 浏览器拒绝全屏时仍用 fixed 覆盖
      }
    }
  }, [filter, deptId])

  const exitWallMode = useCallback(async () => {
    setWallMode(false)
    setFilter(preWallFilter)
    setDeptId(preWallDept)
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch {
        /* ignore */
      }
    }
  }, [preWallFilter, preWallDept])

  useEffect(() => {
    if (!wallMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void exitWallMode()
    }
    const onFs = () => {
      if (!document.fullscreenElement) void exitWallMode()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [wallMode, exitWallMode])

  const runDemo = useCallback(async () => {
    setDemoBusy(true)
    setDemoHint(null)
    try {
      const data = await runPresenceDemo(180)
      setArchiveMode(false)
      setArchiveTitle(null)
      setSnap(data.snapshot)
      setError(null)
      const parts = [`${data.cast} 人`]
      if (data.departments != null) parts.push(`${data.departments} 部门`)
      if (data.houses != null) parts.push(`${data.houses} 宅`)
      parts.push(`${data.events} 事件`)
      setDemoHint(`已上演：${parts.join(' · ')} — 自动回放中`)
      setReplayIndex(0)
      setReplayPlaying(true)
      window.setTimeout(() => setDemoHint(null), 5000)
    } catch (e) {
      setDemoHint(e instanceof Error ? e.message : String(e))
    } finally {
      setDemoBusy(false)
    }
  }, [])

  const loadCrossHostSample = useCallback(async () => {
    setDemoBusy(true)
    setDemoHint(null)
    try {
      const out = await loadPresenceSample('cross-host', true)
      applyArchiveSnapshot(out.snapshot, out.title || out.replay?.title || '跨机 Presence 样例')
      try {
        setLibrary(await listPresenceReplays(40))
      } catch {
        /* ignore */
      }
      setDemoHint(`已加载跨机样例 · ${out.snapshot.events?.length || 0} 事件 — 可拖回放`)
      setReplayIndex(0)
      setReplayPlaying(true)
      window.setTimeout(() => setDemoHint(null), 5000)
    } catch (e) {
      setDemoHint(e instanceof Error ? e.message : String(e))
    } finally {
      setDemoBusy(false)
    }
  }, [applyArchiveSnapshot])

  const loadCrossFactorySample = useCallback(async () => {
    setDemoBusy(true)
    setDemoHint(null)
    try {
      const out = await loadPresenceSample('cross-factory-task', true)
      applyArchiveSnapshot(out.snapshot, out.title || out.replay?.title || '跨厂任务投递样例')
      setFilter('host')
      setDeptId('dept-hosts')
      try {
        setLibrary(await listPresenceReplays(40))
      } catch {
        /* ignore */
      }
      setDemoHint(`已加载跨厂投递样例 · ${out.snapshot.events?.length || 0} 事件 — 可拖回放`)
      setReplayIndex(0)
      setReplayPlaying(true)
      setFocusKind('a2a.send')
      window.setTimeout(() => setDemoHint(null), 5000)
    } catch (e) {
      setDemoHint(e instanceof Error ? e.message : String(e))
    } finally {
      setDemoBusy(false)
    }
  }, [applyArchiveSnapshot])

  const reload = useCallback(async () => {
    if (archiveModeRef.current) return
    try {
      const data = await fetchPresenceSnapshot(100)
      if (archiveModeRef.current) return
      setSnap(data)
      setError(null)
    } catch (e) {
      if (archiveModeRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    const onFocus = (e: Event) => {
      const kind = String((e as CustomEvent).detail?.kind || '')
      if (!kind) return
      setFocusKind(kind)
      const tf = timelineFilterForFocusKind(kind)
      if (tf) setTimelineKindFilter(tf)
      if (kind.startsWith('factory.') || kind.startsWith('host.') || kind.startsWith('eval.')) {
        setFilter('host')
        setDeptId('dept-hosts')
      }
      void reload()
    }
    window.addEventListener('fangyu:presence-focus', onFocus)
    return () => window.removeEventListener('fangyu:presence-focus', onFocus)
  }, [reload])

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPoll = useCallback(() => {
    if (pollRef.current || archiveModeRef.current) return
    void reload()
    pollRef.current = setInterval(() => { void reload() }, 3000)
  }, [reload])

  useEffect(() => {
    if (archiveMode) stopPoll()
  }, [archiveMode, stopPoll])

  useEffect(() => {
    let es: EventSource | null = null
    let closed = false
    try {
      es = subscribePresenceStream({
        onSnapshot: (s) => {
          if (closed || archiveModeRef.current) return
          setSnap(s)
          setError(null)
          setLive(true)
          stopPoll()
        },
        onEvent: (ev) => {
          if (closed || archiveModeRef.current) return
          setSnap(prev => (prev ? mergePresenceEvent(prev, ev) : prev))
          setLive(true)
        },
        onError: () => {
          if (closed || archiveModeRef.current) return
          setLive(false)
          startPoll()
        },
      })
    } catch {
      setLive(false)
      startPoll()
    }
    return () => {
      closed = true
      es?.close()
      stopPoll()
    }
  }, [startPoll, stopPoll])

  const entities = (snap?.presence || []).filter(p => {
    if (filter !== 'all' && p.kind !== filter) return false
    if (deptId && !matchDepartment(p, deptId)) return false
    return true
  })
  const events: CollaborationEvent[] = snap?.events || []
  const eventsAsc = useMemo(() => sortEventsAsc(events), [events])
  const allPresence = snap?.presence || []
  const departments = snap?.departments || []
  const liveEdges = snap?.edges || []
  const groupHints = useMemo(() => {
    const deps = snap?.departments
    if (!deps || deps.length === 0) return undefined
    const hints = departmentsToGroupHints(deps)
    if (!deptId) return hints
    return hints.filter(h => h.departmentId === deptId)
  }, [snap?.departments, deptId])

  const replayFrame = useMemo(() => {
    if (replayIndex === null) return null
    return frameAtIndex(allPresence, eventsAsc, replayIndex)
  }, [replayIndex, allPresence, eventsAsc])

  const scenePresence = useMemo(() => {
    const base = replayFrame ? replayFrame.presence : allPresence
    return base.filter(p => {
      if (filter !== 'all' && p.kind !== filter) return false
      if (deptId && !matchDepartment(p, deptId)) return false
      return true
    })
  }, [replayFrame, allPresence, filter, deptId])
  const edges = replayFrame ? replayFrame.edges : liveEdges
  const activeReplayEventId = replayFrame?.activeEvent?.id ?? null
  const focusedEvent = useMemo(() => {
    if (activeReplayEventId) {
      return events.find(e => e.id === activeReplayEventId) || replayFrame?.activeEvent || null
    }
    return null
  }, [activeReplayEventId, events, replayFrame])

  const selectedActor = useMemo(() => {
    if (!selectedActorId) return null
    const fromView = scenePresence.find(p => p.id === selectedActorId)
    if (fromView) return fromView
    return allPresence.find(p => p.id === selectedActorId) ?? null
  }, [selectedActorId, scenePresence, allPresence])

  const settlement = useMemo(
    () => layoutHouseSettlement(scenePresence, edges, {
      width: sceneW,
      height: sceneH,
      groupHints: groupHints || [],
    }),
    [scenePresence, edges, groupHints, sceneW, sceneH],
  )

  const houseKeySets = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const h of settlement.houses) {
      const keys = new Set<string>()
      for (const m of h.members) {
        for (const k of [m.id, m.label, m.presence.name, m.presence.label]) {
          if (k) keys.add(k)
        }
      }
      map.set(h.id, keys)
    }
    return map
  }, [settlement])

  const pathFilterLabel = useMemo(() => {
    if (!pathFilter) return null
    const a = settlement.houses.find(h => h.id === pathFilter.fromHouseId)?.name || pathFilter.fromHouseId
    const b = settlement.houses.find(h => h.id === pathFilter.toHouseId)?.name || pathFilter.toHouseId
    return `${a} ↔ ${b}`
  }, [pathFilter, settlement])

  const clearSelection = useCallback(() => {
    setSelectedEdge(null)
    setSelectedActorId(null)
    setPathFilter(null)
  }, [])

  useEffect(() => {
    if (!replayPlaying || eventsAsc.length === 0) return
    const handle = window.setInterval(() => {
      setReplayIndex(prev => {
        if (prev === null) return 0
        if (prev >= eventsAsc.length - 1) {
          setReplayPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, 900)
    return () => clearInterval(handle)
  }, [replayPlaying, eventsAsc.length])

  useEffect(() => {
    if (!selectedEdge || !timelineRef.current) return
    const el = timelineRef.current.querySelector(
      `[data-edge-key="${CSS.escape(`${selectedEdge.source}->${selectedEdge.target}`)}"]`,
    )
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedEdge, events])

  useEffect(() => {
    if (!activeReplayEventId || !timelineRef.current) return
    const el = timelineRef.current.querySelector(
      `[data-event-id="${CSS.escape(activeReplayEventId)}"]`,
    )
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeReplayEventId])

  useEffect(() => {
    if (!focusKind || !timelineRef.current) return
    const el = timelineRef.current.querySelector(
      `[data-event-kind="${CSS.escape(focusKind)}"]`,
    ) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      const i = eventsAsc.findIndex(e => e.kind === focusKind)
      if (i >= 0) {
        setReplayPlaying(false)
        setReplayIndex(i)
      }
    }
  }, [focusKind, eventsAsc, events])

  return (
    <div
      ref={panelRef}
      data-testid="presence-panel"
      data-wall={wallMode ? '1' : '0'}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: wallMode ? '#0f1419' : 'var(--bg-primary)',
        color: wallMode ? '#e8eef4' : undefined,
        ...(wallMode
          ? { position: 'fixed' as const, inset: 0, zIndex: 9999 }
          : null),
      }}
    >
      <div style={{
        padding: wallMode ? '14px 20px' : '12px 16px',
        borderBottom: wallMode ? '1px solid #2a3540' : '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: wallMode ? '#151c24' : undefined,
      }}>
        <div>
          <div style={{
            fontSize: wallMode ? 22 : 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            方隅·观{wallMode ? ' · 值班' : ''}
            <span
              data-testid="presence-live"
              title={live ? 'SSE 实时' : '轮询回退'}
              style={{
                fontSize: wallMode ? 12 : 10, fontWeight: 600, padding: wallMode ? '2px 8px' : '1px 6px',
                borderRadius: 4,
                color: live
                  ? (wallMode ? '#86efac' : '#166534')
                  : (wallMode ? '#9ca3af' : '#6b7280'),
                background: live
                  ? (wallMode ? '#14532d' : '#dcfce7')
                  : (wallMode ? '#1f2937' : 'var(--bg-secondary, #f3f4f6)'),
              }}
            >
              {live ? 'LIVE' : 'POLL'}
            </span>
          </div>
          {!wallMode && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              宅子共场 — 序与律为轨，同行者在厅院自由共处
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <PresenceAlertBell wallMode={wallMode} />
        {snap && (
          <div style={{
            fontSize: wallMode ? 14 : 11,
            color: wallMode ? '#a8b8c8' : 'var(--text-muted)',
            display: 'flex', gap: wallMode ? 16 : 10, flexWrap: 'wrap',
          }}>
            <span>Agent {snap.summary.agents}（忙 {snap.summary.agents_busy}）</span>
            <span>行 {snap.summary.workers_online}/{snap.summary.workers}</span>
            {(snap.summary.managed != null) && (
              <span>托管 {snap.summary.managed_online ?? 0}/{snap.summary.managed}</span>
            )}
            {(snap.summary.hosts != null) && (
              <span>主机 {snap.summary.hosts_online ?? 0}/{snap.summary.hosts}</span>
            )}
            <span>事件 {snap.summary.events}</span>
            <span>边 {snap.summary.edges ?? snap.edges?.length ?? 0}</span>
            {(snap.summary.departments ?? snap.departments?.length) != null && (
              <span>部门 {snap.summary.departments ?? snap.departments?.length}</span>
            )}
            {settlement.houses.length > 0 && (
              <span>宅 {settlement.houses.length}</span>
            )}
          </div>
        )}
        {!wallMode && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {([
              ['all', '全部'],
              ['agent', 'Agent'],
              ['worker', '行'],
              ['managed', '托管'],
              ['host', '主机'],
            ] as const).map(([f, label]) => (
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
                {label}
              </button>
            ))}
          </div>
        )}
        {wallMode && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} data-testid="wall-kind-filter">
            {([
              ['host', '主机'],
              ['managed', '托管'],
              ['all', '全部'],
            ] as const).map(([f, label]) => (
              <button
                key={f}
                type="button"
                className="notion-btn"
                onClick={() => {
                  setFilter(f)
                  if (f === 'host') setDeptId('dept-hosts')
                  else if (f === 'managed') setDeptId('dept-managed')
                  else setDeptId(null)
                }}
                style={{
                  fontSize: 12, padding: '3px 10px',
                  fontWeight: filter === f ? 700 : 400,
                  opacity: filter === f ? 1 : 0.75,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {departments.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} data-testid="dept-filter">
            <button
              type="button"
              className="notion-btn"
              onClick={() => setDeptId(null)}
              style={{
                fontSize: wallMode ? 12 : 11, padding: '3px 8px',
                fontWeight: deptId === null ? 700 : 400,
                opacity: deptId === null ? 1 : 0.7,
              }}
            >
              各部门
            </button>
            {departments.map(d => (
              <button
                key={d.id}
                type="button"
                className="notion-btn"
                onClick={() => setDeptId(prev => (prev === d.id ? null : d.id))}
                style={{
                  fontSize: wallMode ? 12 : 11, padding: '3px 8px',
                  fontWeight: deptId === d.id ? 700 : 400,
                  opacity: deptId === d.id ? 1 : 0.7,
                }}
                title={`${d.houses.length} 栋宅`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
        {!wallMode && (
          <>
            <button type="button" className="notion-btn" style={{ fontSize: 11 }} onClick={reload}>刷新</button>
            <button
              type="button"
              className="notion-btn primary"
              data-testid="presence-demo"
              style={{ fontSize: 11 }}
              disabled={demoBusy}
              onClick={() => { void runDemo() }}
              title="注入检索/分析/汇总/行，并写入协作事件"
            >
              {demoBusy ? '上演中…' : '演示剧本'}
            </button>
            <button
              type="button"
              className="notion-btn"
              data-testid="presence-cross-host-sample"
              style={{ fontSize: 11 }}
              disabled={demoBusy}
              onClick={() => { void loadCrossHostSample() }}
              title="加载内置跨机 Presence 回放样例（host + managed）"
            >
              跨机样例
            </button>
            <button
              type="button"
              className="notion-btn"
              data-testid="presence-cross-factory-sample"
              style={{ fontSize: 11 }}
              disabled={demoBusy}
              onClick={() => { void loadCrossFactorySample() }}
              title="加载跨厂任务投递回放样例（两厂 + a2a.send/complete）"
            >
              跨厂投递
            </button>
          </>
        )}
        {wallMode ? (
          <button
            type="button"
            className="notion-btn"
            data-testid="presence-wall-exit"
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => { void exitWallMode() }}
          >
            退出大屏 Esc
          </button>
        ) : (
          <button
            type="button"
            className="notion-btn"
            data-testid="presence-wall-enter"
            style={{ fontSize: 11 }}
            onClick={() => { void enterWallMode() }}
            title="全屏投屏，场景放大"
          >
            值班大屏
          </button>
        )}
      </div>

      {wallMode && <PresenceAlertStrip />}

      {demoHint && (
        <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}>
          {demoHint}
        </div>
      )}

      {error && (
        <div style={{ padding: 12, color: '#dc2626', fontSize: 12 }} data-testid="presence-error">
          {error}（请确认 API 已启动）
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div
            data-testid="presence-edges"
            style={{
              flex: 1,
              minHeight: wallMode ? 480 : 400,
              borderBottom: wallMode ? '1px solid #2a3540' : '1px solid var(--border-color)',
              background: wallMode ? '#121820' : 'var(--bg-secondary)',
              padding: wallMode ? '12px 16px' : '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              fontSize: wallMode ? 13 : 11, fontWeight: 700, marginBottom: 8,
              color: wallMode ? '#8aa0b4' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0,
            }}>
              <span>宅子共场</span>
              {!wallMode && (
                <span style={{ fontWeight: 400, fontSize: 10 }}>
                  角=独处 · 厅=协作 · 院=往来 · 点角色/点宅间径 · 部门可筛
                </span>
              )}
            </div>
            <div style={{
              flex: '1 1 auto',
              minHeight: wallMode ? 420 : 320,
              height: wallMode ? 'min(72vh, 820px)' : 'min(48vh, 480px)',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <HouseCommonsScene
                presence={scenePresence}
                edges={edges}
                groupHints={groupHints}
                width={sceneW}
                height={sceneH}
                selectedId={selectedActorId}
                selectedEdge={selectedEdge}
                onSelectActor={(id) => {
                  setSelectedActorId(prev => (prev === id ? null : id))
                  setSelectedEdge(null)
                  setPathFilter(null)
                }}
                onSelectPath={(fromHouseId, toHouseId) => {
                  setSelectedActorId(null)
                  setSelectedEdge(null)
                  setPathFilter(prev => (
                    prev
                    && prev.fromHouseId === fromHouseId
                    && prev.toHouseId === toHouseId
                      ? null
                      : { fromHouseId, toHouseId }
                  ))
                }}
              />
            </div>
            {!wallMode && edges.length > 0 && (
              <div
                data-testid="presence-edge-strip"
                style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, flexShrink: 0,
                }}
              >
                {edges.slice(0, 6).map(e => {
                  const active = selectedEdge?.source === e.source && selectedEdge?.target === e.target
                  return (
                    <button
                      key={`${e.source}->${e.target}`}
                      type="button"
                      className="notion-btn"
                      style={{
                        fontSize: 10,
                        fontWeight: active ? 700 : 400,
                        borderColor: active ? '#c47e3b' : undefined,
                      }}
                      onClick={() => {
                        setSelectedActorId(null)
                        setPathFilter(null)
                        setSelectedEdge(prev => (
                          prev?.source === e.source && prev?.target === e.target
                            ? null
                            : { source: e.source, target: e.target }
                        ))
                      }}
                    >
                      {e.source} → {e.target}
                      {e.count != null ? ` ·${e.count}` : ''}
                    </button>
                  )
                })}
              </div>
            )}
            {deptId && scenePresence.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                该部门暂无在场角色 — 切换「全部」或换部门。
              </div>
            )}
            {!wallMode && (
              <TimelineReplayBar
                eventsAsc={eventsAsc}
                replayIndex={replayIndex}
                playing={replayPlaying}
                onReplayIndexChange={setReplayIndex}
                onPlayingChange={setReplayPlaying}
                archived={archiveMode}
                archiveTitle={archiveTitle}
                library={library}
                onRefreshLibrary={() => { void refreshLibrary() }}
                onExitArchive={() => { void exitArchive() }}
                onExportJson={() => {
                  if (!snap) return
                  downloadReplayJson(snap, eventsAsc)
                  setDemoHint('已导出 JSON 事件包')
                  window.setTimeout(() => setDemoHint(null), 2500)
                }}
                onExportMarkdown={() => {
                  if (!snap) return
                  downloadReplayMarkdown(snap, eventsAsc)
                  setDemoHint('已导出白话复盘 Markdown')
                  window.setTimeout(() => setDemoHint(null), 2500)
                }}
                onSaveDb={() => {
                  if (!snap) return
                  void (async () => {
                    try {
                      const pack = buildReplayPack(snap, eventsAsc)
                      const meta = await savePresenceReplay(pack, `回放 ${new Date().toLocaleString()}`)
                      setDemoHint(`已存库：${meta.title}`)
                      await refreshLibrary()
                      window.setTimeout(() => setDemoHint(null), 3000)
                    } catch (e) {
                      setDemoHint(e instanceof Error ? e.message : String(e))
                    }
                  })()
                }}
                onImportFile={(file) => {
                  void (async () => {
                    try {
                      const pack = await readReplayPackFromFile(file)
                      const { replay, snapshot: snapData } = await importPresenceReplay(
                        pack,
                        pack.exported_at ? `导入 ${pack.exported_at}` : file.name,
                      )
                      applyArchiveSnapshot(snapData, replay.title)
                      await refreshLibrary()
                      setDemoHint(`已导入并存库：${replay.title}`)
                      window.setTimeout(() => setDemoHint(null), 3000)
                    } catch (e) {
                      setDemoHint(e instanceof Error ? e.message : String(e))
                    }
                  })()
                }}
                onLoadReplay={(id) => {
                  void (async () => {
                    try {
                      const { replay, snapshot: snapData } = await loadPresenceReplay(id)
                      applyArchiveSnapshot(snapData, replay.title)
                      setDemoHint(`已加载：${replay.title}`)
                      window.setTimeout(() => setDemoHint(null), 2500)
                    } catch (e) {
                      setDemoHint(e instanceof Error ? e.message : String(e))
                    }
                  })()
                }}
                onDeleteReplay={(id) => {
                  void (async () => {
                    try {
                      await deletePresenceReplay(id)
                      await refreshLibrary()
                      setDemoHint('已从库中删除')
                      window.setTimeout(() => setDemoHint(null), 2000)
                    } catch (e) {
                      setDemoHint(e instanceof Error ? e.message : String(e))
                    }
                  })()
                }}
              />
            )}
          </div>

          {!wallMode && (
          <div style={{
            flexShrink: 0,
            maxHeight: 160,
            overflow: 'auto',
            padding: '10px 12px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 8,
            alignContent: 'start',
            borderTop: '1px solid var(--border-light, var(--border-color))',
          }}>
            {entities.length === 0 && !error && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                暂无 Presence。部署 Agent 或启动方隅·行后会出现在这里。
              </div>
            )}
            {entities.map(p => (
              <PresenceCard
                key={p.id}
                entity={p}
                selected={selectedActorId === p.id}
                onSelect={() => {
                  setSelectedActorId(prev => (prev === p.id ? null : p.id))
                  setSelectedEdge(null)
                  setPathFilter(null)
                }}
                onRetestDone={() => { void reload() }}
              />
            ))}
          </div>
          )}
        </div>

        <div style={{
          width: wallMode ? 380 : 340,
          maxWidth: wallMode ? '32vw' : '38vw',
          flexShrink: 0,
          borderLeft: wallMode ? '1px solid #2a3540' : '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column',
          background: wallMode ? '#151c24' : 'var(--bg-secondary)',
          minHeight: 0,
        }}>
          {selectedActor ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <ActorDetailPanel
                entity={selectedActor}
                settlement={settlement}
                edges={edges}
                presence={allPresence}
                events={events}
                onClose={clearSelection}
                onRetestDone={() => { void reload() }}
                managedBusy={managedBusy}
                onManagedStop={async (instanceId) => {
                  setManagedBusy(true)
                  setError(null)
                  try {
                    await stopManaged(instanceId)
                    await reload()
                    setDemoHint(`已停止托管 ${instanceId}`)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  }
                  setManagedBusy(false)
                }}
                onSelectPartner={(id) => {
                  setSelectedActorId(id)
                  setSelectedEdge(null)
                  setPathFilter(null)
                }}
                onFocusEdge={(source, target) => {
                  setSelectedEdge({ source, target })
                  setPathFilter(null)
                }}
              />
            </div>
          ) : (
            <>
              <div style={{
                padding: '10px 12px', fontSize: 12, fontWeight: 700,
                borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span>协作时间线</span>
                {pathFilterLabel && (
                  <span style={{ fontSize: 10, fontWeight: 500, color: '#c47e3b' }}>
                    {pathFilterLabel}
                  </span>
                )}
                <div
                  data-testid="timeline-kind-filter"
                  style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 4 }}
                >
                  {TIMELINE_KIND_CHIPS.map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      className="notion-btn"
                      data-testid={`timeline-kind-${chip.id}`}
                      onClick={() => setTimelineKindFilter(chip.id)}
                      style={{
                        fontSize: 10, padding: '2px 7px', fontWeight: timelineKindFilter === chip.id ? 700 : 400,
                        opacity: timelineKindFilter === chip.id ? 1 : 0.7,
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                {(selectedEdge || pathFilter || timelineKindFilter !== 'all') && (
                  <button
                    type="button"
                    className="notion-btn"
                    style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 400 }}
                    onClick={() => {
                      clearSelection()
                      setTimelineKindFilter('all')
                    }}
                  >
                    清除筛选
                  </button>
                )}
              </div>
              <div ref={timelineRef} style={{ flex: 1, overflow: 'auto', padding: 8 }} data-testid="presence-timeline">
                {focusedEvent && (
                  <div style={{ marginBottom: 10, position: 'sticky', top: 0, zIndex: 1 }}>
                    <EventExplainCard event={focusedEvent} />
                  </div>
                )}
                {events.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>
                    暂无事件。点场景中的角色或宅间径可筛选；点事件可看白话解释。
                  </div>
                )}
                {events
                  .filter(ev => eventMatchesTimelineFilter(String(ev.kind || ''), timelineKindFilter))
                  .filter(ev => {
                    if (pathFilter) {
                      return eventMatchesHousePath(
                        ev,
                        houseKeySets.get(pathFilter.fromHouseId),
                        houseKeySets.get(pathFilter.toHouseId),
                      )
                    }
                    if (!selectedEdge) return true
                    return ev.actor === selectedEdge.source && ev.target === selectedEdge.target
                  })
                  .map(ev => {
                    const active = activeReplayEventId === ev.id
                    const focused = focusKind != null && ev.kind === focusKind
                    return (
                  <div
                    key={ev.id}
                    data-event-id={ev.id}
                    data-event-kind={ev.kind}
                    data-edge-key={ev.target ? `${ev.actor}->${ev.target}` : undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const i = eventsAsc.findIndex(e => e.id === ev.id)
                      if (i >= 0) {
                        setReplayPlaying(false)
                        setReplayIndex(i)
                      }
                      setFocusKind(null)
                      setSelectedActorId(ev.actor)
                      if (ev.target) {
                        setSelectedEdge({ source: ev.actor, target: ev.target })
                        setPathFilter(null)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      const i = eventsAsc.findIndex(x => x.id === ev.id)
                      if (i >= 0) {
                        setReplayPlaying(false)
                        setReplayIndex(i)
                      }
                      setFocusKind(null)
                      setSelectedActorId(ev.actor)
                      if (ev.target) {
                        setSelectedEdge({ source: ev.actor, target: ev.target })
                        setPathFilter(null)
                      }
                    }}
                    style={{
                      padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                      background: focused
                        ? 'rgba(212, 136, 6, 0.12)'
                        : 'var(--bg-primary)',
                      border: focused
                        ? '1px solid #d48806'
                        : `1px solid ${active ? '#c47e3b' : 'var(--border-color)'}`,
                      boxShadow: focused
                        ? '0 0 0 1px #d48806'
                        : active
                          ? '0 0 0 1px #c47e3b'
                          : undefined,
                      fontSize: 11, lineHeight: 1.45,
                      cursor: 'pointer',
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
                    )
                  })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function matchDepartment(p: PresenceEntity, departmentId: string): boolean {
  if (p.department_id && p.department_id === departmentId) return true
  // fallback: id encoded as dept-xxx from label
  if (p.department && `dept-${p.department}` === departmentId) return true
  return false
}

function eventMatchesHousePath(
  ev: CollaborationEvent,
  keysA?: Set<string>,
  keysB?: Set<string>,
): boolean {
  if (!keysA || !keysB || keysA.size === 0 || keysB.size === 0) return false
  const actor = (ev.actor || '').trim()
  const target = (ev.target || '').trim()
  if (!actor || !target) return false
  const aInA = keysA.has(actor)
  const aInB = keysB.has(actor)
  const tInA = keysA.has(target)
  const tInB = keysB.has(target)
  return (aInA && tInB) || (aInB && tInA)
}

function PresenceCard({
  entity,
  selected,
  onSelect,
  onRetestDone,
}: {
  entity: PresenceEntity
  selected?: boolean
  onSelect?: () => void
  onRetestDone?: () => void
}) {
  const color = statusColor(String(entity.status))
  const factoryId = factoryIdFromHostEntity(entity)
  const showRetest = Boolean(factoryId && !entity.online)
  return (
    <div
      data-testid="presence-card"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.() }}
      style={{
        border: `1px solid ${selected ? color : 'var(--border-color)'}`,
        borderRadius: 10,
        padding: 12,
        background: 'var(--bg-secondary)',
        cursor: 'pointer',
        boxShadow: selected ? `0 0 0 1px ${color}` : undefined,
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
          {entity.kind === 'worker' ? '行'
            : entity.kind === 'managed' ? '托管'
              : entity.kind === 'host' ? '主机'
                : 'Agent'}
        </span>
      </div>
      <div style={{ fontSize: 11, color: color, fontWeight: 600 }}>
        {statusLabel(String(entity.status))}
      </div>
      {entity.role === 'factory' && entity.health?.score != null && (
        <div style={{ marginTop: 6 }}>
          <span
            data-testid="presence-health-badge"
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 4,
              color: '#fff',
              background: factoryHealthColor(entity.health.score),
            }}
          >
            {factoryHealthLabel(entity.health.score, entity.health.grade)}
          </span>
        </div>
      )}
      {showRetest && factoryId && (
        <FactoryOfflineRetestButton
          factoryId={factoryId}
          baseUrl={entity.base_url || undefined}
          onDone={onRetestDone}
          compact
        />
      )}
      {entity.current_skill && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          当前: {entity.current_skill}
        </div>
      )}
      {entity.kind === 'managed' && entity.port != null && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {entity.host}:{entity.port}
        </div>
      )}
      {entity.kind === 'host' && entity.base_url && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {entity.base_url}
        </div>
      )}
      {entity.department && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {entity.department}
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
