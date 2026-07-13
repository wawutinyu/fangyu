import { describe, expect, it } from 'vitest'
import { buildTrustPreviewClient } from '../setupCopilot'

// thin re-export test file — pure helpers live in setupCopilot.ts
describe('setupCopilot client helper', () => {
  it('formats confirm from preview payload', () => {
    const text = buildTrustPreviewClient({
      name: 'X',
      plain: 'hello',
      risks: ['r1'],
    })
    expect(text).toContain('hello')
    expect(text).toContain('r1')
  })
})
