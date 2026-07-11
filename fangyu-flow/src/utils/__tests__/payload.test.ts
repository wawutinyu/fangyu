import { describe, it, expect } from 'vitest'
import { messageToInputs, buildIndustrialMessage, CONTENT_INDUSTRIAL } from '../payload'

describe('payload utils', () => {
  it('parses text message', () => {
    const inputs = messageToInputs({
      role: 'user' as const,
      parts: [{ type: 'text', text: 'hello' }],
    })
    expect(inputs.message).toBe('hello')
  })

  it('parses industrial event', () => {
    const msg = buildIndustrialMessage({ tag: 'temperature', value: 88, unit: 'C', alarm: true })
    const inputs = messageToInputs(msg)
    expect(inputs.industrial_event).toMatchObject({ tag: 'temperature', value: 88, alarm: true })
    expect(msg.metadata?.content_type).toBe(CONTENT_INDUSTRIAL)
  })

  it('parses file and image refs', () => {
    const inputs = messageToInputs({
      role: 'user' as const,
      parts: [
        { type: 'file', file: { uri: '/a.pdf', name: 'a.pdf', mimeType: 'application/pdf' } },
        { type: 'file', file: { uri: '/b.png', mimeType: 'image/png' } },
      ],
    })
    expect((inputs.file_ref as { name: string }).name).toBe('a.pdf')
    expect((inputs.image_ref as { mimeType: string }).mimeType).toBe('image/png')
  })
})
