import { describe, it, expect } from 'vitest'
import { generatePythonCode } from '../codeGenerator'
import type { Node, Edge } from 'reactflow'

function makeNode(id: string, originType: string, label: string, config: Record<string, unknown> = {}): Node {
  return {
    id, type: 'atom-node',
    position: { x: 0, y: 0 },
    data: { originType, label, config },
  }
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, type: 'flow-edge' }
}

describe('generatePythonCode', () => {
  it('generates runnable Python with input and llm', () => {
    const nodes = [
      makeNode('input', 'input', '输入'),
      makeNode('llm', 'llm', 'LLM'),
    ]
    const edges = [makeEdge('e1', 'input', 'llm')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('async def run_flow')
    expect(code).toContain('import asyncio')
    expect(code).toContain('output_input')
    expect(code).toContain('output_llm')
    expect(code).toContain('if __name__ == "__main__"')
  })

  it('generates LLM node with global prompts', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'llm', 'LLM', { model: 'deepseek-chat', prompt: 'test prompt' }),
      makeNode('n3', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')]
    const code = generatePythonCode(nodes, edges, {
      globalPrompts: { system_prompt: 'You are helpful', user_prompt_template: '{{input}}', context: 'Some context' },
    })
    expect(code).toContain('You are helpful')
    expect(code).toContain('Some context')
    expect(code).toContain('user_template')
    expect(code).toContain('system_prompt')
  })

  it('generates approval node with interactive handler', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'approval', '审批', { message: '请审核数据', timeout: 3600 }),
      makeNode('n3', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')]
    const code = generatePythonCode(nodes, edges, { simulateInteractive: true })
    expect(code).toContain('handle_approval')
    expect(code).toContain('approved')
    expect(code).toContain('rejected')
    expect(code).toContain('请审核数据')
  })

  it('generates condition node with branching logic', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'condition', '条件', { expression: 'input > 10' }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('input > 10')
    expect(code).toContain('_cond_pass')
    expect(code).toContain('"branch"')
  })

  it('generates http node', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'http', 'HTTP', { url: 'https://api.example.com', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"key":"value"}' }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('call_http')
    expect(code).toContain('https://api.example.com')
    expect(code).toContain('POST')
    expect(code).toContain('Content-Type')
    expect(code).toContain('pool["n2"]')
  })

  it('generates code node', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'code', '代码', { code: 'return input * 2', timeout: 3000 }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('execute_python_code')
    expect(code).toContain('return input * 2')
    expect(code).toContain('pool["n2"]')
  })

  it('generates search node', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'search', '搜索', { top_k: 10 }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('web_search')
    expect(code).toContain('top_k=10')
    expect(code).toContain('pool["n2"]')
  })

  it('generates variable-set and variable-get nodes', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'variable-set', '设置变量', { var_name: 'myVar' }),
      makeNode('n3', 'variable-get', '读取变量', { var_name: 'myVar' }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('_vars["myVar"]')
    expect(code).toContain('pool["n2"]')
    expect(code).toContain('pool["n3"]')
  })

  it('generates transform node', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'transform', '转换', { mapping: { new_field: 'source.path' } }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('数据转换')
    expect(code).toContain('pool["n2"]')
  })

  it('generates json-parse node', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'json-parse', 'JSON 解析'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('json.loads')
    expect(code).toContain('pool["n2"]')
  })

  it('generates memory-write and memory-read nodes', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'memory-write', '记忆写入', { memory_key: 'user_prefs', scope: 'user' }),
      makeNode('n3', 'memory-read', '记忆读取', { memory_key: 'user_prefs' }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('_memory["user_prefs"]')
    expect(code).toContain('pool["n2"]')
    expect(code).toContain('pool["n3"]')
  })

  it('generates output node', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('pool["n2"]')
  })

  it('generates _resolve for {{...}} in config strings', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'llm', 'LLM', { system_prompt: 'Based on {{n1.input}}, answer' }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('_resolve')
    expect(code).toContain('{{n1.input}}')
  })

  it('includes import re and _resolve helper', () => {
    const nodes = [makeNode('n1', 'input', '输入')]
    const code = generatePythonCode(nodes, [])
    expect(code).toContain('import re')
    expect(code).toContain('def _resolve')
  })

  it('generates pool storage for all node types', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'llm', 'LLM'),
      makeNode('n3', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')]
    const code = generatePythonCode(nodes, edges)
    const poolLines = (code.match(/pool\[/g) || []).length
    expect(poolLines).toBeGreaterThanOrEqual(3)
  })
})
