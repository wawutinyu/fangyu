/** 值班墙 · 工厂健康明细 + 短趋势 */
import { factoryHealthColor, factoryHealthLabel } from '../utils/presenceApi'

const FACTOR_LABELS: Record<string, string> = {
  online: '在线',
  freshness: '心跳新鲜',
  probe: '最近探测',
  fail_penalty: '失败惩罚',
  consecutive_failures: '连续失败',
  heartbeat_age_sec: '心跳龄(秒)',
}

function factorLabel(key: string): string {
  return FACTOR_LABELS[key] || key
}

export interface FactoryHealthDetailProps {
  health: {
    score: number
    grade?: string
    factors?: Record<string, unknown>
    history?: Array<{ ts: number; score: number }>
  }
  compact?: boolean
}

export default function FactoryHealthDetail({ health, compact }: FactoryHealthDetailProps) {
  const factors = health.factors || {}
  const keys = Object.keys(factors).filter(k => k !== 'ttl_sec')
  const history = (health.history || []).slice(-12)

  return (
    <div data-testid="factory-health-detail" style={{ marginTop: compact ? 4 : 0 }}>
      <span
        data-testid="actor-health-badge"
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: '1px 6px',
          borderRadius: 4,
          color: '#fff',
          background: factoryHealthColor(health.score),
        }}
      >
        {factoryHealthLabel(health.score, health.grade)}
      </span>
      {keys.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '3px 10px',
            fontSize: 10,
            color: 'var(--text-muted)',
          }}
        >
          {keys.map(k => (
            <div key={k} style={{ display: 'contents' }}>
              <span>{factorLabel(k)}</span>
              <span style={{ fontFamily: 'monospace', textAlign: 'right' }}>
                {String(factors[k])}
              </span>
            </div>
          ))}
        </div>
      )}
      {history.length >= 2 && (
        <div
          data-testid="factory-health-trend"
          style={{ marginTop: 8, display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}
          title={history.map(h => `${Math.round(h.score)}`).join(' → ')}
        >
          {history.map((h, i) => (
            <span
              key={`${h.ts}-${i}`}
              style={{
                width: 8,
                height: Math.max(4, Math.round((h.score / 100) * 16)),
                borderRadius: 1,
                background: factoryHealthColor(h.score),
                opacity: 0.85,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
