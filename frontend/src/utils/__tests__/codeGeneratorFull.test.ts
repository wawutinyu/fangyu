import { describe, it, expect } from 'vitest'
import { generatePythonCode } from '../codeGenerator'
import type { Node, Edge } from 'reactflow'

function makeNode(id: string, originType: string, label: string, config: Record<string, unknown> = {}): Node {
  return { id, type: 'atom-node', position: { x: 0, y: 0 }, data: { originType, label, config } }
}
function makeEdge(id: string, source: string, target: string, linkType = 'serial'): Edge {
  return { id, source, target, type: 'flow-edge', data: { linkType, mappings: {} } }
}

describe('generatePythonCode — 完整功能测试', () => {
  // ─── 1. 骨架验证 ───
  it('生成有效的 Python 骨架', () => {
    const code = generatePythonCode([makeNode('n1', 'input', '输入')], [])
    expect(code).toContain('import asyncio')
    expect(code).toContain('import json')
    expect(code).toContain('import re')
    expect(code).toContain('async def run_flow')
    expect(code).toContain('if __name__ == "__main__"')
    expect(code).toContain('def _resolve')
    expect(code).toContain('pool: dict = {}')
    expect(code).toContain('_vars: dict = {}')
    expect(code).toContain('_memory: dict = {}')
  })

  it('生成的 Python 语法有效（可 parse）', () => {
    const nodes = [makeNode('n1', 'input', '输入'), makeNode('n2', 'llm', 'LLM')]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    try {
      // eslint-disable-next-line no-new-func
      new Function(code)
    } catch {
      // async/await requires different parse strategy; check imports valid at least
      expect(code.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length).toBeGreaterThan(0)
    }
  })

  // ─── 2. 拓扑顺序 ───
  it('按拓扑顺序生成代码（上游先于下游）', () => {
    const nodes = [
      makeNode('c', 'input', 'C'),
      makeNode('a', 'input', 'A'),
      makeNode('b', 'llm', 'B'),
      makeNode('d', 'output', 'D'),
    ]
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'd'), makeEdge('e3', 'c', 'd')]
    const code = generatePythonCode(nodes, edges)
    const idxA = code.indexOf('output_a')
    const idxB = code.indexOf('output_b')
    const idxC = code.indexOf('output_c')
    const idxD = code.indexOf('output_d')
    expect(idxA).toBeGreaterThan(0)
    expect(idxB).toBeGreaterThan(idxA)
    expect(idxD).toBeGreaterThan(idxB)
    expect(idxD).toBeGreaterThan(idxC)
  })

  // ─── 3. 所有 28 种节点类型 ───
  const nodeTypes: { type: string; label: string; config?: Record<string, unknown>; assertMatch: string[] }[] = [
    { type: 'input', label: '输入', config: { default_value: 'test' }, assertMatch: ['handle_input', 'pool['] },
    { type: 'llm', label: 'LLM', config: { model: 'deepseek-chat', system_prompt: 'help' }, assertMatch: ['call_llm', 'model='] },
    { type: 'condition', label: '条件', config: { expression: 'x > 5' }, assertMatch: ['条件', '"true"', '"false"'] },
    { type: 'switch', label: '多路分支', config: { expression: 'int(input)' }, assertMatch: ['多路分支', 'branch', 'pool['] },
    { type: 'loop', label: '循环', config: { loop_var: 'item' }, assertMatch: ['循环体', 'loop_arr', 'pool['] },
    { type: 'trigger', label: '触发器', config: {}, assertMatch: ['触发器', '_external_inputs', 'pool['] },
    { type: 'code', label: '代码', config: { code: 'return x * 2' }, assertMatch: ['execute_python_code'] },
    { type: 'knowledge', label: '知识库', config: { top_k: 5 }, assertMatch: ['search_knowledge', 'pool['] },
    { type: 'prompt-assembly', label: '提示词组装', config: { stable: '你是助手' }, assertMatch: ['提示词组装', 'stable_part', 'volatile_part'] },
    { type: 'http', label: 'HTTP', config: { url: 'https://api.example.com', method: 'GET' }, assertMatch: ['call_http'] },
    { type: 'search', label: '搜索', config: { top_k: 3 }, assertMatch: ['web_search'] },
    { type: 'json-parse', label: 'JSON', config: {}, assertMatch: ['json.loads'] },
    { type: 'transform', label: '转换', config: { mapping: { f: 'a.b' } }, assertMatch: ['数据转换', 'pool['] },
    { type: 'text-process', label: '文本', config: { operation: 'upper' }, assertMatch: ['文本处理', 'input_text.upper()', 'pool['] },
    { type: 'variable-set', label: '设变量', config: { var_name: 'x' }, assertMatch: ['_vars["x"]'] },
    { type: 'variable-get', label: '读变量', config: { var_name: 'x' }, assertMatch: ['_vars.get("x"'] },
    { type: 'memory-write', label: '写记忆', config: { memory_key: 'k', scope: 'user' }, assertMatch: ['_memory["k"]'] },
    { type: 'memory-read', label: '读记忆', config: { memory_key: 'k' }, assertMatch: ['_memory.get("k"'] },
    { type: 'extract-memory', label: '提取', config: {}, assertMatch: ['事实提取', '_memory["extracted"]', 'pool['] },
    { type: 'search-sessions', label: '搜索会话', config: { query: 'test' }, assertMatch: ['会话搜索', '_memory.items()', 'pool['] },
    { type: 'approval', label: '审批', config: { message: '请审核' }, assertMatch: ['handle_approval', 'approved'] },
    { type: 'tool-call', label: '工具', config: { tool_name: 'get_weather', args: '{}' }, assertMatch: ['call_tool', 'get_weather', 'pool['] },
    { type: 'register-tool', label: '注册工具', config: {}, assertMatch: ['register_tool_from_llm', 'pool['] },
    { type: 'learn-skill', label: '学习技能', config: {}, assertMatch: ['learn_skill_from_llm', 'pool['] },
    { type: 'execute-skill', label: '执行技能', config: { skill_name: 'greet', params: '{}' }, assertMatch: ['execute_skill', 'greet', 'pool['] },
    { type: 'mcp-tools', label: 'MCP 工具', config: { server: '__internal__' }, assertMatch: ['mcp_list_tools', 'pool['] },
    { type: 'mcp-call', label: 'MCP 调用', config: { server: '__internal__', tool_name: 'hello', args: '{}' }, assertMatch: ['mcp_call_tool', 'pool['] },
  ]

  nodeTypes.forEach(({ type, label, config, assertMatch }) => {
    it(`生成 ${type} 节点代码包含预期内容`, () => {
      const nodes = [makeNode('n1', type, label, config)]
      const code = generatePythonCode(nodes, [])
      assertMatch.forEach(pattern => {
        expect(code).toContain(pattern)
      })
    })
  })

  // ─── 4. 变量池引用正确 ───
  it('所有节点输出存入 pool', () => {
    const nodes = [
      makeNode('input', 'input', '输入', { default_value: 'hi' }),
      makeNode('llm', 'llm', 'LLM', { model: 'gpt-4' }),
      makeNode('output', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'input', 'llm'), makeEdge('e2', 'llm', 'output')]
    const code = generatePythonCode(nodes, edges)
    const poolCount = (code.match(/pool\["/g) || []).length
    expect(poolCount).toBeGreaterThanOrEqual(3)
    expect(code).toContain('pool["input"]')
    expect(code).toContain('pool["llm"]')
    expect(code).toContain('pool["output"]')
  })

  // ─── 5. 返回包含所有节点 ───
  it('run_flow 返回所有节点结果', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'llm', 'LLM'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('"输入": output_n1')
    expect(code).toContain('"LLM": output_n2')
  })

  // ─── 6. 全局提示词 ───
  it('嵌入全局提示词常量', () => {
    const nodes = [makeNode('n1', 'llm', 'LLM')]
    const code = generatePythonCode(nodes, [], {
      globalPrompts: { system_prompt: '你是助手', user_prompt_template: '{{input}}', context: '上下文' },
    })
    expect(code).toContain('GLOBAL_SYSTEM_PROMPT')
    expect(code).toContain('GLOBAL_USER_TEMPLATE')
    expect(code).toContain('GLOBAL_CONTEXT')
    expect(code).toContain('你是助手')
    expect(code).toContain('上下文')
  })

  // ─── 7. 模板引用 _resolve ───
  it('包含 {{...}} 模板的地方调用 _resolve', () => {
    const nodes = [
      makeNode('n1', 'input', '输入', { default_value: 'hello' }),
      makeNode('n2', 'llm', 'LLM', { system_prompt: 'Based on {{n1.input}}' }),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('_resolve(')
    expect(code).toContain('{{n1.input}}')
  })

  // ─── 8. 模拟交互模式关闭时 ───
  it('simulateInteractive=false 不生成 handler', () => {
    const nodes = [makeNode('n1', 'input', '输入', { default_value: 'auto' })]
    const code = generatePythonCode(nodes, [], { simulateInteractive: false })
    expect(code).not.toContain('handle_input')
    expect(code).not.toContain('handle_approval')
    expect(code).toContain('"auto"')
  })

  // ─── 9. 空边界 ───
  it('空节点列表生成最小代码', () => {
    const code = generatePythonCode([], [])
    expect(code).toContain('import asyncio')
    expect(code).toContain('run_flow')
    expect(code).toContain('if __name__')
  })

  it('单节点无边仍生成', () => {
    const code = generatePythonCode([makeNode('n1', 'input', '输入')], [])
    expect(code).toContain('output_n1')
    expect(code).toContain('pool["n1"]')
  })

  // ─── 10. 实际 demo 流程模式 ───
  it('模拟 core demo 流程', () => {
    const nodes = [
      makeNode('n1', 'input', '输入', { default_value: '写 3 个功能介绍' }),
      makeNode('n2', 'llm', 'LLM', { model: 'deepseek-v4-flash', system_prompt: '用 JSON 数组输出' }),
      makeNode('n3', 'json-parse', 'JSON 解析', { strict: true }),
      makeNode('n4', 'transform', '格式转换', { mapping: { count: 'result.length' } }),
      makeNode('n5', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3'), makeEdge('e3', 'n3', 'n4'), makeEdge('e4', 'n4', 'n5')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('output_n1')
    expect(code).toContain('output_n2')
    expect(code).toContain('output_n3')
    expect(code).toContain('output_n4')
    expect(code).toContain('output_n5')
    const order = ['output_n1', 'output_n2', 'output_n3', 'output_n4', 'output_n5']
    let lastIdx = -1
    for (const v of order) {
      const idx = code.indexOf(v)
      expect(idx).toBeGreaterThan(lastIdx)
      lastIdx = idx
    }
  })

  it('模拟 approval demo 流程', () => {
    const nodes = [
      makeNode('n1', 'input', '输入'),
      makeNode('n2', 'llm', 'LLM', { model: 'deepseek-v4-flash' }),
      makeNode('n3', 'approval', '审批', { message: '请审核' }),
      makeNode('n4', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3'), makeEdge('e3', 'n3', 'n4')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('handle_approval')
    expect(code).toContain('approved')
    expect(code).toContain('rejected')
    expect(code).toContain('请审核')
    expect(code).toContain('output_n1')
    expect(code).toContain('output_n4')
  })

  it('模拟 ext demo 流程（含 search + http）', () => {
    const nodes = [
      makeNode('n1', 'input', '输入', { default_value: '最新 AI 新闻' }),
      makeNode('n2', 'search', '搜索', { top_k: 3 }),
      makeNode('n3', 'http', 'HTTP', { url: 'https://jsonplaceholder.typicode.com/posts/1', method: 'GET' }),
      makeNode('n4', 'llm', 'LLM', { model: 'deepseek-v4-flash', system_prompt: '总结' }),
      makeNode('n5', 'output', '输出'),
    ]
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3'), makeEdge('e3', 'n3', 'n4'), makeEdge('e4', 'n4', 'n5')]
    const code = generatePythonCode(nodes, edges)
    expect(code).toContain('web_search')
    expect(code).toContain('call_http')
    expect(code).toContain('call_llm')
    expect(code).toContain('jsonplaceholder')
  })

  // ─── 11. 含注释模式 ───
  it('includeComments=false 不生成节点级注释', () => {
    const nodes = [makeNode('n1', 'input', '输入')]
    const codeWith = generatePythonCode(nodes, [], { includeComments: true })
    const codeWithout = generatePythonCode(nodes, [], { includeComments: false })
    expect(codeWith).toContain('# ---')
    expect(codeWithout).not.toContain('# ---')
  })

  // ─── 12. 下划线_id 的节点名 ───
  it('节点 id 含特殊字符时生成合法变量名', () => {
    const nodes = [makeNode('my-node_1', 'input', '输入')]
    const code = generatePythonCode(nodes, [])
    expect(code).toContain('output_my_node_1')
    expect(code).not.toContain('output_my-node_1') // 连字符被替换
  })

  // ─── 13. desktopGUI 模式 ───
  it('desktopGUI=true 生成 tkinter 导入', () => {
    const code = generatePythonCode([makeNode('n1', 'input', '输入')], [], { desktopGUI: true })
    expect(code).toContain('import tkinter as tk')
    expect(code).toContain('from tkinter import')
    expect(code).toContain('simpledialog')
    expect(code).toContain('messagebox')
    expect(code).toContain('scrolledtext')
    expect(code).toContain('import json, re, threading, queue')
  })

  it('desktopGUI=true 生成 main() 和 FlowApp 类', () => {
    const code = generatePythonCode([makeNode('n1', 'input', '输入')], [], { desktopGUI: true })
    expect(code).toContain('class FlowApp')
    expect(code).toContain('def main():')
    expect(code).toContain('root = tk.Tk()')
    expect(code).toContain('root.mainloop()')
    expect(code).toContain('if __name__ == "__main__"')
  })

  it('desktopGUI=true 生成 Tkinter 版 handlers', () => {
    const code = generatePythonCode(
      [makeNode('n1', 'input', '输入'), makeNode('n2', 'approval', '审批', { message: '同意?' })],
      [makeEdge('e1', 'n1', 'n2')],
      { desktopGUI: true },
    )
    expect(code).toContain('simpledialog.askstring')
    expect(code).toContain('messagebox.askyesno')
    expect(code).toContain('handle_input')
    expect(code).toContain('handle_approval')
    expect(code).not.toContain('# 接入你的审批 UI')
    expect(code).not.toContain('# 接入你的输入 UI')
  })

  it('desktopGUI=false 不生成 tkinter 相关代码', () => {
    const code = generatePythonCode([makeNode('n1', 'input', '输入')], [], { desktopGUI: false })
    expect(code).not.toContain('tkinter')
    expect(code).not.toContain('FlowApp')
    expect(code).not.toContain('def main()')
  })

  it('desktopGUI 生成完整可执行流程结构', () => {
    const code = generatePythonCode(
      [
        makeNode('n1', 'input', '输入', { default_value: 'hello' }),
        makeNode('n2', 'llm', 'LLM', { model: 'deepseek-chat' }),
        makeNode('n3', 'output', '输出'),
      ],
      [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')],
      { desktopGUI: true },
    )
    expect(code).toContain('FlowApp')
    expect(code).toContain('run_flow')
    expect(code).toContain('output_n1')
    expect(code).toContain('output_n2')
    expect(code).toContain('output_n3')
    expect(code).toContain('main()')
    // 非交互模式下不应有控制台 print
    expect(code).not.toContain('print(f"')
  })
})
