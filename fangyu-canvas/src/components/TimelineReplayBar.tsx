import React, { useRef } from 'react'
import type { CollaborationEvent } from '@fangyu/core/schema'
import { formatEventTime, type PresenceReplayMeta } from '../utils/presenceApi'
import { clampReplayIndex } from '../utils/presenceReplay'

export interface TimelineReplayBarProps {
  eventsAsc: CollaborationEvent[]
  /** null = 实时；number = 回放下标（-1 起点） */
  replayIndex: number | null
  playing: boolean
  onReplayIndexChange: (index: number | null) => void
  onPlayingChange: (playing: boolean) => void
  onExportJson?: () => void
  onExportMarkdown?: () => void
  onSaveDb?: () => void
  onImportFile?: (file: File) => void
  archived?: boolean
  archiveTitle?: string | null
  library?: PresenceReplayMeta[]
  onRefreshLibrary?: () => void
  onLoadReplay?: (id: string) => void
  onDeleteReplay?: (id: string) => void
  onExitArchive?: () => void
}

/** 观 · 时间轴回放条：拖动 / 播放 / 导出 / 存库 / 导入 */
export default function TimelineReplayBar({
  eventsAsc,
  replayIndex,
  playing,
  onReplayIndexChange,
  onPlayingChange,
  onExportJson,
  onExportMarkdown,
  onSaveDb,
  onImportFile,
  archived,
  archiveTitle,
  library = [],
  onRefreshLibrary,
  onLoadReplay,
  onDeleteReplay,
  onExitArchive,
}: TimelineReplayBarProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const n = eventsAsc.length
  const active = replayIndex !== null
  const idx = active ? clampReplayIndex(replayIndex, n) : (n > 0 ? n - 1 : -1)
  const ev = idx >= 0 ? eventsAsc[idx] : null
  const sliderMax = Math.max(0, n - 1)
  const sliderValue = idx < 0 ? 0 : idx

  return (
    <div
      data-testid="timeline-replay-bar"
      style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {archived && (
        <div style={{
          fontSize: 11, padding: '6px 8px', borderRadius: 6,
          background: '#fff7ed', color: '#9a3412',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span>归档回放{archiveTitle ? `：${archiveTitle}` : ''}（实时推送已暂停）</span>
          {onExitArchive && (
            <button type="button" className="notion-btn" style={{ fontSize: 10 }} onClick={onExitArchive}>
              回到实时
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>回放</span>
        {n > 0 && (
          <>
            <button
              type="button"
              className="notion-btn"
              data-testid="replay-play"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => {
                if (!active) onReplayIndexChange(0)
                onPlayingChange(!playing)
              }}
            >
              {playing ? '暂停' : '播放'}
            </button>
            <button
              type="button"
              className="notion-btn"
              data-testid="replay-step-back"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => {
                onPlayingChange(false)
                const next = clampReplayIndex((active ? idx : n - 1) - 1, n)
                onReplayIndexChange(next)
              }}
            >
              上一步
            </button>
            <button
              type="button"
              className="notion-btn"
              data-testid="replay-step-fwd"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => {
                onPlayingChange(false)
                const base = active ? idx : -1
                onReplayIndexChange(clampReplayIndex(base + 1, n))
              }}
            >
              下一步
            </button>
          </>
        )}
        {onExportMarkdown && n > 0 && (
          <button
            type="button"
            className="notion-btn"
            data-testid="replay-export-md"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={onExportMarkdown}
            title="导出白话 Markdown 复盘"
          >
            导出复盘
          </button>
        )}
        {onExportJson && n > 0 && (
          <button
            type="button"
            className="notion-btn"
            data-testid="replay-export-json"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={onExportJson}
            title="导出 JSON 事件包"
          >
            导出 JSON
          </button>
        )}
        {onSaveDb && n > 0 && (
          <button
            type="button"
            className="notion-btn primary"
            data-testid="replay-save-db"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={onSaveDb}
            title="写入 collaboration.db（SQLite）"
          >
            存到库
          </button>
        )}
        {onImportFile && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              data-testid="replay-import-input"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) onImportFile(f)
              }}
            />
            <button
              type="button"
              className="notion-btn"
              data-testid="replay-import"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => fileRef.current?.click()}
              title="导入 fangyu.guan.replay JSON"
            >
              导入
            </button>
          </>
        )}
        {active && !archived && (
          <button
            type="button"
            className="notion-btn primary"
            data-testid="replay-live"
            style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}
            onClick={() => {
              onPlayingChange(false)
              onReplayIndexChange(null)
            }}
          >
            回到实时
          </button>
        )}
        {!active && !archived && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {n === 0 ? '可导入已有回放包' : '实时 · 拖动滑块进入回放'}
          </span>
        )}
      </div>

      {n > 0 && (
        <>
          <input
            type="range"
            data-testid="replay-slider"
            min={0}
            max={sliderMax}
            step={1}
            value={sliderValue}
            onChange={(e) => {
              onPlayingChange(false)
              onReplayIndexChange(Number(e.target.value))
            }}
            style={{ width: '100%', accentColor: '#c47e3b' }}
          />
          <div style={{
            fontSize: 11, lineHeight: 1.4,
            color: active || archived ? 'var(--text-primary)' : 'var(--text-muted)',
            minHeight: 32,
          }}>
            {active && idx < 0 && <span>起点：众人尚在角中闲处</span>}
            {ev && (
              <>
                <span style={{ fontWeight: 600 }}>{ev.kind}</span>
                <span style={{ color: 'var(--text-muted)' }}> · {formatEventTime(ev.ts)}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}({idx + 1}/{n})
                </span>
                <div style={{ color: 'var(--text-muted)' }}>
                  {ev.actor}{ev.target ? ` → ${ev.target}` : ''}
                  {ev.message ? ` · ${ev.message}` : ''}
                </div>
              </>
            )}
            {!active && !archived && ev && (
              <span>最新：{ev.kind} · 拖动或点播放回溯走位</span>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>库</span>
        {onRefreshLibrary && (
          <button type="button" className="notion-btn" style={{ fontSize: 10 }} onClick={onRefreshLibrary}>
            刷新列表
          </button>
        )}
        {library.length === 0 ? (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>尚无存库回放</span>
        ) : (
          <select
            data-testid="replay-library"
            defaultValue=""
            style={{ fontSize: 11, maxWidth: 220, padding: '2px 6px' }}
            onChange={(e) => {
              const id = e.target.value
              e.target.value = ''
              if (id && onLoadReplay) onLoadReplay(id)
            }}
          >
            <option value="">加载已存回放…</option>
            {library.map(r => (
              <option key={r.id} value={r.id}>
                {r.title}（{r.event_count} 事件）
              </option>
            ))}
          </select>
        )}
        {library.length > 0 && onDeleteReplay && (
          <select
            data-testid="replay-library-delete"
            defaultValue=""
            style={{ fontSize: 11, maxWidth: 180, padding: '2px 6px' }}
            onChange={(e) => {
              const id = e.target.value
              e.target.value = ''
              if (id && onDeleteReplay) onDeleteReplay(id)
            }}
          >
            <option value="">删除…</option>
            {library.map(r => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
