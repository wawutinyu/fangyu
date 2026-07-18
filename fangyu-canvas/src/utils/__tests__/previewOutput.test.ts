import { describe, expect, it } from 'vitest'
import { formatFlowChatOutput } from '../formatFlowOutput'
import { looksLikePython } from '../localExecutor'

describe('formatFlowChatOutput', () => {
  it('prefers verify completed summary over raw silence', () => {
    const text = formatFlowChatOutput([
      { type: 'input', nodeName: '任务', outputs: { input: '巡检' } },
      {
        type: 'code',
        nodeName: 'verify',
        outputs: { result: { phase: 'verify', verified: true, status: 'completed', files: ['result.txt'] } },
      },
      { type: 'output', nodeName: '输出', outputs: { result: { phase: 'verify', verified: true, status: 'completed' } } },
    ])
    expect(text).toContain('验证通过')
    expect(text).toContain('已完成')
    expect(text).not.toContain('"phase"')
  })

  it('prefers LLM natural language over verify metadata', () => {
    const text = formatFlowChatOutput([
      { type: 'llm', nodeName: '回答', outputs: { result: '你好！有什么可以帮你的？' } },
      {
        type: 'code',
        nodeName: 'verify',
        outputs: { result: { phase: 'verify', verified: true, status: 'completed' } },
      },
      { type: 'output', nodeName: '输出', outputs: { result: { phase: 'verify', verified: true, status: 'completed' } } },
    ])
    expect(text).toBe('你好！有什么可以帮你的？')
  })

  it('surfaces node errors instead of empty success', () => {
    const text = formatFlowChatOutput([
      { type: 'code', nodeName: 'act', outputs: { result: null, error: '语法错误: invalid' } },
    ])
    expect(text).toContain('节点执行出错')
    expect(text).toContain('act')
  })

  it('summarizes plan/act phases in plain language', () => {
    const text = formatFlowChatOutput([
      { type: 'code', nodeName: 'plan', outputs: { result: { phase: 'plan', action: 'write_result' } } },
    ])
    expect(text).toContain('计划：write_result')
    expect(text).not.toContain('"phase"')
    expect(text).not.toBe('(流程执行完成，无输出)')
  })

  it('chains observe → plan → act → verify', () => {
    const text = formatFlowChatOutput([
      { type: 'code', nodeName: 'observe', outputs: { result: { phase: 'observe', goal: '巡检' } } },
      { type: 'code', nodeName: 'plan', outputs: { result: { phase: 'plan', action: 'write_result' } } },
      { type: 'code', nodeName: 'act', outputs: { result: { phase: 'act', status: 'ok' } } },
      { type: 'code', nodeName: 'verify', outputs: { result: { phase: 'verify', verified: true, status: 'completed' } } },
    ])
    expect(text).toContain('观察：巡检')
    expect(text).toContain('计划：write_result')
    expect(text).toContain('→')
    expect(text).toContain('验证通过')
  })
})

describe('looksLikePython', () => {
  it('detects intent Python templates', () => {
    expect(looksLikePython("result = {'phase': 'observe'}\n")).toBe(true)
    expect(looksLikePython("src = _input if isinstance(_input, dict) else {}\n")).toBe(true)
  })

  it('detects demo JS templates', () => {
    expect(looksLikePython('return { phase: "observe", goal }')).toBe(false)
    expect(looksLikePython('const x = 1\nreturn x')).toBe(false)
  })
})
