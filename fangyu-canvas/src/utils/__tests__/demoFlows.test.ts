import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { demoFlows } from '../demoFlows'
import { convertFromExportFormat } from '../flowHelper'
import { runLocalFlow, type PendingInteraction } from '../localExecutor'
import { scanFlowConstitution } from '../constitutionWarnings'

const DEMO_IDS = Object.keys(demoFlows)

function demoToFlow(demoId: string): { nodes: Node[]; edges: Edge[] } {
  const demo = demoFlows[demoId]
  return convertFromExportFormat(demo.data as Parameters<typeof convertFromExportFormat>[0])
}

async function runDemo(demoId: string, opts?: { useRealLlm?: boolean }) {
  const { nodes, edges } = demoToFlow(demoId)
  const pending: PendingInteraction[] = []
  const scan = await scanFlowConstitution(nodes).catch(() => ({ blocked: false, deny: null, warn: [] }))
  if (scan.blocked) {
    return { demoId, blocked: true, deny: scan.deny, success: false, results: [], error: 'constitution deny' }
  }

  const result = await runLocalFlow(nodes, edges, {
    autoResolveInput: true,
    onProgress: () => {},
    onPending: (p) => {
      pending.push(p)
      if (p.type === 'approval') {
        p.resolve({ action: 'approved', modifiedData: p.inputData })
      } else if (p.type === 'input') {
        p.resolve({ value: (p.config.default_value as string) || '' })
      } else if (p.type === 'breakpoint') {
        p.resolve(null)
      }
    },
  })

  const outputNodes = nodes.filter(n => (n.data?.originType as string) === 'output')
  const outputResults = outputNodes.map(n => ({
    id: n.id,
    name: n.data?.label as string,
    output: result.results.find(r => r.nodeId === n.id)?.output,
  }))

  const errors = result.results.filter(r => r.status === 'error' || r.output?.error)
  const nodeErrors = result.results
    .filter(r => r.output && typeof r.output.error === 'string' && r.output.error)
    .map(r => ({ node: r.nodeName, error: r.output!.error }))

  return {
    demoId,
    label: demoFlows[demoId].label,
    blocked: false,
    success: result.success,
    pendingCount: pending.length,
    outputResults,
    nodeErrors,
    allNodeCount: result.results.length,
    useRealLlm: opts?.useRealLlm,
  }
}

describe('demoFlows 用例逐个验证', () => {
  for (const demoId of DEMO_IDS) {
    it(`${demoId} (${demoFlows[demoId].label})`, async () => {
      const r = await runDemo(demoId)
      if (r.blocked) {
        throw new Error(`宪法拦截: ${JSON.stringify(r.deny)}`)
      }
      expect(r.success, `flow failed: ${JSON.stringify(r.nodeErrors)}`).toBe(true)
      // 至少有一个 output 节点有非空输出
      const hasOutput = r.outputResults.some(o => o.output && Object.keys(o.output).length > 0)
      expect(hasOutput, `output nodes empty: ${JSON.stringify(r.outputResults)}`).toBe(true)
      expect(r.nodeErrors, `node errors: ${JSON.stringify(r.nodeErrors)}`).toHaveLength(0)
    }, 60000)
  }
})
