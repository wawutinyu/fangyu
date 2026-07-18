import React from 'react'
import type { CollaborationEvent } from '@fangyu/core/schema'
import { explainCollabEvent } from '../utils/presenceExplain'

const SEV_COLOR: Record<string, string> = {
  info: '#2563eb',
  warn: '#ca8a04',
  deny: '#dc2626',
  error: '#dc2626',
}

/** 观 · 事件白话卡片 */
export default function EventExplainCard({
  event,
  compact,
}: {
  event: CollaborationEvent
  compact?: boolean
}) {
  const ex = explainCollabEvent(event)
  const color = SEV_COLOR[ex.severity] || SEV_COLOR.info

  return (
    <div
      data-testid="event-explain"
      style={{
        marginTop: compact ? 6 : 0,
        padding: compact ? '8px 10px' : '10px 12px',
        borderRadius: 8,
        border: `1px solid ${color}55`,
        background: compact ? 'var(--bg-secondary, #f8fafc)' : 'var(--bg-primary)',
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, color, marginBottom: 4 }}>{ex.title}</div>
      <div style={{ marginBottom: 6 }}>{ex.plain}</div>
      <div style={{ color: 'var(--text-muted)' }}>
        <span style={{ fontWeight: 600 }}>下一步：</span>{ex.nextStep}
      </div>
    </div>
  )
}
