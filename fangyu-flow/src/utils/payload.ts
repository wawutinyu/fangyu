/** A2A 多模态 Payload — 与后端 a2a/payload.py 对齐 */
import type { Message, Part } from './a2aProtocol'

export const CONTENT_TEXT = 'text/plain'
export const CONTENT_JSON = 'application/json'
export const CONTENT_FILE_REF = 'application/file+ref'
export const CONTENT_INDUSTRIAL = 'application/industrial'

export interface Payload {
  content_type: string
  body: unknown
  metadata?: Record<string, unknown>
}

export interface IndustrialBody {
  protocol?: string
  tag?: string
  value?: unknown
  unit?: string
  alarm?: boolean
  device_id?: string
  line_id?: string
}

function partContentType(part: Part): string {
  if (part.type === 'text') return CONTENT_TEXT
  if (part.type === 'data') {
    const data = part.data as Record<string, unknown>
    return String(data.content_type || data.contentType || CONTENT_JSON)
  }
  if (part.type === 'file') {
    const mime = part.file.mimeType || ''
    if (mime.startsWith('image/')) return mime
    return CONTENT_FILE_REF
  }
  return CONTENT_TEXT
}

function partToBody(part: Part): unknown {
  if (part.type === 'text') return part.text
  if (part.type === 'data') {
    const data = part.data as Record<string, unknown>
    return 'body' in data ? data.body : data
  }
  if (part.type === 'file') return part.file
  return part
}

export function messageToPayloads(message: Message): Payload[] {
  const meta = message.metadata || {}
  const defaultCt = meta.content_type || meta.contentType
  return (message.parts || []).map(part => ({
    content_type: defaultCt ? String(defaultCt) : partContentType(part),
    body: partToBody(part),
    metadata: { ...meta },
  }))
}

export function messageToInputs(message: Message): Record<string, unknown> {
  const payloads = messageToPayloads(message)
  const inputs: Record<string, unknown> = { payloads: payloads.map(p => ({ ...p })) }
  const texts: string[] = []
  const files: Record<string, unknown>[] = []
  const images: Record<string, unknown>[] = []
  const industrial: IndustrialBody[] = []

  for (const p of payloads) {
    if (p.content_type === CONTENT_TEXT) texts.push(String(p.body))
    else if (p.content_type === CONTENT_JSON && p.body && typeof p.body === 'object') Object.assign(inputs, p.body as object)
    else if (p.content_type === CONTENT_FILE_REF) files.push(p.body as Record<string, unknown>)
    else if (p.content_type.startsWith('image/')) images.push(p.body as Record<string, unknown>)
    else if (p.content_type === CONTENT_INDUSTRIAL) {
      const body = (p.body || {}) as IndustrialBody
      industrial.push(body)
      if (body.tag) inputs.tag = body.tag
      if (body.value !== undefined) inputs.value = body.value
      if (body.unit) inputs.unit = body.unit
      if (body.alarm !== undefined) inputs.alarm = body.alarm
      if (body.device_id) inputs.device_id = body.device_id
    }
  }

  if (texts.length) {
    const joined = texts.join('\n')
    inputs.message = joined
    inputs.query = joined
    inputs.input = joined
    inputs.text = joined
  }
  if (files.length) { inputs.files = files; inputs.file_ref = files[0] }
  if (images.length) { inputs.images = images; inputs.image_ref = images[0] }
  if (industrial.length) { inputs.industrial = industrial; inputs.industrial_event = industrial[industrial.length - 1] }
  if (message.metadata?.skill_id) inputs.skill_id = message.metadata.skill_id
  return inputs
}

export function buildIndustrialMessage(event: IndustrialBody, skillId = 'industrial'): Message {
  return {
    role: 'user' as const,
    parts: [{ type: 'data', data: { content_type: CONTENT_INDUSTRIAL, ...event } }],
    metadata: { content_type: CONTENT_INDUSTRIAL, skill_id: skillId },
  }
}
