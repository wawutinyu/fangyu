/** 观 · 协作时间线按事件 kind 前缀筛选 */
export type TimelineKindFilter = 'all' | 'factory' | 'host' | 'eval' | 'ops'

export function eventMatchesTimelineFilter(kind: string, filter: TimelineKindFilter): boolean {
  const k = (kind || '').trim()
  if (!k || filter === 'all') return true
  if (filter === 'factory') return k.startsWith('factory.')
  if (filter === 'host') return k.startsWith('host.')
  if (filter === 'eval') return k.startsWith('eval.')
  if (filter === 'ops') return k.startsWith('factory.') || k.startsWith('host.')
  return true
}

/** 从 presence-focus kind 推导时间线筛选 */
export function timelineFilterForFocusKind(kind: string): TimelineKindFilter | null {
  const k = (kind || '').trim()
  if (!k) return null
  if (k.startsWith('eval.')) return 'eval'
  if (k.startsWith('factory.')) return 'factory'
  if (k.startsWith('host.')) return 'host'
  return null
}

export const TIMELINE_KIND_CHIPS: Array<{ id: TimelineKindFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'factory', label: '工厂' },
  { id: 'host', label: '主机' },
  { id: 'eval', label: 'Eval' },
  { id: 'ops', label: '运维' },
]
