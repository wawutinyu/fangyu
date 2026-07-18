/** 平台 A2A 发送：先用序平台身份签名，再附 X-A2A-Envelope */

export async function signPlatformPayload(payload: string): Promise<Record<string, unknown>> {
  const res = await fetch('/api/v1/trust/platform/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  })
  if (!res.ok) {
    throw new Error(`平台签名失败: ${res.status}`)
  }
  const data = await res.json()
  return data.envelope as Record<string, unknown>
}

/** POST /api/v1/a2a/send，自动附信封（与后端 model_dump 字段顺序对齐） */
export async function a2aSend(params: {
  target_agent: string
  message: Record<string, unknown>
  task_id?: string
}): Promise<Response> {
  const bodyObj = {
    target_agent: params.target_agent,
    message: params.message,
    task_id: params.task_id ?? '',
  }
  const body = JSON.stringify(bodyObj)
  let headers: Record<string, string> = { 'Content-Type': 'application/json' }
  try {
    const envelope = await signPlatformPayload(body)
    headers = { ...headers, 'X-A2A-Envelope': JSON.stringify(envelope) }
  } catch {
    // 签名失败时仍尝试裸发（平台未强制信封时可通）
  }
  return fetch('/api/v1/a2a/send', { method: 'POST', headers, body })
}
