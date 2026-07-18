import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  dispatchFlowSnapshot,
  resolveOnlineWorkerId,
  workerStartHint,
  workerStartHintShort,
  PreferredWorkerOfflineError,
} from '../workerDispatch'
import type { ExportFormat } from '@fangyu/core/schema'

const sampleExport: ExportFormat = {
  nodes: [{ id: 'n1', type: 'start', name: 'Start', config: {}, position: { x: 0, y: 0 } }],
  links: [],
  global_meta: { session_id: '', user_id: '' },
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('workerDispatch', () => {
  it('workerStartHint is Mac-aware when UA is Mac', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
    expect(workerStartHint()).toContain('install-worker.sh')
    expect(workerStartHint()).toContain('Fangyu-Worker.command')
    expect(workerStartHintShort()).toContain('install-worker.sh')
  })

  it('workerStartHint keeps bat paths on Windows UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
    expect(workerStartHint()).toContain('dev-worker.bat')
    expect(workerStartHintShort()).toContain('dev-worker-tray.bat')
  })

  it('resolveOnlineWorkerId throws PreferredWorkerOfflineError when preferred is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        workers: [
          { id: 'w-offline', name: 'old', online: false },
          { id: 'w-online', name: 'alive', online: true },
        ],
      }),
    }))
    await expect(resolveOnlineWorkerId('w-offline')).rejects.toBeInstanceOf(PreferredWorkerOfflineError)
    await expect(resolveOnlineWorkerId('w-offline')).rejects.toThrow(/所选 Worker 已离线/)
  })

  it('dispatchFlowSnapshot posts run_flow with snapshot metadata', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workers: [{ id: 'w1', name: 'pc', online: true }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task_id: 't1', status: 'pending' }),
      }))

    const result = await dispatchFlowSnapshot({
      exportData: sampleExport,
      snapshotName: '发布 test',
      snapshotId: 's1',
      workerId: 'w1',
      globalPrompts: { system_prompt: 'sys', user_prompt_template: '', context: '' },
    })

    expect(result.task_id).toBe('t1')
    const body = JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1]?.body))
    expect(body.type).toBe('run_flow')
    expect(body.worker_id).toBe('w1')
    expect(body.payload.snapshot_id).toBe('s1')
    expect(body.payload.snapshot_name).toBe('发布 test')
    expect(body.payload.nodes).toHaveLength(1)
  })
})
