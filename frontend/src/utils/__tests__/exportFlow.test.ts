import { describe, it, expect } from 'vitest'
import { getFlowExportBundle, getFlowExportFilenames } from '../exportFlow'
import type { Node, Edge } from 'reactflow'
import type { AgentCanvasNode } from '../../store/agentSlice'

function makeNode(id: string, originType: string, label: string, config: Record<string, unknown> = {}): Node {
  return { id, type: 'atom-node', position: { x: 0, y: 0 }, data: { originType, label, config } }
}
function makeEdge(id: string, source: string, target: string, linkType = 'serial'): Edge {
  return { id, source, target, type: 'flow-edge', data: { linkType, mappings: {} } }
}

function makeAgent(id: string, name: string): AgentCanvasNode {
  return {
    id, label: name, type: 'a2a-agent', position: { x: 0, y: 0 },
    agentCard: {
      name, version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false },
      skills: [{ id: 'skill-1', name: '技能1', description: '', tags: [] }],
      defaultInterface: { type: 'in-memory' },
    },
    trust: { enabled: true, algorithm: 'Ed25519', anchorSource: 'auto', policies: [], revocationList: [], auditEnabled: false, auditPath: '' },
    timeout: 30000, retryCount: 0, lifecycle: 'sync',
    pushNotificationUrl: '', tenantId: '', extensions: {},
  }
}

describe('getFlowExportBundle', () => {
  it('返回基础三件套 + extraFiles', () => {
    const bundle = getFlowExportBundle([], [])
    expect(bundle).toHaveProperty('pyFile')
    expect(bundle).toHaveProperty('buildBat')
    expect(bundle).toHaveProperty('requirementsTxt')
    expect(bundle).toHaveProperty('extraFiles')
    expect(bundle.extraFiles.length).toBe(1)
    expect(bundle.extraFiles[0].filename).toBe('build.sh')
  })

  it('pyFile 包含 desktopGUI 所需的 tkinter 代码', () => {
    const bundle = getFlowExportBundle([makeNode('n1', 'input', '输入')], [])
    expect(bundle.pyFile).toContain('import tkinter as tk')
    expect(bundle.pyFile).toContain('class FlowApp')
    expect(bundle.pyFile).toContain('def main():')
    expect(bundle.pyFile).toContain('if __name__ == "__main__"')
  })

  it('buildBat 包含 pyinstaller 编译命令', () => {
    const bundle = getFlowExportBundle([], [])
    expect(bundle.buildBat).toContain('pyinstaller')
    expect(bundle.buildBat).toContain('--onefile')
    expect(bundle.buildBat).toContain('--noconsole')
    expect(bundle.buildBat).toContain('flow_export.py')
  })

  it('requirementsTxt 包含 pyinstaller', () => {
    const bundle = getFlowExportBundle([], [])
    expect(bundle.requirementsTxt).toContain('pyinstaller')
  })

  it('复杂流程导出包含所有节点输出', () => {
    const nodes = [
      makeNode('n1', 'input', '输入', { default_value: 'hello' }),
      makeNode('n2', 'llm', 'LLM', { model: 'deepseek-chat' }),
      makeNode('n3', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')]
    const bundle = getFlowExportBundle(nodes, edges)
    expect(bundle.pyFile).toContain('output_n1')
    expect(bundle.pyFile).toContain('output_n2')
    expect(bundle.pyFile).toContain('output_n3')
    expect(bundle.pyFile).toContain('call_llm')
  })

  it('getFlowExportFilenames 返回正确文件名', () => {
    const names = getFlowExportFilenames()
    expect(names.pyFile).toBe('flow_export.py')
    expect(names.buildBat).toBe('build_exe.bat')
    expect(names.requirementsTxt).toBe('requirements.txt')
  })

  it('enableA2A=true 时 extraFiles 包含 a2a 模块', () => {
    const bundle = getFlowExportBundle([], [], { enableA2A: true })
    expect(bundle.extraFiles.length).toBeGreaterThanOrEqual(11) // a2a/* + main.py
    expect(bundle.extraFiles.some(f => f.filename === 'a2a/protocol.py')).toBe(true)
    expect(bundle.extraFiles.some(f => f.filename === 'a2a/trust/identity.py')).toBe(true)
    expect(bundle.extraFiles.some(f => f.filename === 'a2a/bus.py')).toBe(true)
    expect(bundle.extraFiles.some(f => f.filename === 'main.py')).toBe(true)
  })

  it('enableA2A=true + agentNodes 时包含 agent 代码', () => {
    const agents = [makeAgent('a1', 'Search'), makeAgent('a2', 'LLM')]
    const bundle = getFlowExportBundle([], [], { enableA2A: true }, agents)
    const agentFiles = bundle.extraFiles.filter(f => f.filename.startsWith('a2a/agents/'))
    expect(agentFiles.length).toBeGreaterThanOrEqual(3)
    expect(agentFiles.some(f => f.filename === 'a2a/agents/agent_search.py')).toBe(true)
    expect(agentFiles.some(f => f.filename === 'a2a/agents/agent_llm.py')).toBe(true)
  })

  it('enableA2A=false 时不包含 a2a 模块', () => {
    const agents = [makeAgent('a1', 'Test')]
    const bundle = getFlowExportBundle([], [], { enableA2A: false }, agents)
    expect(bundle.extraFiles.length).toBe(1)
    expect(bundle.extraFiles[0].filename).toBe('build.sh')
  })
})
