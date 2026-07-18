/** 把 Flow 执行结果格式化成聊天/预览可读文本 */

function isVerifyLike(val: unknown): val is Record<string, unknown> {
  return !!val && typeof val === 'object' && (val as { phase?: string }).phase === 'verify'
}

function isPlanOrActMeta(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false
  const phase = (val as { phase?: string }).phase
  return phase === 'observe' || phase === 'plan' || phase === 'act' || phase === 'verify'
}

function stringifyOutput(val: unknown): string {
  if (val == null || val === '') return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    if (isVerifyLike(val)) {
      const ok = val.verified === true
      return ok
        ? `验证通过：任务已完成（${String(val.status || 'completed')}）。`
        : `验证未完成（${String(val.status || 'pending')}）。`
    }
    return JSON.stringify(val, null, 2)
  }
  return String(val)
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
