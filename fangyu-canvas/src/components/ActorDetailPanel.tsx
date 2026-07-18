import React, { useMemo } from 'react'
import type {
  CollaborationEdge,
  CollaborationEvent,
  PresenceEntity,
} from '@fangyu/core/schema'
import {
  formatEventTime,
  factoryIdFromHostEntity,
  statusColor,
  statusLabel,
} from '../utils/presenceApi'
import type { HouseRolePlace, HouseSettlement } from '../utils/houseSettlement'
import FactoryHealthDetail from './FactoryHealthDetail'
import ExternalPingRetestButton from './ExternalPingRetestButton'
import FactoryOfflineRetestButton from './FactoryOfflineRetestButton'

const PLACE_LABEL: Record<HouseRolePlace, string> = {
  nook: '私密角',
  hall: '公共厅',
  court: '宅内院',
}

function entityKeys(p: PresenceEntity): string[] {
  const keys = [p.id, p.name, p.label].filter(Boolean) as string[]
  if (p.kind === 'managed' && p.id.startsWith('managed:')) {
    keys.push(p.id.slice('managed:'.length))
  }
  if (p.kind === 'host' && p.id.startsWith('host:')) {
    keys.push(p.id.slice('host:'.length))
  }
  return keys
}

function matchesKeys(value: string | null | undefined, keys: string[]): boolean {
  if (!value) return false
  return keys.includes(value)
}

export interface ActorPartner {
  key: string
  label: string
  entity?: PresenceEntity
  edge: CollaborationEdge
  direction: 'out' | 'in'
}

export function findActorPlacement(
  settlement: HouseSettlement | null,
  actorId: string,
): { houseName: string; place: HouseRolePlace } | null {
  if (!settlement) return null
  for (const house of settlement.houses) {
    const m = house.members.find(x => x.id === actorId)
    if (m) return { houseName: house.name, place: m.place }
  }
  return null
}

export function collectActorPartners(
  entity: PresenceEntity,
  edges: CollaborationEdge[],
  presence: PresenceEntity[],
): ActorPartner[] {
  const keys = entityKeys(entity)
  const byKey = new Map<string, PresenceEntity>()
  for (const p of presence) {
    for (const k of entityKeys(p)) byKey.set(k, p)
  }
  const out: ActorPartner[] = []
  for (const edge of edges) {
    const fromHere = matchesKeys(edge.source, keys)
    const toHere = matchesKeys(edge.target, keys)
    if (!fromHere && !toHere) continue
    const otherKey = fromHere ? edge.target : edge.source
    const other = byKey.get(otherKey)
    out.push({
      key: `${edge.source}->${edge.target}`,
      label: other?.label || otherKey,
      entity: other,
      edge,
      direction: fromHere ? 'out' : 'in',
    })
  }
  return out.sort((a, b) => (b.edge.last_ts || 0) - (a.edge.last_ts || 0))
}

export function filterActorEvents(
  entity: PresenceEntity,
  events: CollaborationEvent[],
): CollaborationEvent[] {
  const keys = entityKeys(entity)
  return events.filter(ev =>
    matchesKeys(ev.actor, keys) || matchesKeys(ev.target, keys),
  )
}

export interface ActorDetailPanelProps {
  entity: PresenceEntity
  settlement: HouseSettlement | null
  edges: CollaborationEdge[]
  presence: PresenceEntity[]
  events: CollaborationEvent[]
  onClose: () => void
  onSelectPartner?: (partnerId: string) => void
  onFocusEdge?: (source: string, target: string) => void
  onManagedStop?: (instanceId: string) => void | Promise<void>
  managedBusy?: boolean
  onRetestDone?: () => void
}

function kindLabel(kind: string): string {
  if (kind === 'worker') return '行'
  if (kind === 'managed') return '托管'
  if (kind === 'host') return '主机'
  return 'Agent'
}

function managedInstanceId(entity: PresenceEntity): string | null {
  if (entity.kind !== 'managed') return null
  const id = entity.id || ''
  return id.startsWith('managed:') ? id.slice('managed:'.length) : id
}

/** 观 · 角色侧栏：状态 / 宅内位置 / 协作伙伴 / 最近往来 */
export default function ActorDetailPanel({
  entity,
  settlement,
  edges,
  presence,
  events,
  onClose,
  onSelectPartner,
  onFocusEdge,
  onManagedStop,
  managedBusy,
  onRetestDone,
}: ActorDetailPanelProps) {
  const color = statusColor(String(entity.status))
  const placement = useMemo(
    () => findActorPlacement(settlement, entity.id),
    [settlement, entity.id],
  )
  const partners = useMemo(
    () => collectActorPartners(entity, edges, presence),
    [entity, edges, presence],
  )
  const recent = useMemo(
    () => filterActorEvents(entity, events).slice(0, 8),
    [entity, events],
  )
  const mid = managedInstanceId(entity)

  return (
    <div data-testid="actor-detail-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>同行者</div>
          <div style={{
            fontSize: 14, fontWeight: 700,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {entity.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {kindLabel(String(entity.kind))}
            {entity.name && entity.name !== entity.label ? ` · ${entity.name}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="notion-btn"
          data-testid="actor-detail-close"
          style={{ fontSize: 10, flexShrink: 0 }}
          onClick={onClose}
        >
          关闭
        </button>
      </div>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
        <Row label="状态">
          <span style={{ color, fontWeight: 600 }}>{statusLabel(String(entity.status))}</span>
          {!entity.online && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>离线</span>}
        </Row>
        {entity.current_skill && (
          <Row label="当前">{entity.current_skill}</Row>
        )}
        {entity.task_id && (
          <Row label="任务">
            <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{entity.task_id}</span>
          </Row>
        )}
        {placement && (
          <Row label="位置">
            {placement.houseName} · {PLACE_LABEL[placement.place]}
          </Row>
        )}
        {(entity.department || entity.department_id) && (
          <Row label="部门">
            {entity.department || entity.department_id}
          </Row>
        )}
        {(entity.hostname || entity.os) && (
          <Row label="主机">
            {[entity.hostname, entity.os].filter(Boolean).join(' · ')}
          </Row>
        )}
        {entity.kind === 'managed' && (
          <>
            {(entity.host || entity.port != null) && (
              <Row label="地址">
                {entity.host}:{entity.port}
              </Row>
            )}
            {entity.bundle_dir && (
              <Row label="包">
                <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{entity.bundle_dir}</span>
              </Row>
            )}
            {entity.health_url && (
              <Row label="健康">
                <a href={entity.health_url} target="_blank" rel="noreferrer" style={{ fontSize: 10 }}>
                  {entity.health_url}
                </a>
              </Row>
            )}
          </>
        )}
        {entity.kind === 'host' && (
          <>
            {entity.base_url && <Row label="URL">{entity.base_url}</Row>}
            {entity.role && <Row label="角色">{entity.role}</Row>}
            {entity.role === 'factory' && entity.health?.score != null && (
              <Row label="健康">
                <FactoryHealthDetail health={entity.health} />
              </Row>
            )}
            {(() => {
              const fid = factoryIdFromHostEntity(entity)
              if (!fid || entity.online) return null
              return (
                <div style={{ marginTop: 8 }}>
                  <FactoryOfflineRetestButton
                    factoryId={fid}
                    baseUrl={entity.base_url || undefined}
                    onDone={onRetestDone}
                  />
                </div>
              )
            })()}
          </>
        )}
        {entity.external && (
          <Row label="来源">
            外部{entity.authorized ? ' · 已授权' : ' · 未授权'}
          </Row>
        )}
        {entity.external && entity.kind === 'agent' && entity.authorized && (
          <div style={{ marginTop: 8 }}>
            <ExternalPingRetestButton
              target={entity.name || entity.id}
              detail={{ agent: entity.name || entity.id }}
              source="ActorDetailPanel"
            />
          </div>
        )}
        {entity.updated_at != null && (
          <Row label="更新">{formatEventTime(entity.updated_at)}</Row>
        )}
        {mid && entity.online && onManagedStop && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="notion-btn"
              data-testid="actor-managed-stop"
              style={{ fontSize: 11 }}
              disabled={managedBusy}
              onClick={() => { void onManagedStop(mid) }}
            >
              {managedBusy ? '停止中…' : '停止托管'}
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)' }}>
          协作伙伴 {partners.length > 0 ? `· ${partners.length}` : ''}
        </div>
        {partners.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>暂无往来边</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {partners.map(p => (
              <button
                key={p.key}
                type="button"
                data-testid="actor-partner"
                onClick={() => {
                  onFocusEdge?.(p.edge.source, p.edge.target)
                  if (p.entity) onSelectPartner?.(p.entity.id)
                }}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {p.direction === 'out' ? '→' : '←'} {p.label}
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                  {p.edge.last_kind || '往来'} · {p.edge.count} 次
                  {p.edge.last_ts ? ` · ${formatEventTime(p.edge.last_ts)}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '10px 12px', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)' }}>
          最近往来
        </div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>暂无相关事件</div>
        ) : (
          recent.map(ev => (
            <div
              key={ev.id}
              style={{
                padding: '8px 10px',
                marginBottom: 6,
                borderRadius: 8,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                fontSize: 11,
                lineHeight: 1.45,
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
              {ev.message && <div style={{ marginTop: 4 }}>{ev.message}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 8, fontSize: 11, marginBottom: 6, lineHeight: 1.4,
    }}>
      <span style={{ color: 'var(--text-muted)', width: 36, flexShrink: 0 }}>{label}</span>
      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}
