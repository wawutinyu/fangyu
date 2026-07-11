import { describe, expect, it } from 'vitest'
import { SafeExprError, safeCalc, safeEval, safeEvalBool, safeEvalInt } from '../safeExpr'

describe('safeExpr AST', () => {
  it('evaluates condition expressions', () => {
    expect(safeEvalBool("input == 'yes'", { input: 'yes' })).toBe(true)
    expect(safeEvalBool("input == 'yes'", { input: 'no' })).toBe(false)
  })

  it('evaluates numeric comparison', () => {
    expect(safeEvalBool('input > 10', { input: 15 })).toBe(true)
  })

  it('evaluates switch int', () => {
    expect(safeEvalInt('int(input)', { input: '2' })).toBe(2)
  })

  it('evaluates dict literal transform', () => {
    const result = safeEval('{"username": data["name"], "years": data["age"]}', {
      data: { name: 'alice', age: 20 },
    })
    expect(result).toEqual({ username: 'alice', years: 20 })
  })

  it('safeCalc numeric only', () => {
    expect(safeCalc('2 + 3 * 4')).toBe(14)
  })

  it('rejects undefined names in numeric mode', () => {
    expect(() => safeEval('x + 1', {}, { numericOnly: true })).toThrow(SafeExprError)
  })

  it('rejects unsupported syntax', () => {
    expect(() => safeEval('(function(){return 1})()', {})).toThrow(SafeExprError)
  })
})
