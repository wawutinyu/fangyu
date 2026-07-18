import { describe, expect, it } from 'vitest'
import { formatPreviewFailure } from '../previewErrors'
import { apiDownHint } from '../apiHealth'

describe('formatPreviewFailure', () => {
  it('uses apiDownHint when apiUp is false', () => {
    const text = formatPreviewFailure('boom', { apiUp: false })
    expect(text).toContain(apiDownHint().slice(0, 12))
    expect(text).toContain('boom')
  })

  it('detects 502 in raw error', () => {
    const text = formatPreviewFailure('后端请求失败 (502) — API 未就绪')
    expect(text).toMatch(/序 API 未连接|API/)
  })

  it('includes violation nextStep', () => {
    const text = formatPreviewFailure(null, {
      violation: {
        type: 'constitution',
        rule: 'no_shell',
        message: '拒绝 shell',
        severity: 'deny',
        violations: [{ rule: 'no_shell', message: '拒绝 shell', severity: 'deny' }],
      },
    })
    expect(text).toContain('下一步')
  })
})
