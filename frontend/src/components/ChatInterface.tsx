import { useCallback, useRef, useState } from 'react'
import { getReactFlowInstance } from './FlowCanvas'
import { Executor } from '../utils/executor'
import type { ExecutorLog } from '../utils/executor'
import { convertToExportFormat } from '../utils/flowHelper'

export default function ChatInterface() {
  const [expanded, setExpanded] = useState(true)
  const [inputText, setInputText] = useState('')
  const [messages, setMessages] = useState<{ role: string; content: string; logs?: ExecutorLog[]; _showLogs?: boolean; _pendingSkill?: string; _pendingSkillDesc?: string }[]>([])
  const [running, setRunning] = useState(false)
  const msgListRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (msgListRef.current) msgListRef.current.scrollTop = msgListRef.current.scrollHeight
    }, 50)
  }, [])

  const sendMessage = useCallback(async () => {
    const text = inputText.trim()
    if (!text || running) return
    setInputText('')
    setRunning(true)

    // ── /learn command ──
    if (text.startsWith('/learn ')) {
      const desc = text.slice(7).trim()
      setMessages(prev => [...prev, { role: 'user', content: text, _showLogs: false }])
      try {
        const resp = await fetch('/api/v1/llm/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: '你是一个技能生成器。根据用户描述，生成一个 Markdown 技能文件。格式：\n```markdown\n# 技能名称\n## 描述\n简短描述\n## 步骤\n1. ...\n2. ...\n```\n只返回技能内容，不要额外解释。' },
              { role: 'user', content: desc },
            ],
            model: 'deepseek-v4-flash',
            stream: false,
          }),
        })
        const json = await resp.json()
        const skillContent = json.result || ''
        setMessages(prev => [...prev, {
          role: 'assistant', content: skillContent, logs: [], _showLogs: false,
          _pendingSkill: skillContent, _pendingSkillDesc: desc,
        }])
      } catch (err) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: `/learn 执行出错: ${err instanceof Error ? err.message : String(err)}`, logs: [], _showLogs: false,
        }])
      }
      setRunning(false)
      scrollToBottom()
      return
    }

    setMessages(prev => [...prev, { role: 'user', content: text, _showLogs: false }])
    scrollToBottom()

    const instance = getReactFlowInstance()
    if (!instance) { setRunning(false); return }
    const nodes = instance.getNodes()
    const edges = instance.getEdges()
    const flowData = convertToExportFormat(nodes, edges)
    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

    const executor = new Executor(flowData.nodes, flowData.links)
    executor.setExternalInputs({ query: text, message: text })
    executor.setGlobalVars({ _chatHistory: history })

    try {
      const result = await executor.run()
      const logs = result.logs || []
      const lastLLM = result.results?.find(r => r.type === 'llm' && r.outputs?.result)
      const output = lastLLM?.outputs?.result as string || ''
      const allOutputs = result.results || []

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: output || '(流程执行完成，无输出)',
        logs,
        _showLogs: logs.length > 0,
      }])

      fetch('/api/v1/search/index', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text }),
      }).catch(() => {})
      if (output) {
        fetch('/api/v1/search/index', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'assistant', content: output }),
        }).catch(() => {})

        const extractNodes = allOutputs.filter(r => r.type === 'extract-memory')
        if (extractNodes.length === 0) {
          fetch('/api/v1/memory/extract', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: output, max_facts: 3, scope: 'user' }),
          }).catch(() => {})
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `执行出错: ${err instanceof Error ? err.message : String(err)}`,
        logs: [],
        _showLogs: false,
      }])
    }

    setRunning(false)
    scrollToBottom()
  }, [inputText, running, messages, scrollToBottom])

  return (
    <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', flexShrink: 0, height: expanded ? 280 : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', cursor: 'pointer', userSelect: 'none', flexShrink: 0, borderBottom: '1px solid var(--border-light)' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>运行预览</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {messages.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{messages.length} 条消息</span>}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {expanded && (
        <>
          <div ref={msgListRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: '100%', minHeight: 80 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bfbeba" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span style={{ fontSize: 12, color: '#bfbeba' }}>输入消息运行流程，/learn &lt;描述&gt; 学习技能</span>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: msg.role === 'user' ? '#e8e8e6' : '#37352f', color: msg.role === 'user' ? '#37352f' : '#fff' }}>
                  {msg.role === 'user' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>{msg.role === 'user' ? '你' : 'AI'}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  {msg._pendingSkill && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <button style={{ padding: '4px 14px', fontSize: 12, border: 'none', borderRadius: 6, background: '#37352f', color: '#fff', cursor: 'pointer' }}
                        onClick={async () => {
                          try {
                            const saveResp = await fetch('/api/v1/skills/learn-from-llm', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ content: msg._pendingSkill }),
                            })
                            const saveJson = await saveResp.json()
                            const count = saveJson.count || 0
                            setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, _pendingSkill: undefined } : m))
                            if (count > 0) {
                              setMessages(prev => [...prev, {
                                role: 'assistant', content: `✅ 已学习 ${count} 个技能！可在「技能库」面板查看。`, logs: [], _showLogs: false,
                              }])
                            }
                          } catch {
                            setMessages(prev => [...prev, {
                              role: 'assistant', content: '❌ 技能保存失败', logs: [], _showLogs: false,
                            }])
                          }
                        }}
                      >✅ 确认保存</button>
                      <button style={{ padding: '4px 14px', fontSize: 12, border: '1px solid var(--border-color)', borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, _pendingSkill: undefined } : m))}
                      >取消</button>
                    </div>
                  )}
                  {msg.logs && msg.logs.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setMessages(prev => prev.map((m, idx) => idx === i ? { ...m, _showLogs: !m._showLogs } : m))}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        执行日志 ({msg.logs.length})
                      </div>
                      {msg._showLogs && (
                        <div style={{ marginTop: 4, background: '#fafaf8', border: '1px solid var(--border-light)', borderRadius: 6, padding: '6px 8px', maxHeight: 120, overflowY: 'auto', fontSize: 10, fontFamily: "'Cascadia Code', 'Consolas', monospace" }}>
                          {msg.logs.map((log, li) => (
                            <div key={li} style={{ display: 'flex', gap: 4, padding: '2px 0', alignItems: 'flex-start' }}>
                              <span style={{ flexShrink: 0, fontWeight: 700, color: log.type === 'start' ? '#1890ff' : log.type === 'complete' ? '#52c41a' : '#ff4d4f' }}>
                                {log.type === 'start' ? '▶' : log.type === 'complete' ? '✓' : '✗'}
                              </span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0, whiteSpace: 'nowrap' }}>{log.nodeName}</span>
                              <span style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                                {log.type === 'start' ? `输入: ${truncate(JSON.stringify(log.data.inputs), 60)}` : log.type === 'complete' ? `输出: ${truncate(JSON.stringify(log.data.outputs), 60)}` : String(log.data.error)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {running && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#37352f', color: '#fff' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>AI</div>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '4px 0' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animation: 'typingBounce 1.4s infinite ease-in-out both' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animation: 'typingBounce 1.4s infinite ease-in-out both', animationDelay: '-0.16s' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', animation: 'typingBounce 1.4s infinite ease-in-out both', animationDelay: '0s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: 13, outline: 'none', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                value={inputText} onChange={e => setInputText(e.target.value)}
                placeholder="输入消息，按 Enter 发送... (/learn <描述> 学习技能)"
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                disabled={running}
              />
              <button style={{ width: 36, height: 36, border: 'none', borderRadius: 'var(--radius-md)', background: inputText.trim() && !running ? '#37352f' : '#d0d0ce', color: '#fff', cursor: inputText.trim() && !running ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                disabled={running || !inputText.trim()}
                onClick={sendMessage}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function truncate(val: string, len: number) {
  if (!val) return '—'
  return val.length > len ? val.slice(0, len) + '…' : val
}
