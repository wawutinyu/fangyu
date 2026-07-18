import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CollaborationEdge, PresenceEntity } from '@fangyu/core/schema'
import {
  HOUSE_PALETTE,
  layoutHouseSettlement,
  withSelectedEdgeHighlight,
  type GroupHint,
} from '../utils/houseSettlement'
import { mountHouseScene, type HouseSceneController } from '../utils/houseScenePixi'

export interface HouseCommonsSceneProps {
  presence: PresenceEntity[]
  edges?: CollaborationEdge[]
  groupHints?: GroupHint[]
  width?: number
  height?: number
  selectedId?: string | null
  selectedEdge?: { source: string; target: string } | null
  onSelectActor?: (id: string) => void
  onSelectPath?: (sourceHouseId: string, targetHouseId: string) => void
}

/** 观 · 宅子共场 — PixiJS 像素图集渲染 */
export default function HouseCommonsScene({
  presence,
  edges = [],
  groupHints = [],
  width = 1100,
  height = 560,
  selectedId = null,
  selectedEdge = null,
  onSelectActor,
  onSelectPath,
}: HouseCommonsSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const ctrlRef = useRef<HouseSceneController | null>(null)
  const handlersRef = useRef({ onSelectActor, onSelectPath })
  handlersRef.current = { onSelectActor, onSelectPath }
  const [bootError, setBootError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)

  const syncZoom = () => {
    const z = ctrlRef.current?.getZoom()
    if (z != null) setZoomPct(Math.round(z * 100))
  }

  const settlement = useMemo(() => {
    const base = layoutHouseSettlement(presence, edges, { width, height, groupHints })
    return withSelectedEdgeHighlight(base, selectedEdge)
  }, [presence, edges, groupHints, width, height, selectedEdge])
  const settlementRef = useRef(settlement)
  const selectedRef = useRef(selectedId)
  settlementRef.current = settlement
  selectedRef.current = selectedId

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    setBootError(null)
    setReady(false)

    void (async () => {
      try {
        const ctrl = await mountHouseScene(
          host,
          settlementRef.current,
          selectedRef.current,
          {
            onSelectActor: (id) => handlersRef.current.onSelectActor?.(id),
            onSelectPath: (a, b) => handlersRef.current.onSelectPath?.(a, b),
          },
        )
        if (cancelled) {
          ctrl.destroy()
          return
        }
        ctrlRef.current = ctrl
        ctrl.update(settlementRef.current, selectedRef.current)
        setReady(true)
        setZoomPct(Math.round(ctrl.getZoom() * 100))
        const onWheelSync = () => syncZoom()
        ctrl.canvas.addEventListener('wheel', onWheelSync)
        // 暂存以便 cleanup
        ;(ctrl.canvas as HTMLCanvasElement & { __zoomSync?: () => void }).__zoomSync = onWheelSync
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setBootError(msg)
        console.error('[HouseCommonsScene] Pixi mount failed', e)
      }
    })()

    return () => {
      cancelled = true
      const canvas = ctrlRef.current?.canvas as (HTMLCanvasElement & { __zoomSync?: () => void }) | undefined
      if (canvas?.__zoomSync) canvas.removeEventListener('wheel', canvas.__zoomSync)
      ctrlRef.current?.destroy()
      ctrlRef.current = null
    }
  }, [])

  useEffect(() => {
    ctrlRef.current?.update(settlement, selectedId)
  }, [settlement, selectedId])

  useEffect(() => {
    const onStroll = () => {
      const ok = ctrlRef.current?.demoStroll()
      if (ok === false) {
        const el = document.querySelector('[data-testid="house-stroll-hint"]')
        if (el) {
          el.textContent = '没有角色可走'
          window.setTimeout(() => { el.textContent = '' }, 2000)
        }
      }
    }
    window.addEventListener('fangyu:demo-stroll', onStroll)
    return () => window.removeEventListener('fangyu:demo-stroll', onStroll)
  }, [])

  const empty = settlement.houses.length === 0

  return (
    <div
      data-testid="house-commons-scene"
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px rgba(201,194,184,0.4)',
        background: `linear-gradient(180deg, ${HOUSE_PALETTE.skyWash}, ${HOUSE_PALETTE.ground})`,
        height: '100%',
        minHeight: 360,
        position: 'relative',
      }}
    >
      <div
        ref={hostRef}
        data-testid="house-commons-pixi"
        style={{ width: '100%', height: '100%', minHeight: 360, lineHeight: 0 }}
      />
      {ready && !bootError && (
        <div
          data-testid="house-zoom-controls"
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 8,
            background: 'rgba(43,38,34,0.78)',
            color: '#fff8f0',
            fontSize: 11,
            userSelect: 'none',
          }}
        >
          <span style={{ opacity: 0.75, marginRight: 2 }}>滚轮缩放 · 拖拽平移</span>
          <span data-testid="house-stroll-hint" style={{ color: '#f5c84c', minWidth: 0 }} />
          <button
            type="button"
            className="notion-btn"
            style={{ fontSize: 14, padding: '2px 8px', minWidth: 28, background: '#fff8f0', color: '#2b2622' }}
            onClick={() => { ctrlRef.current?.zoomBy(1 / 1.15); syncZoom() }}
            title="缩小"
          >
            −
          </button>
          <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700 }}>{zoomPct}%</span>
          <button
            type="button"
            className="notion-btn"
            style={{ fontSize: 14, padding: '2px 8px', minWidth: 28, background: '#fff8f0', color: '#2b2622' }}
            onClick={() => { ctrlRef.current?.zoomBy(1.15); syncZoom() }}
            title="放大"
          >
            +
          </button>
          <button
            type="button"
            className="notion-btn"
            style={{ fontSize: 11, padding: '2px 8px', background: '#fff8f0', color: '#2b2622' }}
            onClick={() => {
              const ok = ctrlRef.current?.demoStroll()
              if (ok === false) {
                setBootError(null)
                // 临时提示：用 zoom 旁状态不够，塞到按钮 title / alert 太丑，用短 toast 态
                const el = document.querySelector('[data-testid="house-stroll-hint"]')
                if (el) {
                  el.textContent = '没有角色可走 — 先有 Presence'
                  window.setTimeout(() => { el.textContent = '' }, 2500)
                }
              }
            }}
            title="角色出门逛一圈"
          >
            演示走位
          </button>
          <button
            type="button"
            className="notion-btn"
            style={{ fontSize: 11, padding: '2px 8px', background: '#fff8f0', color: '#2b2622' }}
            onClick={() => { ctrlRef.current?.resetView(); syncZoom() }}
            title="重置视图"
          >
            重置
          </button>
        </div>
      )}
      {bootError && (
        <div
          data-testid="house-commons-error"
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 24, textAlign: 'center',
            fontSize: 12, color: '#b91c1c', background: 'rgba(255,248,240,0.92)',
          }}
        >
          宅子场景加载失败：{bootError}
          <br />
          请确认 /guan/pixel/atlas.png 可访问，或执行 npm run gen:guan-pixel -w fangyu-canvas
        </div>
      )}
      {!bootError && !ready && (
        <div style={{
          position: 'absolute', top: 8, left: 12, fontSize: 11,
          color: HOUSE_PALETTE.muted, pointerEvents: 'none',
        }}>
          正在绘制宅子…
        </div>
      )}
      {ready && empty && (
        <div
          data-testid="house-commons-empty"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: HOUSE_PALETTE.ink,
            opacity: 0.8,
            pointerEvents: 'none',
            padding: 24,
            textAlign: 'center',
          }}
        >
          宅子还空着 — 部署 Agent 或启动方隅·行后，同行者会出现在厅院之间
        </div>
      )}
    </div>
  )
}
