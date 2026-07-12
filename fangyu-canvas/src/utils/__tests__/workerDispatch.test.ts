import { describe, expect, it, vi, beforeEach } from 'vitest'
import { dispatchFlowSnapshot } from '../workerDispatch'
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
