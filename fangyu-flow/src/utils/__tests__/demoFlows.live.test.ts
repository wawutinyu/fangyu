/**
 * 真实后端集成测试 — 需后端运行在 8000 且已配置 API Key。
 * 运行: set FANGYU_LIVE=1 && npx vitest run src/utils/__tests__/demoFlows.live.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { demoFlows } from '../demoFlows'
import { convertFromExportFormat } from '../flowHelper'
import { runLocalFlow } from '../localExecutor'

const LIVE = process.env.FANGYU_LIVE === '1' || process.env.FANGYU_LIVE === 'true'
const BACKEND = process.env.FANGYU_BACKEND || 'http://127.0.0.1:8000'

async function backendReady(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND}/api/v1/knowledge/docs`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

function isMockLlm(text: unknown): boolean {
  if (typeof text !== 'string') return false
  return text.startsWith('[mock]') || text.includes('可视化编排","desc":"Flow/Agent 双画布')
}

function collectLlmOutputs(results: Awaited<ReturnType<typeof runLocalFlow>>['results']): string[] {
  const texts: string[] = []
  for (const r of results) {
    const out = r.output || {}
    if (typeof out.result === 'string') texts.push(out.result)
  }
  return texts
}

describe.skipIf(!LIVE)('demoFlows 真实后端验证', () => {
  let ready = false

  beforeAll(async () => {
    ready = await backendReady()
    if (!ready) {
      console.warn(`[live] 后端不可用: ${BACKEND}`)
    }
  })

  for (const demoId of Object.keys(demoFlows)) {
    it(`${demoId} (${demoFlows[demoId].label}) 真跑通`, async () => {
      if (!ready) return

      const { nodes, edges } = convertFromExportFormat(
        demoFlows[demoId].data as Parameters<typeof convertFromExportFormat>[0],
      ) as { nodes: Node[]; edges: Edge[] }

      const result = await runLocalFlow(nodes, edges, {
        autoResolveInput: true,
        onProgress: () => {},
        onPending: (p) => {
          if (p.type === 'approval') p.resolve({ action: 'approved', modifiedData: p.inputData })
          else if (p.type === 'input') p.resolve({ value: (p.config.default_value as string) || '' })
          else if (p.type === 'breakpoint') p.resolve(null)
        },
      })

      const nodeErrors = result.results.filter(
        r => r.output && typeof r.output.error === 'string' && r.output.error,
      )
      expect(result.success, JSON.stringify(nodeErrors)).toBe(true)
      expect(nodeErrors, JSON.stringify(nodeErrors)).toHaveLength(0)

      const hasLlm = nodes.some(n => (n.data?.originType as string) === 'llm')
      if (hasLlm) {
        const llmTexts = collectLlmOutputs(result.results)
        expect(llmTexts.length, 'LLM 节点应有输出').toBeGreaterThan(0)
        for (const t of llmTexts) {
          expect(isMockLlm(t), `LLM 走了 mock: ${t.slice(0, 80)}`).toBe(false)
        }
      }

      const outputNodes = nodes.filter(n => (n.data?.originType as string) === 'output')
      const hasOutput = outputNodes.some(n => {
        const out = result.results.find(r => r.nodeId === n.id)?.output
        return out && Object.keys(out).length > 0
      })
      expect(hasOutput, `${demoId} output 为空`).toBe(true)
    }, 120000)
  }
})
