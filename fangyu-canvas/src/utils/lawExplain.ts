/** 律：把技术违规翻成白话建议 */
export interface PlainViolationInput {
  type?: string
  rule?: string
  severity?: string
  message?: string
  node_type?: string
  tool_name?: string
  label?: string
  event?: string
  details?: Record<string, unknown>
}

export interface PlainExplanation {
  title: string
  plain: string
  nextStep: string
  severity: 'info' | 'warn' | 'deny' | 'error'
}

export function explainViolation(input: PlainViolationInput): PlainExplanation {
  const severityRaw = String(input.severity || input.details?.severity || 'deny').toLowerCase()
  const severity: PlainExplanation['severity'] =
    severityRaw === 'warn' ? 'warn'
      : severityRaw === 'error' ? 'error'
        : severityRaw === 'info' ? 'info'
          : 'deny'

  const rule = String(input.rule || input.event || input.type || '')
  const msg = String(input.message || input.details?.error || input.details?.message || '')

  if (rule.includes('trust') || rule === 'trust_violation' || rule === 'trust.deny') {
    return {
      title: '信任未通过',
      plain: msg || '对方 Agent 还没被授权加入协作，或者技能不在白名单里。',
      nextStep: '到 Agent 编排里打开该外部 Agent，勾选「授权接入」，并确认允许的技能。',
      severity: severity === 'info' ? 'deny' : severity,
    }
  }

  if (rule.includes('shell') || msg.includes('shell')) {
    return {
      title: '危险命令被拦住',
      plain: msg || '方隅·行拒绝执行这条 shell（策略认为可能伤机器或数据）。',
      nextStep: '改用不那么危险的命令，或在开发环境显式调整 shell 策略（生产勿随意放开）。',
      severity: 'deny',
    }
  }

  if (rule.includes('forbidden_node') || rule === 'forbidden_node_type') {
    return {
      title: '节点类型被宪法禁止',
      plain: `流程里用了不允许的节点类型「${input.node_type || input.label || '未知'}」。`,
      nextStep: '换掉该节点，或在「方隅·律」里调整 forbidden_node_types（需有权限）。',
      severity,
    }
  }

  if (rule.includes('forbidden_action') || rule === 'forbidden_action') {
    return {
      title: '工具行为被禁止',
      plain: `工具「${input.tool_name || '未知'}」在宪法禁止列表中。`,
      nextStep: '换安全工具，或在律门面审阅 forbidden_actions 是否过严。',
      severity,
    }
  }

  if (severity === 'warn' || rule.includes('warn') || rule.includes('constitution.warn')) {
    return {
      title: '宪法警告（可继续）',
      plain: msg || '流程可继续跑，但有不合规风险，已写入审计。',
      nextStep: '打开方隅·律查看审计；能改配置就改，暂时忽略需有人背书。',
      severity: 'warn',
    }
  }

  if (rule.includes('constitution') || rule.includes('deny')) {
    return {
      title: '宪法拒绝执行',
      plain: msg || '这次操作触碰了社会规则，已被拦截，不会继续执行。',
      nextStep: '看方隅·律里的具体规则与审计；改 Flow/Agent 后再试，而不是绕过扫描。',
      severity: 'deny',
    }
  }

  return {
    title: '需要人工看一眼',
    plain: msg || '系统记录了一条异常，但还没有更细的分类。',
    nextStep: '把错误原文贴到审计旁对照；仍不解就查 /api/v1/constitution/audit。',
    severity,
  }
}

export function explainAuditEntry(entry: {
  event?: string
  details?: Record<string, unknown>
}): PlainExplanation {
  const details = entry.details || {}
  return explainViolation({
    event: entry.event,
    message: String(details.error || details.message || ''),
    details,
    severity: entry.event?.includes('warn') ? 'warn'
      : entry.event?.includes('violation') || entry.event?.includes('blocked') ? 'deny' : 'info',
    rule: entry.event,
    tool_name: details.tool_name as string | undefined,
    label: details.label as string | undefined,
    node_type: details.node_type as string | undefined,
  })
}
