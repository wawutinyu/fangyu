export interface ViolationDetail {
  rule: string
  message: string
  severity?: 'warn' | 'deny'
  node_id?: string
  node_type?: string
  tool_name?: string
  label?: string
  context?: string
  policy_id?: string
}

export interface ViolationPayload {
  type: 'constitution' | 'trust' | 'unknown'
  severity?: 'warn' | 'deny'
  rule?: string
  message: string
  violations?: ViolationDetail[]
  context?: string
  agent?: string
  skill_id?: string
}

export function formatViolationSummary(v: ViolationPayload): string {
  if (v.type === 'trust') return `🛡️ 信任拒绝：${v.message}`
  if (v.severity === 'warn' || v.violations?.every(i => i.severity === 'warn')) {
    return `⚠️ 宪法警告：${v.message}`
  }
  if (v.type === 'constitution') return `🚫 违宪：${v.message}`
  return v.message
}

interface Props {
  violation?: ViolationPayload | null
  expanded?: boolean
  onToggle?: () => void
}

const RULE_LABELS: Record<string, string> = {
  forbidden_action: '禁止的工具/行为',
  forbidden_node_type: '禁止的节点类型',
  policy_ssrf: 'SSRF 防护',
  policy_llm_model: 'LLM 配置',
  policy_loop_limit: '循环上限',
  policy_tool_name: '工具配置',
  not_authorized: '技能未授权',
  not_registered: '未注册信任层',
  revoked: '身份已吊销',
}

function itemStyle(severity?: string) {
  if (severity === 'warn') {
    return { background: '#fffbe6', border: '1px solid #ffe58f', title: '#d48806' }
  }
  return { background: '#fff1f0', border: '1px solid #ffa39e', title: '#cf1322' }
}

export function ViolationPanel({ violation, expanded = true, onToggle }: Props) {
  if (!violation) return null

  const items = violation.violations?.length
    ? violation.violations
    : [{
        rule: violation.rule || violation.type,
        message: violation.message,
        context: violation.context,
      }]

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{ fontSize: 11, color: '#cf1322', cursor: onToggle ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={onToggle}
      >
        {onToggle && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        )}
        {violation.type === 'trust' ? '信任层拒绝' : violation.severity === 'warn' ? '宪法警告' : '宪法违规详情'} ({items.length})
      </div>
      {expanded && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => {
            const sty = itemStyle(item.severity)
            return (
            <div key={i} style={{ background: sty.background, border: sty.border, borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: sty.title, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                <span>{RULE_LABELS[item.rule] || item.rule}</span>
                {item.severity && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: item.severity === 'warn' ? '#fff1b8' : '#ffccc7' }}>
                    {item.severity === 'warn' ? 'WARN' : 'DENY'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{item.message}</div>
              <div style={{ fontSize: 10, color: '#888', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {item.label && <span>节点: {item.label}</span>}
                {item.tool_name && <span>工具: {item.tool_name}</span>}
                {item.node_type && <span>类型: {item.node_type}</span>}
                {item.context && <span>上下文: {item.context}</span>}
              </div>
            </div>
            )
          })}
          {violation.type === 'trust' && violation.agent && (
            <div style={{ fontSize: 10, color: '#888' }}>
              Agent: {violation.agent}{violation.skill_id ? ` · 技能: ${violation.skill_id}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

