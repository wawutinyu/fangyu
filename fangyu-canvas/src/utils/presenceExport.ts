/**
 * 观 · 回放导出：事件包 JSON + 白话 Markdown
 */
import type {
  CollaborationEvent,
  PresenceDepartment,
  PresenceEntity,
  PresenceSnapshot,
} from '@fangyu/core/schema'
import { explainCollabEvent } from './presenceExplain'
import { formatEventTime } from './presenceApi'
import { sortEventsAsc } from './presenceReplay'

export interface ReplayExportPack {
  format: 'fangyu.guan.replay'
  version: 1
  exported_at: string
  summary: PresenceSnapshot['summary'] & { houses?: number }
  departments: PresenceDepartment[]
  presence: Array<Pick<PresenceEntity, 'id' | 'kind' | 'name' | 'label' | 'status' | 'department' | 'department_id'>>
  events: Array<CollaborationEvent & {
    explain: { title: string; plain: string; nextStep: string; severity: string }
  }>
}

export function buildReplayPack(
  snap: PresenceSnapshot,
  events?: CollaborationEvent[],
): ReplayExportPack {
  const list = sortEventsAsc(events ?? snap.events ?? [])
  const departments = snap.departments || []
  const houses = departments.reduce((n, d) => n + (d.houses?.length || 0), 0)
  return {
    format: 'fangyu.guan.replay',
    version: 1,
    exported_at: new Date().toISOString(),
    summary: {
      ...snap.summary,
      houses: houses || undefined,
    },
    departments,
    presence: (snap.presence || []).map(p => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      label: p.label,
      status: p.status,
      department: p.department,
      department_id: p.department_id,
    })),
    events: list.map(ev => {
      const ex = explainCollabEvent(ev)
      return {
        ...ev,
        explain: {
          title: ex.title,
          plain: ex.plain,
          nextStep: ex.nextStep,
          severity: ex.severity,
        },
      }
    }),
  }
}

export function replayPackToMarkdown(pack: ReplayExportPack): string {
  const lines: string[] = [
    '# 方隅·观 协作回放',
    '',
    `导出时间：${pack.exported_at}`,
    '',
    '## 摘要',
    '',
    `- Agent ${pack.summary.agents}（忙 ${pack.summary.agents_busy}）`,
    `- 行 ${pack.summary.workers_online}/${pack.summary.workers}`,
    `- 事件 ${pack.events.length}`,
    `- 部门 ${pack.departments.length}${pack.summary.houses != null ? ` · 宅 ${pack.summary.houses}` : ''}`,
    '',
  ]

  if (pack.departments.length) {
    lines.push('## 部门与宅', '')
    for (const d of pack.departments) {
      lines.push(`### ${d.label}`)
      for (const h of d.houses || []) {
        lines.push(`- **${h.label}**：${(h.member_ids || []).join('、') || '（空）'}`)
      }
      lines.push('')
    }
  }

  lines.push('## 时间线（白话）', '')
  pack.events.forEach((ev, i) => {
    const t = formatEventTime(ev.ts)
    lines.push(`### ${i + 1}. ${ev.explain.title} · \`${ev.kind}\` · ${t}`)
    lines.push('')
    lines.push(ev.explain.plain)
    lines.push('')
    lines.push(`> 下一步：${ev.explain.nextStep}`)
    lines.push('')
    if (ev.actor) {
      lines.push(`- 当事人：${ev.actor}${ev.target ? ` → ${ev.target}` : ''}`)
      lines.push('')
    }
  })

  return lines.join('\n')
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 下载 JSON 事件包 */
export function downloadReplayJson(snap: PresenceSnapshot, events?: CollaborationEvent[]) {
  const pack = buildReplayPack(snap, events)
  triggerDownload(
    `fangyu-guan-replay-${stamp()}.json`,
    JSON.stringify(pack, null, 2),
    'application/json;charset=utf-8',
  )
  return pack
}

/** 下载白话 Markdown 复盘 */
export function downloadReplayMarkdown(snap: PresenceSnapshot, events?: CollaborationEvent[]) {
  const pack = buildReplayPack(snap, events)
  triggerDownload(
    `fangyu-guan-replay-${stamp()}.md`,
    replayPackToMarkdown(pack),
    'text/markdown;charset=utf-8',
  )
  return pack
}

export function parseReplayPack(raw: unknown): ReplayExportPack {
  if (!raw || typeof raw !== 'object') throw new Error('回放包必须是 JSON 对象')
  const o = raw as Record<string, unknown>
  if (o.format !== 'fangyu.guan.replay') throw new Error('format 必须是 fangyu.guan.replay')
  if (!Array.isArray(o.events)) throw new Error('events 必须是数组')
  return {
    format: 'fangyu.guan.replay',
    version: (typeof o.version === 'number' ? o.version : 1) as 1,
    exported_at: typeof o.exported_at === 'string' ? o.exported_at : new Date().toISOString(),
    summary: (o.summary && typeof o.summary === 'object' ? o.summary : {
      agents: 0, agents_busy: 0, workers: 0, workers_online: 0, events: o.events.length,
    }) as ReplayExportPack['summary'],
    departments: Array.isArray(o.departments) ? o.departments as ReplayExportPack['departments'] : [],
    presence: Array.isArray(o.presence) ? o.presence as ReplayExportPack['presence'] : [],
    events: o.events as ReplayExportPack['events'],
  }
}

export async function readReplayPackFromFile(file: File): Promise<ReplayExportPack> {
  const text = await file.text()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('不是合法 JSON')
  }
  return parseReplayPack(raw)
}
