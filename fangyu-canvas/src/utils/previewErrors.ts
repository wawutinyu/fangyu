import { apiDownHint } from './apiHealth'
import { explainViolation } from './lawExplain'
import type { ViolationPayload } from '../components/ViolationPanel'

/** 预览/聊天失败 → 统一白话（含 API 挂了时的下一步） */
export function formatPreviewFailure(
  err: unknown,
  opts?: { apiUp?: boolean | null; violation?: ViolationPayload | null },
): string {
  if (opts?.violation) {
    const first = opts.violation.violations?.[0]
    const ex = explainViolation({
      type: opts.violation.type,
      rule: first?.rule || opts.violation.rule || opts.violation.type,
      message: first?.message || opts.violation.message,
      severity: first?.severity || opts.violation.severity,
      node_type: first?.node_type,
      tool_name: first?.tool_name,
      label: first?.label,
    })
    const next = ex.nextStep ? `\n下一步：${ex.nextStep}` : ''
    return `${ex.title}：${ex.plain}${next}`
  }

  const raw = err instanceof Error ? err.message : String(err || '运行失败')
  const looksDown =
    opts?.apiUp === false
    || /\b(502|503|Failed to fetch|NetworkError|API 未就绪|ECONNREFUSED)\b/i.test(raw)

  if (looksDown) {
    return `${apiDownHint()}\n（技术细节：${raw}）`
  }
  return raw
}
