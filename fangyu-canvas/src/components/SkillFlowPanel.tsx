import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Executor } from '../utils/executor'
import type { ExecutorLog } from '../utils/executor'
import { describeSkillFlow, skillFlowToExecutorFormat, skillFlowToImportFormat, type SkillFlowShape } from '../utils/skillFlowHelper'
import { deployAgentsToBackend } from '../utils/agentDeploy'
import type { AgentCanvasNode } from '../store/agentSlice'

interface Props {
  open: boolean
  onClose: () => void
  skillId: string
  skillName: string
  flow: SkillFlowShape
  agentNode?: AgentCanvasNode
  onOpenInFlowCanvas?: (data: unknown) => void
}

export default function SkillFlowPanel({
  open,
  onClose,
  skillId,
  skillName,
  flow,
  agentNode,
  onOpenInFlowCanvas,
}: Props) {
  const [input, setInput] = useState('你好，请执行此技能工作流')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [logs, setLogs] = useState<ExecutorLog[]>([])
  const [mode, setMode] = useState<'flow' | 'agent'>('flow')

  const steps = describeSkillFlow(flow)

  const runViaBackendFlow = useCallback(async (text: string) => {
    const { nodes, links } = skillFlowToExecutorFormat(flow)
    const executor = new Executor(nodes, links)
    executor.setExternalInputs({ query: text, message: text, input: text })
    const result = await executor.run()
    setLogs(result.logs || [])
    if (!result.success) {
      setOutput(result.error || result.violation?.message || '执行失败')
      return
    }
    const allOutputs = result.results || []
    const lastLLM = allOutputs.find(r => r.type === 'llm' && r.outputs?.result)
    const lastOut = [...allOutputs].reverse().find(r => r.outputs?.result != null)
    const textOut = lastLLM?.outputs?.result ?? lastOut?.outputs?.result
    setOutput(textOut != null ? String(textOut) : '(流程完成，无文本输出)')
  }, [flow])

  const runViaAgent = useCallback(async (text: string) => {
    if (!agentNode) {
      setOutput('缺少 Agent 节点，无法通过 A2A 运行')
      return
    }
    await deployAgentsToBackend([agentNode])
    const { a2aSend } = await import('../utils/a2aSend')
    const resp = await a2aSend({
      target_agent: agentNode.id,
      message: {
        role: 'user',
        parts: [{ type: 'text', text }],
        metadata: { skill_id: skillId },
      },
    })
    const task = await resp.json()
    if (task.violation) {
      setOutput(task.violation.message || '宪法拦截')
      return
    }
    const lastAgentMsg = task.history?.filter((m: { role: string }) => m.role === 'agent').pop()
    const out = lastAgentMsg?.parts?.[0]?.text
      || task.output?.results?.slice(-1)?.[0]?.outputs?.result
      || '(无输出)'
    setOutput(String(out))
  }, [agentNode, skillId])

  const handleRun = async () => {
    const text = input.trim()
    if (!text || running) return
    setRunning(true)
    setOutput('')
    setLogs([])
    try {
      if (mode === 'agent' && agentNode) {
        await runViaAgent(text)
      } else {
        await runViaBackendFlow(text)
      }
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10003, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(720px, 96vw)', maxHeight: '88vh', overflow: 'hidden',
          background: 'var(--bg-primary)', borderRadius: 12,
          border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{skillName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>技能 ID: {skillId} · {steps.length} 个节点</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }}>×</button>
        </div>

        <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>工作流</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>}
                <span style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 6,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                }}>
                  <span style={{ color: '#722ed1', fontWeight: 600 }}>{s.type}</span>
                  {' · '}{s.label}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button
              className="notion-btn"
              style={{ fontSize: 11 }}
              onClick={() => onOpenInFlowCanvas?.(skillFlowToImportFormat(flow, skillName))}
              disabled={!onOpenInFlowCanvas}
            >
              在 Flow 画布打开
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <input type="radio" checked={mode === 'flow'} onChange={() => setMode('flow')} />
              直接跑工作流（后端引擎）
            </label>
            {agentNode && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <input type="radio" checked={mode === 'agent'} onChange={() => setMode('agent')} />
                作为 Agent 技能运行（A2A 部署）
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              className="notion-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="输入任务或消息..."
              style={{ flex: 1, fontSize: 13 }}
              onKeyDown={e => e.key === 'Enter' && handleRun()}
            />
            <button className="notion-btn primary" onClick={handleRun} disabled={running}>
              {running ? '运行中...' : '运行'}
            </button>
          </div>

          {output && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>输出</div>
              <pre style={{
                fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: 'var(--bg-secondary)', padding: 10, borderRadius: 8, margin: 0,
              }}>{output}</pre>
            </div>
          )}

          {logs.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>执行日志 ({logs.length})</div>
              <div style={{ fontSize: 10, fontFamily: 'monospace', maxHeight: 160, overflow: 'auto', background: '#fafaf8', padding: 8, borderRadius: 6 }}>
                {logs.map((log, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    [{log.type}] {log.nodeName}: {log.type === 'error' ? String(log.data.error) : JSON.stringify(log.data.outputs || log.data.inputs).slice(0, 120)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
