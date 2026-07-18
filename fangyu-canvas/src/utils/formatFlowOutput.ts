/** 把 Flow 执行结果格式化成聊天/预览可读文本 */

function isVerifyLike(val: unknown): val is Record<string, unknown> {
  return !!val && typeof val === 'object' && (val as { phase?: string }).phase === 'verify'
}

function isPlanOrActMeta(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false
  const phase = (val as { phase?: string }).phase
  return phase === 'observe' || phase === 'plan' || phase === 'act' || phase === 'verify'
}

/** observe / plan / act / verify → 一行人话 */
export function summarizeActionPhase(val: Record<string, unknown>): string {
  const phase = String(val.phase || '')
  if (phase === 'observe') {
    const goal = val.goal ?? val.observation ?? val.note ?? val.input
    return goal != null && String(goal).trim()
      ? `观察：${String(goal).trim()}`
      : '观察完成'
  }
  if (phase === 'plan') {
    const action = val.action ?? val.next ?? val.plan
    return action != null && String(action).trim()
      ? `计划：${String(action).trim()}`
      : '已生成计划'
  }
  if (phase === 'act') {
    if (val.error) return `执行失败：${String(val.error)}`
    const done = val.done ?? val.result ?? val.status ?? val.message
    return done != null && String(done).trim()
      ? `执行：${String(done).trim()}`
      : '执行完成'
  }
  if (phase === 'verify') {
    const ok = val.verified === true
    return ok
      ? `验证通过：任务已完成（${String(val.status || 'completed')}）。`
      : `验证未完成（${String(val.status || 'pending')}）。`
  }
  return JSON.stringify(val)
}

function stringifyOutput(val: unknown): string {
  if (val == null || val === '') return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    if (isPlanOrActMeta(val)) {
      return summarizeActionPhase(val as Record<string, unknown>)
    }
    return JSON.stringify(val, null, 2)
  }
  return String(val)
}

function formatActionLoopChain(
  allOutputs: Array<{ type: string; nodeName?: string; outputs?: Record<string, unknown> }>,
): string | null {
  const lines: string[] = []
  for (const r of allOutputs) {
    const result = r.outputs?.result
    if (result && typeof result === 'object' && isPlanOrActMeta(result)) {
      lines.push(summarizeActionPhase(result as Record<string, unknown>))
    }
  }
  if (lines.length >= 2) return lines.join(' → ')
  if (lines.length === 1) return lines[0]
  return null
}

/** 从流程节点结果里抽出给聊天框展示的文本 */
export function formatFlowChatOutput(
  allOutputs: Array<{ type: string; nodeName?: string; outputs?: Record<string, unknown> }>,
): string {
  const errors = allOutputs
    .filter(r => r.outputs?.error)
    .map(r => `[${r.nodeName || r.type}] ${r.outputs!.error}`)
  if (errors.length && !allOutputs.some(r => r.type === 'output' && r.outputs?.result != null)) {
    return `节点执行出错：\n${errors.join('\n')}`
  }

  // 多段 LLM：按节点名串起来，便于 llm→llm 串联可读
  const llmRows = allOutputs.filter(r => r.type === 'llm' && r.outputs?.result != null)
  if (llmRows.length >= 2) {
    const parts = llmRows.map(r => {
      const label = r.nodeName || 'llm'
      const body = stringifyOutput(r.outputs?.result)
      return body ? `【${label}】\n${body}` : ''
    }).filter(Boolean)
    if (parts.length) return parts.join('\n\n')
  }

  // 聊天优先展示 LLM 自然语言（不要被 verify JSON 盖住）
  const lastLlm = [...allOutputs].reverse().find(r => r.type === 'llm' && r.outputs?.result != null)
  if (lastLlm) {
    const llmVal = lastLlm.outputs?.result
    if (typeof llmVal === 'string' && llmVal.trim()) return llmVal.trim()
    if (llmVal != null && !isPlanOrActMeta(llmVal)) {
      const text = stringifyOutput(llmVal)
      if (text) return text
    }
  }

  const outNode = [...allOutputs].reverse().find(r => r.type === 'output')
  const outVal = outNode?.outputs?.result
  if (typeof outVal === 'string' && outVal.trim()) return outVal.trim()
  if (outVal != null && !isPlanOrActMeta(outVal)) {
    const text = stringifyOutput(outVal)
    if (text) return text
  }

  const chain = formatActionLoopChain(allOutputs)
  if (chain) return chain

  const verify = [...allOutputs].reverse().find(r =>
    r.nodeName === 'verify' || isVerifyLike(r.outputs?.result),
  )
  if (verify?.outputs?.result != null) {
    const text = stringifyOutput(verify.outputs.result)
    if (text) return text
  }

  if (outVal != null) {
    const text = stringifyOutput(outVal)
    if (text) return text
  }

  const lastWithResult = [...allOutputs].reverse().find(r =>
    !['start', 'end'].includes(r.type) && r.outputs?.result != null,
  )
  if (lastWithResult?.outputs?.result != null) {
    const text = stringifyOutput(lastWithResult.outputs.result)
    if (text) return text
  }

  if (errors.length) return `节点执行出错：\n${errors.join('\n')}`
  return '(流程执行完成，无输出)'
}
