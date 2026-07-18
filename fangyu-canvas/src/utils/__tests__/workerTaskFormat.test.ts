import { describe, expect, it } from 'vitest'
import type { WorkerInfo, WorkerTask } from '@fangyu/core/schema'
import {
  currentWorkLabel,
  formatTs,
  payloadSummary,
  statusColor,
} from '../workerTaskFormat'

function task(partial: Partial<WorkerTask> & Pick<WorkerTask, 'id' | 'type' | 'status'>): WorkerTask {
  return {
    worker_id: 'w1',
    created_at: 1,
    payload: {},
    ...partial,
  } as WorkerTask
}

describe('workerTaskFormat', () => {
  it('formatTs returns dash for empty', () => {
    expect(formatTs(null)).toBe('—')
    expect(formatTs(undefined)).toBe('—')
  })

  it('summarizes run_flow and shell', () => {
    expect(payloadSummary(task({
      id: 't1',
      type: 'run_flow',
      status: 'pending',
      payload: { snapshot_name: '发布 demo', nodes: [{}, {}] },
    }))).toBe('发布 demo · 2 节点')

    expect(payloadSummary(task({
      id: 't2',
      type: 'shell',
      status: 'pending',
      payload: { command: 'echo hi' },
    }))).toBe('echo hi')
  })

  it('statusColor maps terminal states', () => {
    expect(statusColor('done')).toBe('#16a34a')
    expect(statusColor('failed')).toBe('#dc2626')
  })

  it('currentWorkLabel prefers running then pending', () => {
    const worker: WorkerInfo = {
      id: 'w1',
      name: 'pc',
      hostname: 'h',
      os: 'darwin',
      capabilities: [],
      online: true,
      last_seen: 1,
    }
    const running = task({
      id: 'tr',
      type: 'shell',
      status: 'running',
      worker_id: 'w1',
      payload: { command: 'ls' },
    })
    expect(currentWorkLabel(worker, [running])).toContain('ls')
    expect(currentWorkLabel({ ...worker, online: false }, [])).toBe('离线')
    expect(currentWorkLabel(worker, [])).toBe('空闲')
  })
})
