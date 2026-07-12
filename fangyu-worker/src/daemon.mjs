import os from 'node:os'
import { createApiClient } from './api.mjs'
import { execShell } from './shell.mjs'
import { checkShellCommand } from './shell-policy.mjs'
import { readWorkspaceFile, writeWorkspaceFile } from './file.mjs'
import { emitTaskEvent, summarizeShellCommand } from './task-events.mjs'
import { loadWorkerIdentity, saveWorkerIdentity } from './identity.mjs'

const POLL_MS = 2_000
const HEARTBEAT_MS = 30_000
const CAPABILITIES = ['shell', 'run_flow', 'read_file', 'write_file', 'adapter_invoke']

/**
 * @param {object} opts
 * @param {string} opts.apiBase
 * @param {string} opts.name
 */
export async function runWorkerDaemon(opts) {
  const api = createApiClient(opts.apiBase)
  const saved = loadWorkerIdentity(opts.idFile)

  const reg = await api.fetch('/api/v1/workers/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.name,
      hostname: os.hostname(),
      os: process.platform,
      capabilities: CAPABILITIES,
      worker_id: saved?.worker_id ?? null,
    }),
  })

  if (!reg.ok) {
    throw new Error(`register failed: ${reg.status} ${await reg.text()}`)
  }

  const { worker } = await reg.json()
  const workerId = worker.id
  saveWorkerIdentity(worker, opts.idFile)

  console.log(`[方隅·行] 已注册 Worker "${worker.name}" (${workerId})${saved?.worker_id ? ' [复用本地 ID]' : ''}`)
  console.log(`[方隅·行] 监听 ${opts.apiBase}，等待序派发任务…`)

  const heartbeatTimer = setInterval(async () => {
    try {
      await api.fetch('/api/v1/workers/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId }),
      })
    } catch (err) {
      console.warn('[方隅·行] heartbeat failed:', err.message)
    }
  }, HEARTBEAT_MS)

  process.on('SIGINT', () => {
    clearInterval(heartbeatTimer)
    console.log('\n[方隅·行] 已停止')
    process.exit(0)
  })

  for (;;) {
    try {
      const poll = await api.fetch(`/api/v1/workers/tasks/poll?worker_id=${encodeURIComponent(workerId)}`)
      if (!poll.ok) {
        await sleep(POLL_MS)
        continue
      }

      const { task } = await poll.json()
      if (!task) {
        await sleep(POLL_MS)
        continue
      }

      console.log(`[方隅·行] 执行任务 ${task.id} (${task.type})`)
      const outcome = await executeTask(api, task, workerId)

      await api.fetch(`/api/v1/workers/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: workerId,
          status: outcome.ok ? 'done' : 'failed',
          result: outcome.result ?? null,
          error: outcome.error ?? null,
        }),
      })

      console.log(`[方隅·行] 任务 ${task.id} ${outcome.ok ? '完成' : '失败'}`)
    } catch (err) {
      console.warn('[方隅·行] poll error:', err.message)
      await sleep(POLL_MS)
    }
  }
}

async function executeTask(api, task, workerId) {
  if (task.type === 'shell') {
    return executeShellTask(api, task, workerId)
  }
  if (task.type === 'read_file') {
    return executeReadFileTask(api, task, workerId)
  }
  if (task.type === 'write_file') {
    return executeWriteFileTask(api, task, workerId)
  }
  if (task.type === 'adapter_invoke') {
    return executeAdapterTask(api, task, workerId)
  }
  if (task.type === 'run_flow') {
    return executeRunFlowTask(api, task, workerId)
  }
  return { ok: false, error: `unsupported task type: ${task.type}` }
}

async function executeShellTask(api, task, workerId) {
  const command = task.payload?.command
  if (!command || typeof command !== 'string') {
    return { ok: false, error: 'missing shell command' }
  }
  const gate = checkShellCommand(command)
  if (!gate.allowed) {
    await emitTaskEvent(api, {
      taskId: task.id,
      workerId,
      eventType: 'shell_blocked',
      message: gate.reason ?? 'shell command blocked',
      detail: { command: summarizeShellCommand(command) },
    })
    return { ok: false, error: gate.reason ?? 'shell command blocked' }
  }
  await emitTaskEvent(api, {
    taskId: task.id,
    workerId,
    eventType: 'shell_start',
    message: summarizeShellCommand(command),
    detail: { cwd: task.payload?.cwd ?? null },
  })
  const result = await execShell({
    command,
    cwd: task.payload?.cwd,
    timeoutMs: task.payload?.timeoutMs,
  })
  await emitTaskEvent(api, {
    taskId: task.id,
    workerId,
    eventType: result.timedOut ? 'shell_timeout' : (result.exitCode === 0 ? 'shell_done' : 'shell_failed'),
    message: result.timedOut ? 'timeout' : `exit ${result.exitCode}`,
    detail: {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout_bytes: result.stdout?.length ?? 0,
      stderr_bytes: result.stderr?.length ?? 0,
    },
  })
  return {
    ok: result.exitCode === 0 && !result.timedOut,
    result,
    error: result.timedOut ? 'timeout' : (result.exitCode !== 0 ? `exit ${result.exitCode}` : null),
  }
}

async function executeReadFileTask(api, task, workerId) {
  const filePath = task.payload?.path
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'missing path' }
  }
  await emitTaskEvent(api, { taskId: task.id, workerId, eventType: 'file_read_start', message: filePath })
  const result = readWorkspaceFile({
    path: filePath,
    encoding: task.payload?.encoding,
    maxBytes: task.payload?.maxBytes,
  })
  if (!result.ok) {
    await emitTaskEvent(api, {
      taskId: task.id, workerId, eventType: 'file_read_failed', message: result.error, detail: { path: filePath },
    })
    return { ok: false, error: result.error }
  }
  await emitTaskEvent(api, {
    taskId: task.id, workerId, eventType: 'file_read_done', message: filePath, detail: { size: result.size },
  })
  return { ok: true, result }
}

async function executeWriteFileTask(api, task, workerId) {
  const filePath = task.payload?.path
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'missing path' }
  }
  await emitTaskEvent(api, { taskId: task.id, workerId, eventType: 'file_write_start', message: filePath })
  const result = writeWorkspaceFile({
    path: filePath,
    content: typeof task.payload?.content === 'string' ? task.payload.content : '',
    encoding: task.payload?.encoding,
    mkdir: task.payload?.mkdir,
  })
  if (!result.ok) {
    await emitTaskEvent(api, {
      taskId: task.id, workerId, eventType: 'file_write_failed', message: result.error, detail: { path: filePath },
    })
    return { ok: false, error: result.error }
  }
  await emitTaskEvent(api, {
    taskId: task.id, workerId, eventType: 'file_write_done', message: filePath, detail: { size: result.size },
  })
  return { ok: true, result }
}

async function executeAdapterTask(api, task, workerId) {
  const action = task.payload?.action
  const adapter = task.payload?.adapter
  if (!adapter || typeof adapter !== 'string') {
    return { ok: false, error: 'missing adapter name' }
  }
  if (action !== 'ingest' && action !== 'emit') {
    return { ok: false, error: 'action must be ingest or emit' }
  }

  await emitTaskEvent(api, {
    taskId: task.id,
    workerId,
    eventType: 'adapter_start',
    message: `${action}:${adapter}`,
    detail: { action, adapter },
  })

  const path = action === 'ingest' ? '/api/v1/adapters/ingest' : '/api/v1/adapters/emit'
  const body = action === 'ingest'
    ? { adapter, raw: task.payload?.raw ?? {} }
    : {
      adapter,
      target: task.payload?.target ?? '',
      content_type: task.payload?.content_type ?? 'application/industrial',
      body: task.payload?.body ?? {},
    }

  const res = await api.fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) {
    const errMsg = result.detail ?? `HTTP ${res.status}`
    await emitTaskEvent(api, {
      taskId: task.id, workerId, eventType: 'adapter_failed', message: errMsg, detail: { action, adapter },
    })
    return { ok: false, error: errMsg }
  }

  await emitTaskEvent(api, {
    taskId: task.id,
    workerId,
    eventType: 'adapter_done',
    message: `${action}:${adapter}`,
    detail: { action, adapter },
  })
  return { ok: true, result }
}

async function executeRunFlowTask(api, task, workerId) {
  await emitTaskEvent(api, {
    taskId: task.id,
    workerId,
    eventType: 'run_flow_start',
    message: task.payload?.snapshot_name ?? 'run_flow',
    detail: {
      snapshot_id: task.payload?.snapshot_id ?? null,
      node_count: Array.isArray(task.payload?.nodes) ? task.payload.nodes.length : 0,
    },
  })
  const res = await api.fetch('/api/v1/flow/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes: task.payload?.nodes ?? [],
      edges: task.payload?.edges ?? [],
      external_inputs: task.payload?.external_inputs ?? {},
      global_vars: task.payload?.global_vars ?? {},
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    await emitTaskEvent(api, {
      taskId: task.id, workerId, eventType: 'run_flow_failed', message: body.detail ?? `HTTP ${res.status}`,
    })
    return { ok: false, error: body.detail ?? `HTTP ${res.status}` }
  }
  await emitTaskEvent(api, {
    taskId: task.id,
    workerId,
    eventType: 'run_flow_done',
    message: task.payload?.snapshot_name ?? 'run_flow',
    detail: { success: body?.success ?? true },
  })
  return { ok: true, result: body }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
