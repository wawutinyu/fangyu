/**
 * 观 · 协作事件白话解释（谁因何找谁 / 律为何提醒）
 */
import type { CollaborationEvent } from '@fangyu/core/schema'
import { explainViolation, type PlainExplanation } from './lawExplain'

export type { PlainExplanation }

function who(actor: string, target?: string | null): string {
  const a = (actor || '某人').trim() || '某人'
  const t = (target || '').trim()
  if (!t) return a
  return `${a} → ${t}`
}

function sevOf(ev: CollaborationEvent): PlainExplanation['severity'] {
  const s = String(ev.severity || 'info').toLowerCase()
  if (s === 'warn') return 'warn'
  if (s === 'error') return 'error'
  if (s === 'deny') return 'deny'
  return 'info'
}

/** 把 CollaborationEvent 翻成投屏可读的白话 */
export function explainCollabEvent(ev: CollaborationEvent): PlainExplanation {
  const kind = String(ev.kind || '')
  const msg = String(ev.message || '').trim()
  const link = who(ev.actor, ev.target)
  const severity = sevOf(ev)

  // 律相关：复用律门面解释
  if (kind.startsWith('constitution.') || kind.includes('trust')) {
    const base = explainViolation({
      rule: kind,
      event: kind,
      message: msg,
      severity: ev.severity,
      details: ev.detail,
    })
    return {
      ...base,
      plain: msg
        ? `${link}：${base.plain}${base.plain.endsWith('。') ? '' : '。'}原文「${msg}」。`
        : `${link}。${base.plain}`,
    }
  }

  if (kind === 'a2a.send' || kind.endsWith('.send')) {
    return {
      title: '发出协作',
      plain: msg
        ? `${ev.actor} 把任务交给 ${ev.target || '对方'}：「${msg}」。`
        : `${ev.actor} 向 ${ev.target || '对方'} 发起了一次协作请求。`,
      nextStep: '看对方是否变为「忙碌 / 在厅」；若无反应，确认对方已部署且在线。',
      severity,
    }
  }

  if (kind === 'a2a.started' || kind.includes('.started')) {
    return {
      title: '已接单开工',
      plain: msg
        ? `${ev.actor} 已接手${ev.target ? `（来自 ${ev.target}）` : ''}：「${msg}」。`
        : `${ev.actor} 开始处理协作请求。`,
      nextStep: '可在观里点该角色看当前技能；卡住时查行侧任务或 Agent 日志。',
      severity,
    }
  }

  if (kind === 'a2a.complete' || kind.includes('.complete') || kind.includes('.done')) {
    return {
      title: '协作完成',
      plain: msg
        ? `${ev.actor} 完成交付${ev.target ? ` 给 ${ev.target}` : ''}：「${msg}」。`
        : `${link} 这一段协作已结束。`,
      nextStep: '可拖时间轴回放到此帧复盘；需要存档就导出事件或截屏值班大屏。',
      severity,
    }
  }

  if (kind.startsWith('worker.enqueued') || kind.includes('enqueue')) {
    return {
      title: '派到行侧',
      plain: msg
        ? `${ev.actor} 请行「${ev.target || '？'}」执行：「${msg}」。`
        : `${ev.actor} 向方隅·行投递了一条任务。`,
      nextStep: '打开「行」面板看任务是否排队/执行；行离线时会一直 pending。',
      severity,
    }
  }

  if (kind.startsWith('worker.started') || kind === 'worker.task_started') {
    return {
      title: '行已开工',
      plain: msg
        ? `行「${ev.actor}」开始干活${ev.target ? `（交办方 ${ev.target}）` : ''}：「${msg}」。`
        : `行「${ev.actor}」进入执行中。`,
      nextStep: '关注是否很快 complete；长时间 running 查 worker 日志或机器负载。',
      severity,
    }
  }

  if (
    kind.startsWith('worker.complete')
    || kind === 'worker.task_done'
    || kind.includes('task_done')
  ) {
    return {
      title: '行侧完成',
      plain: msg
        ? `行「${ev.actor}」做完了${ev.target ? `（回告 ${ev.target}）` : ''}：「${msg}」。`
        : `行「${ev.actor}」任务已结束。`,
      nextStep: '结果可在行任务详情查看；失败时看 error 字段再决定是否重派。',
      severity,
    }
  }

  if (kind.includes('fail') || kind.includes('error') || severity === 'error') {
    return {
      title: '协作出错',
      plain: msg || `${link} 过程中出现错误。`,
      nextStep: '对照事件原文与行/Agent 日志；律拒绝类错误请到方隅·律看审计。',
      severity: 'error',
    }
  }

  return {
    title: kind || '协作动态',
    plain: msg ? `${link}：${msg}` : `${link} 发生了一次协作事件（${kind || '未命名'}）。`,
    nextStep: '点角色看详情，或拖回放条对照当时宅内位置。',
    severity,
  }
}
