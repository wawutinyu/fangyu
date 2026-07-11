import { describe, expect, it } from 'vitest'
import { CONSTITUTION_POLICY_TEMPLATES, applyPolicyTemplate } from '../constitutionTemplates'

describe('constitutionTemplates', () => {
  it('applies template when not duplicate', () => {
    const added = applyPolicyTemplate(CONSTITUTION_POLICY_TEMPLATES, 'tpl-ssrf', [])
    expect(added).toHaveLength(1)
    expect(added[0].id).toBe('deny-localhost-http')
  })

  it('skips duplicate template', () => {
    const existing = [{ id: 'deny-localhost-http' }]
    const added = applyPolicyTemplate(CONSTITUTION_POLICY_TEMPLATES, 'tpl-ssrf', existing)
    expect(added).toHaveLength(0)
  })

  it('has preset templates', () => {
    expect(CONSTITUTION_POLICY_TEMPLATES.length).toBeGreaterThanOrEqual(4)
  })
})
