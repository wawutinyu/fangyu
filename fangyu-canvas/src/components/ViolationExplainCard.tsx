import React from 'react'
import { explainViolation } from '../utils/lawExplain'
import type { ViolationDetail } from './ViolationPanel'

const SEV_COLOR: Record<string, string> = {
  info: '#2563eb',
  warn: '#ca8a04',
  deny: '#dc2626',
  error: '#dc2626',
}

/** Studio 违宪白话卡（对齐观 · EventExplainCard） */
export default function ViolationExplainCard({
  item,
  compact,
}: {
  item: Pick<ViolationDetail, 'rule' | 'message' | 'severity' | 'node_type' | 'tool_name' | 'label'>
  compact?: boolean
}) {
  const ex = explainViolation({
    rule: item.rule,
    message: item.message,
    severity: item.severity,
    node_type: item.node_type,
    tool_name: item.tool_name,
    label: item.label,
  })
  const color = SEV_COLOR[ex.severity] || SEV_COLOR.deny

  return (
    <div
      data-testid="violation-explain"
      style={{
        marginBottom: compact ? 6 : 8,
        padding: compact ? '8px 10px' : '10px 12px',
        borderRadius: 8,
        border: `1px solid ${color}55`,
        background: compact ? 'var(--bg-secondary, #f8fafc)' : '#fff',
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, color, marginBottom: 4 }}>{ex.title}</div>
      <div style={{ marginBottom: 6, color: 'var(--text-primary, #1e293b)' }}>{ex.plain}</div>
      <div style={{ color: 'var(--text-muted, #64748b)' }}>
        <span style={{ fontWeight: 600 }}>下一步：</span>{ex.nextStep}
      </div>
    </div>
  )
}
