/**
 * Worker 任务审计事件回传序 API
 * @param {ReturnType<import('./api.mjs').createApiClient>} api
 * @param {object} opts
 * @param {string} opts.taskId
 * @param {string} opts.workerId
 * @param {string} opts.eventType
 * @param {string} [opts.message]
 * @param {Record<string, unknown>} [opts.detail]
 */
export async function emitTaskEvent(api, { taskId, workerId, eventType, message = '', detail = null }) {
  try {
    await api.fetch(`/api/v1/workers/tasks/${encodeURIComponent(taskId)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: workerId,
        event_type: eventType,
        message,
        detail,
      }),
    })
  } catch (err) {
    console.warn('[方隅·行] audit event failed:', err.message)
  }
}

/**
 * @param {string} command
 * @param {number} [maxLen]
 */
export function summarizeShellCommand(command, maxLen = 120) {
  const oneLine = command.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine
}
