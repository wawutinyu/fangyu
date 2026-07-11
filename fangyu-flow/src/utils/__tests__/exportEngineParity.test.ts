import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import type { Node, Edge } from 'reactflow'
import { generatePythonCode } from '../codeGenerator'

const FIXTURE_DIR = resolve(__dirname, '../../../../tests/fixtures/export_parity')
const ENGINE_SCRIPT = resolve(__dirname, '../../../../tests/scripts/run_engine_fixture.py')

/** Windows 上 `python` 可能不可用，优先 py -3。 */
function pythonCmd(): string {
  for (const cmd of ['py -3', 'python3', 'python']) {
    try {
      execSync(`${cmd} -c "print(1)"`, { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 })
      return cmd
    } catch {
      /* try next */
    }
  }
  throw new Error('未找到 Python 解释器（尝试过 py -3 / python3 / python）')
}

const PYTHON = pythonCmd()

interface ParityFixture {
  name: string
  external_inputs?: Record<string, unknown>
  nodes: Array<{
    id: string
    label: string
    originType: string
    config?: Record<string, unknown>
    inner_nodes?: unknown[]
    inner_links?: unknown[]
  }>
  edges: Array<{ source: string; target: string; mappings?: Record<string, string> }>
  checks: Array<{ label: string; field: string; value: unknown }>
}

function loadFixtures(): ParityFixture[] {
  const { readdirSync } = require('fs') as typeof import('fs')
  return readdirSync(FIXTURE_DIR)
    .filter((f: string) => f.endsWith('.json'))
    .map((f: string) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf-8')))
}

function toCanvasNodes(raw: ParityFixture['nodes']): Node[] {
  return raw.map(n => ({
    id: n.id,
    type: 'atom-node',
    position: { x: 0, y: 0 },
    data: {
      originType: n.originType,
      label: n.label,
      config: n.config || {},
      ...(n.inner_nodes ? { inner_nodes: n.inner_nodes } : {}),
      ...(n.inner_links ? { inner_links: n.inner_links } : {}),
    },
  }))
}

function toCanvasEdges(raw: ParityFixture['edges']): Edge[] {
  return raw.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    type: 'flow-edge',
    data: { linkType: 'serial', mappings: e.mappings || {} },
  }))
}

function getField(outputs: Record<string, unknown>, field: string): unknown {
  let cur: unknown = outputs
  for (const part of field.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function runExportedFlow(fixture: ParityFixture): Record<string, Record<string, unknown>> {
  const code = generatePythonCode(toCanvasNodes(fixture.nodes), toCanvasEdges(fixture.edges), {
    simulateInteractive: false,
    desktopGUI: false,
  })
  const harness = `${code}

_vars = {}
_memory = {}
_external_inputs = ${JSON.stringify(fixture.external_inputs || {})}

import asyncio, json
results = asyncio.run(run_flow())
print("__PARITY__" + json.dumps(results, ensure_ascii=False))
`
  const dir = mkdtempSync(join(tmpdir(), 'fy-parity-'))
  const pyFile = join(dir, 'flow_parity.py')
  writeFileSync(pyFile, harness, 'utf-8')
  try {
    const out = execSync(`${PYTHON} "${pyFile}"`, { encoding: 'utf-8', timeout: 30000 })
    const marker = out.indexOf('__PARITY__')
    if (marker < 0) throw new Error(`导出代码执行无标记输出:\n${out}`)
    return JSON.parse(out.slice(marker + '__PARITY__'.length))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function runEngineFlow(fixture: ParityFixture): Record<string, Record<string, unknown>> {
  const payload = JSON.stringify(fixture)
  const out = execSync(`${PYTHON} "${ENGINE_SCRIPT}"`, {
    input: payload,
    encoding: 'utf-8',
    timeout: 30000,
  })
  const parsed = JSON.parse(out.trim()) as { success: boolean; outputs: Record<string, Record<string, unknown>> }
  if (!parsed.success) throw new Error(`引擎执行失败: ${out}`)
  return parsed.outputs
}

describe('export ↔ engine parity', () => {
  for (const fixture of loadFixtures()) {
    it(`${fixture.name}: 导出代码与引擎输出一致`, { timeout: 60000 }, () => {
      const exported = runExportedFlow(fixture)
      const engine = runEngineFlow(fixture)

      for (const check of fixture.checks) {
        const exportVal = getField(exported[check.label] || {}, check.field)
        const engineVal = getField(engine[check.label] || {}, check.field)
        expect(exportVal, `${check.label}.${check.field} (export)`).toEqual(check.value)
        expect(engineVal, `${check.label}.${check.field} (engine)`).toEqual(check.value)
        expect(exportVal, `${check.label}.${check.field} export vs engine`).toEqual(engineVal)
      }
    })
  }

  it('已知节点类型不应生成 TODO stub', () => {
    const types = ['condition', 'transform', 'json-parse', 'trigger', 'code', 'text-process']
    for (const originType of types) {
      const nodes: Node[] = [{
        id: 'n1', type: 'atom-node', position: { x: 0, y: 0 },
        data: { originType, label: originType, config: { expression: 'True', mapping: {}, code: 'pass', operation: 'upper', source: '{}' } },
      }]
      const code = generatePythonCode(nodes, [], { simulateInteractive: false })
      expect(code).not.toContain('TODO: 节点类型')
    }
  })
})
