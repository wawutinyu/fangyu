import React, { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  assertImportableIntentFlow,
  intentToAgents,
  intentToFlow,
  type IntentTemplateId,
  type IntentToFlowResult,
} from '../utils/intentApi'

interface Props {
  open: boolean
  onClose: () => void
  onApply: (flow: IntentToFlowResult['flow']) => void
  onApplyAgents?: (graph: { nodes: unknown[]; edges: unknown[] }) => void
}

const FLOW_TEMPLATES: Array<{ id: IntentTemplateId | ''; label: string }> = [
  { id: '', label: '自动选择' },
  { id: 'opencode_harness', label: '节点编排 · Harness' },
  { id: 'action_loop', label: '行动闭环' },
  { id: 'doc_assistant', label: '文档助手' },
  { id: 'simple_io', label: '简单输入输出' },
]

const AGENT_TEMPLATES: Array<{ id: string; label: string }> = [
  { id: '', label: '自动选择' },
  { id: 'search_analyze_summarize', label: '检索·分析·汇总' },
  { id: 'worker_pair', label: '观察·执行' },
  { id: 'simple_dual', label: '双 Agent' },
]

type AgentResult = Awaited<ReturnType<typeof intentToAgents>>

export default function IntentPanel({ open, onClose, onApply, onApplyAgents }: Props) {
  const [mode, setMode] = useState<'flow' | 'agents'>('flow')
  const [intent, setIntent] = useState('')
  const [template, setTemplate] = useState<string>('')
  const [useLlmPlan, setUseLlmPlan] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flowResult, setFlowResult] = useState<IntentToFlowResult | null>(null)
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null)

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)
    setFlowResult(null)
    setAgentResult(null)
    try {
      if (mode === 'agents') {
        const data = await intentToAgents(intent, { template: template || null })
        setAgentResult(data)
      } else {
        const data = await intentToFlow(intent, {
          template: (template || null) as IntentTemplateId | null,
          use_llm_plan: useLlmPlan,
        })
        setFlowResult(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [intent, template, useLlmPlan, mode])

  const handleApply = useCallback(() => {
    try {
      if (mode === 'agents' && agentResult) {
        onApplyAgents?.({
          nodes: agentResult.graph.nodes,
          edges: agentResult.graph.edges,
        })
        onClose()
        return
      }
      if (flowResult) {
        assertImportableIntentFlow(flowResult)
        onApply(flowResult.flow)
        onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [mode, agentResult, flowResult, onApply, onApplyAgents, onClose])

  if (!open) return null

  const canApply = mode === 'agents'
    ? !!agentResult
    : !!flowResult && !flowResult.scan.blocked

  return createPortal(
    <div
      data-testid="intent-panel-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        data-testid="intent-panel"
        style={{
          width: 520, maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto',
          background: 'var(--bg-primary, #fff)',
          color: 'var(--text-primary, #111)',
          borderRadius: 12, padding: 20,
          border: '1px solid var(--border-color, #e5e5e5)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>意图生成</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #888)', marginTop: 2 }}>
              Flow 或多 Agent 协作网
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }} aria-label="关闭">×</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['flow', 'agents'] as const).map(m => (
            <button
              key={m}
              type="button"
              className="notion-btn"
              data-testid={`intent-mode-${m}`}
              onClick={() => { setMode(m); setFlowResult(null); setAgentResult(null); setTemplate('') }}
              style={{ fontSize: 12, fontWeight: mode === m ? 700 : 400 }}
            >
              {m === 'flow' ? '生成 Flow' : '生成 Agent 网'}
            </button>
          ))}
        </div>

        <textarea
          data-testid="intent-input"
          value={intent}
          onChange={e => setIntent(e.target.value)}
          placeholder={mode === 'agents'
            ? '例如：搜索分析并汇总市场报告 / 产线巡检观察与执行'
            : '例如：完成产线巡检并写入结果 / 总结这篇文档的要点'}
          rows={4}
          style={{
            width: '100%', resize: 'vertical', boxSizing: 'border-box',
            padding: 10, borderRadius: 8, fontSize: 13,
            border: '1px solid var(--border-color, #ddd)',
            background: 'var(--bg-secondary, #fafafa)',
            color: 'inherit',
          }}
        />

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            模板
            <select
              data-testid="intent-template"
              value={template}
              onChange={e => setTemplate(e.target.value)}
              style={{
                fontSize: 12, padding: '4px 8px', borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)', color: 'inherit',
              }}
            >
              {(mode === 'agents' ? AGENT_TEMPLATES : FLOW_TEMPLATES).map(t => (
                <option key={t.id || 'auto'} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          {mode === 'flow' && (
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                data-testid="intent-llm-plan"
                type="checkbox"
                checked={useLlmPlan}
                onChange={e => setUseLlmPlan(e.target.checked)}
              />
              行动模板使用 LLM plan
            </label>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            data-testid="intent-generate"
            className="notion-btn primary"
            disabled={loading || !intent.trim()}
            onClick={handleGenerate}
            style={{ opacity: loading || !intent.trim() ? 0.6 : 1 }}
          >
            {loading ? '生成中…' : '生成'}
          </button>
          <button
            type="button"
            data-testid="intent-apply"
            className="notion-btn"
            disabled={!canApply}
            onClick={handleApply}
            style={{ opacity: canApply ? 1 : 0.5 }}
          >
            {mode === 'agents' ? '应用到 Agent 编排' : '应用到 Flow 画布'}
          </button>
        </div>

        {error && (
          <div data-testid="intent-error" style={{ marginTop: 12, fontSize: 12, color: '#dc2626' }}>
            {error}
          </div>
        )}

        {flowResult && mode === 'flow' && (
          <div data-testid="intent-result" style={{
            marginTop: 14, padding: 12, borderRadius: 8,
            background: 'var(--bg-secondary, #f7f7f7)',
            border: '1px solid var(--border-color, #e8e8e8)',
            fontSize: 12, lineHeight: 1.5,
          }}>
            <div><strong>模板:</strong> {flowResult.template}</div>
            <div><strong>说明:</strong> {flowResult.rationale}</div>
            <div><strong>Flow:</strong> {flowResult.flow.flow_name}（{flowResult.flow.nodes.length} 节点）</div>
            <div style={{ color: flowResult.scan.blocked ? '#dc2626' : '#16a34a' }}>
              <strong>宪法:</strong>{' '}
              {flowResult.scan.blocked
                ? `拒绝（deny ${flowResult.scan.deny.length}）`
                : `通过（warn ${flowResult.scan.warn.length}）`}
            </div>
          </div>
        )}

        {agentResult && mode === 'agents' && (
          <div data-testid="intent-agent-result" style={{
            marginTop: 14, padding: 12, borderRadius: 8,
            background: 'var(--bg-secondary, #f7f7f7)',
            border: '1px solid var(--border-color, #e8e8e8)',
            fontSize: 12, lineHeight: 1.5,
          }}>
            <div><strong>模板:</strong> {agentResult.template}</div>
            <div><strong>说明:</strong> {agentResult.rationale}</div>
            <div><strong>图:</strong> {agentResult.graph.graph_name}</div>
            <div><strong>节点:</strong> {agentResult.graph.nodes.length} · <strong>边:</strong> {agentResult.graph.edges.length}</div>
            <div><strong>流水线:</strong> {(agentResult.graph.pipeline || []).join(' → ')}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
