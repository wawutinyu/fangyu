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

  if (kind.startsWith('worker.complete')
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

  if (kind === 'managed.start') {
    return {
      title: '托管上线',
      plain: msg
        ? `托管实例「${ev.target || ev.actor}」已启动：「${msg}」。`
        : `托管「${ev.target || ev.actor}」进入在线。`,
      nextStep: '观里筛「托管」可见；回放时间轴到此帧应显示 online。',
      severity,
    }
  }

  if (kind === 'managed.stop') {
    return {
      title: '托管下线',
      plain: msg
        ? `托管实例「${ev.target || ev.actor}」已停止：「${msg}」。`
        : `托管「${ev.target || ev.actor}」已离线。`,
      nextStep: '回放此帧应显示 offline；需要再起可去运维·托管重启。',
      severity,
    }
  }

  if (kind === 'managed.upgrade' || kind === 'managed.restart') {
    const from = String((ev.detail as { from?: string } | undefined)?.from || '')
    const to = String((ev.detail as { to?: string } | undefined)?.to || '')
    return {
      title: kind === 'managed.restart' ? '托管重启' : '托管升级',
      plain: msg
        || (from && to
          ? `托管由 ${from} 切换到 ${to}。`
          : `托管「${ev.target || ev.actor}」已${kind === 'managed.restart' ? '重启' : '升级'}。`),
      nextStep: '回放应对齐新旧实例在线态；运维面板可查看新实例日志。',
      severity,
    }
  }

  if (kind === 'host.heartbeat' || kind === 'host.online') {
    return {
      title: '跨机心跳',
      plain: msg
        || `主机「${ev.actor}」上报在线${(ev.detail as { base_url?: string } | undefined)?.base_url
          ? `（${(ev.detail as { base_url?: string }).base_url}）`
          : ''}。`,
      nextStep: '观里筛「主机」可见；心跳过期后应变 offline。',
      severity,
    }
  }

  if (kind === 'host.offline' || kind === 'host.leave' || kind === 'host.expired') {
    return {
      title: '跨机离线',
      plain: msg || `主机「${ev.actor}」已离线或心跳过期。`,
      nextStep: '回放此帧应显示 offline；确认对端 Studio 是否仍在跑 heartbeat。',
      severity: severity === 'info' ? 'warn' : severity,
    }
  }

  if (kind === 'factory.offline') {
    return {
      title: '工厂离线',
      plain: msg || `工厂「${ev.actor}」探测失败或不可达。`,
      nextStep: '去运维·工厂再探测 / 批量心跳；确认对端端口与网络。',
      severity: severity === 'info' ? 'warn' : severity,
    }
  }

  if (kind === 'factory.online') {
    return {
      title: '工厂上线',
      plain: msg || `工厂「${ev.actor}」已恢复在线。`,
      nextStep: '观里筛主机可见；可继续跨厂投递或拉入画布。',
      severity,
    }
  }

  if (kind === 'factory.align') {
    const imported = (ev.detail as { imported?: number } | undefined)?.imported
    const exported = (ev.detail as { exported?: number } | undefined)?.exported
    return {
      title: '通讯录对齐',
      plain: msg
        || `Presence ↔ 工厂通讯录已对齐${imported != null ? ` · 导入 ${imported}` : ''}${exported != null ? ` · 导出 ${exported}` : ''}。`,
      nextStep: '观时间轴可见；运维·工厂可再对齐或对离线厂再探测。',
      severity: 'info',
    }
  }

  if (kind === 'eval.fail' || kind === 'eval.regression' || kind === 'eval.health_regression') {
    const stages = ((ev.detail as { failed_stages?: string[] } | undefined)?.failed_stages || [])
      .slice(0, 4)
      .join('、')
    if (kind === 'eval.health_regression') {
      return {
        title: '工厂健康回归',
        plain: msg || '出厂质检通过，但工厂健康较上次恶化（均分下降或离线增多）。',
        nextStep: '打开观测 · Eval 对比看健康差；对离线厂一键再探测。',
        severity: 'warn',
      }
    }
    return {
      title: kind === 'eval.regression' ? '出厂质检回归' : '出厂质检未过',
      plain: msg
        || (stages
          ? `factory_gate 红灯：阶段 ${stages} 失败。`
          : 'factory_gate 质检未通过，详见观测 · Eval 报告。'),
      nextStep: '打开观测 · Eval / 告警对照阶段；修完再跑 factory_gate。',
      severity: 'error',
    }
  }

  if (kind === 'external.ping') {
    const ok = (ev.detail as { ok?: boolean } | undefined)?.ok
    const excerpt = String((ev.detail as { excerpt?: string } | undefined)?.excerpt || '')
    return {
      title: ok ? '外部试跑通过' : '外部试跑未过',
      plain: msg
        || (ok
          ? `${ev.actor} 对外部 Agent「${ev.target || '？'}」试跑成功${excerpt ? `：「${excerpt.slice(0, 80)}」` : ''}。`
          : `${ev.actor} 对外部 Agent「${ev.target || '？'}」试跑失败。`),
      nextStep: ok
        ? '可在序·Agent 画布点名调用；需要权限时确认 agent:call:external:*。'
        : '检查对端在线、授权技能与组织 ACL；可在授权向导重试试跑。',
      severity: ok ? 'info' : (severity === 'deny' ? 'deny' : 'warn'),
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
