import { describe, expect, it, vi, beforeEach } from 'vitest'
import { dispatchTask, fetchTask, fetchTasks, fetchWorkers, pollTaskUntilDone } from '../workerApi'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('workerApi', () => {
  it('fetchWorkers returns list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workers: [{ id: 'w1', name: 'test', online: true }] }),
    }))
    const workers = await fetchWorkers()
    expect(workers).toHaveLength(1)
    expect(workers[0].name).toBe('test')
  })

  it('dispatchTask posts task with worker_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 't1', status: 'pending', assigned_worker_id: 'w1' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await dispatchTask({
      type: 'run_flow',
      worker_id: 'w1',
      payload: { nodes: [], edges: [] },
    })
    expect(result.task_id).toBe('t1')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.worker_id).toBe('w1')
    expect(body.type).toBe('run_flow')
  })

  it('pollTaskUntilDone resolves on terminal status', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/tasks/list')) {
        return { ok: true, json: async () => ({ tasks: [] }) }
      }
      calls++
      const status = calls >= 2 ? 'done' : 'running'
      return {
        ok: true,
        json: async () => ({
          task: {
            id: 't1', worker_id: 'w1', type: 'shell', payload: {},
            status, result: { stdout: 'ok' }, error: null,
            created_at: 1, started_at: 1, finished_at: null,
          },
        }),
      }
    }))
    const task = await pollTaskUntilDone('t1', { intervalMs: 1, timeoutMs: 5000 })
    expect(task.status).toBe('done')
  })

  it('fetchTasks returns tasks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [{ id: 't1', status: 'pending' }] }),
    }))
    const tasks = await fetchTasks()
    expect(tasks[0].id).toBe('t1')
  })

  it('fetchTask returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await fetchTask('missing')).toBeNull()
  })
})
