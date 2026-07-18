import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchScenarioTemplates,
  instantiateScenario,
  type ScenarioInstantiateResult,
  type ScenarioMeta,
} from '../utils/scenarioApi'

interface Props {
  open: boolean
  onClose: () => void
  onApply: (result: ScenarioInstantiateResult) => void
}

export default function ScenarioPanel({ open, onClose, onApply }: Props) {
  const [list, setList] = useState<ScenarioMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<ScenarioInstantiateResult | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setLast(null)
    void (async () => {
      setLoading(true)
      try {
        setList(await fetchScenarioTemplates())
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [open])

  const handleInstantiate = useCallback(async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      const result = await instantiateScenario(id)
      setLast(result)
      onApply(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }, [onApply])

  if (!open) return null

  return createPortal(
    <div
      data-testid="scenario-panel"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto',
          background: 'var(--bg-primary, #fff)', borderRadius: 10,
          border: '1px solid var(--border-color, #e5e7eb)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)', padding: 18,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>场景模板</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              一键生成 Flow + Agent 网 + Bundle + 策略包
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" className="notion-btn" onClick={onClose}>关闭</button>
        </div>

        {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>加载中…</div>}
        {error && (
          <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10, whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(s => (
            <div
              key={s.id}
              data-testid={s.featured ? 'scenario-featured' : undefined}
              style={{
                padding: 12,
                border: s.featured ? '1.5px solid #111' : '1px solid var(--border-color, #e5e7eb)',
                borderRadius: 8,
                background: s.featured ? '#fafafa' : 'var(--bg-secondary, #f9fafb)',
              }}
            >
              <div style={{ fontWeight: 650, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {s.title}
                {s.featured && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#111', color: '#fff' }}>
                    推荐
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 10px' }}>
                {s.summary}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Flow {s.flow_template} · Agent {s.agent_template} · {s.agent_kind}
                {s.policy_ids.length ? ` · 策略 ${s.policy_ids.join(', ')}` : ''}
              </div>
              <button
                type="button"
                className="notion-btn notion-btn-primary"
                disabled={busyId !== null}
                onClick={() => void handleInstantiate(s.id)}
              >
                {busyId === s.id ? '实例化中…' : '一键实例化'}
              </button>
            </div>
          ))}
        </div>

        {last?.bundle && (
          <div
            style={{
              marginTop: 14, padding: 10, fontSize: 12,
              background: '#ecfdf5', borderRadius: 6, color: '#065f46',
            }}
          >
            已生成 Bundle：{last.bundle.path}
            {last.policies_applied.length > 0 && (
              <div>新写入策略：{last.policies_applied.join(', ')}</div>
            )}
            <div>画布已加载 Flow 与 Agent 网，可到「方隅·律」查看策略。</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
