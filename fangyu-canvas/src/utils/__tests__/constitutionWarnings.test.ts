import { describe, expect, it } from 'vitest'
import {
  canvasNodesToScanPayload,
  denyToViolationPayload,
  normalizeFlowResult,
  violationsToPayload,
  warningsToViolationPayload,
} from '../constitutionWarnings'

describe('constitutionWarnings', () => {
  it('maps canvas nodes to scan payload with inner nodes', () => {
    const payload = canvasNodesToScanPayload([
      {
        id: 'c1',
        type: 'composite-node',
        position: { x: 0, y: 0 },
        data: {
          originType: 'composite',
          label: 'Group',
          config: {},
          inner_nodes: [{
            id: 'l1',
            type: 'llm',
            name: 'LLM',
            config: { prompt: 'hi' },
          }],
        },
      },
    ])
    expect(payload[0].id).toBe('c1')
    expect((payload[0].data as Record<string, unknown>).originType).toBe('composite')
    const inner = ((payload[0].data as Record<string, unknown>).inner_nodes as Record<string, unknown>[])[0]
    expect((inner.data as Record<string, unknown>).originType).toBe('llm')
  })

  it('builds warn payload from backend warnings', () => {
    const payload = warningsToViolationPayload([
      { rule: 'policy_llm_model', message: 'no model', severity: 'warn', node_id: 'l1', label: 'LLM' },
    ])
    expect(payload.type).toBe('constitution')
    expect(payload.severity).toBe('warn')
    expect(payload.message).toBe('no model')
    expect(payload.violations).toHaveLength(1)
  })

  it('summarizes multiple violations', () => {
    const payload = violationsToPayload([
      { rule: 'a', message: 'one', severity: 'warn' },
      { rule: 'b', message: 'two', severity: 'warn' },
    ], 'warn')
    expect(payload.message).toContain('2')
    expect(payload.message).toContain('警告')
  })

  it('normalizes deny result from backend', () => {
    const normalized = normalizeFlowResult({
      success: false,
      constitution_violation: true,
      error: 'blocked',
      rule: 'policy_ssrf',
      violations: [{ rule: 'policy_ssrf', message: 'blocked', severity: 'deny' }],
    })
    expect(normalized.violation?.severity).toBe('deny')
    expect(normalized.violation?.violations).toHaveLength(1)
  })

  it('normalizes success warnings from backend', () => {
    const normalized = normalizeFlowResult({
      success: true,
      constitution_warnings: [{ rule: 'policy_llm_model', message: 'no model', severity: 'warn' }],
    })
    expect(normalized.constitution_warnings).toHaveLength(1)
  })

  it('builds deny payload', () => {
    const payload = denyToViolationPayload([
      { rule: 'policy_ssrf', message: 'blocked localhost', severity: 'deny' },
    ])
    expect(payload.severity).toBe('deny')
    expect(payload.message).toBe('blocked localhost')
  })
})
