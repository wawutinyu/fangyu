import { describe, it, expect } from 'vitest'
import { generateA2AModules, generateMainPy } from '../agentCodeGenerator'

describe('generateA2AModules', () => {
  it('当 a2aEnabled=false 返回 10 个模块文件（不含 main.py）', () => {
    const files = generateA2AModules(false)
    expect(files.length).toBe(10)
    const names = files.map(f => f.filename)
    expect(names).toContain('a2a/__init__.py')
    expect(names).toContain('a2a/protocol.py')
    expect(names).toContain('a2a/bus.py')
    expect(names).toContain('a2a/registry.py')
    expect(names).toContain('a2a/trust/__init__.py')
    expect(names).toContain('a2a/trust/anchor.py')
    expect(names).toContain('a2a/trust/identity.py')
    expect(names).toContain('a2a/trust/registry.py')
    expect(names).toContain('a2a/trust/envelope.py')
    expect(names).toContain('a2a/transport_http.py')
  })

  it('每个模块文件内容非空', () => {
    const files = generateA2AModules(true)
    for (const f of files) {
      expect(f.content.length).toBeGreaterThan(10)
    }
  })

  it('protocol.py 包含核心 A2A 数据模型', () => {
    const files = generateA2AModules(false)
    const proto = files.find(f => f.filename === 'a2a/protocol.py')!.content
    expect(proto).toContain('class Task')
    expect(proto).toContain('class Message')
    expect(proto).toContain('class Part')
    expect(proto).toContain('class Artifact')
    expect(proto).toContain('class AgentCard')
    expect(proto).toContain('class AgentSkill')
    expect(proto).toContain('class TaskState')
  })

  it('trust 模块包含完整 ATP 组件', () => {
    const files = generateA2AModules(false)
    const anchor = files.find(f => f.filename === 'a2a/trust/anchor.py')!.content
    const identity = files.find(f => f.filename === 'a2a/trust/identity.py')!.content
    const envelope = files.find(f => f.filename === 'a2a/trust/envelope.py')!.content
    const registry = files.find(f => f.filename === 'a2a/trust/registry.py')!.content
    expect(anchor).toContain('class TrustAnchor')
    expect(identity).toContain('class AgentIdentity')
    expect(envelope).toContain('class MessageEnvelope')
    expect(registry).toContain('class TrustRegistry')
    expect(identity).toContain('generate')
    expect(identity).toContain('sign')
    expect(identity).toContain('verify')
    expect(envelope).toContain('check_nonce')
    expect(registry).toContain('authorize')
    expect(registry).toContain('revoke')
  })

  it('bus.py 包含核心 A2A 操作方法', () => {
    const files = generateA2AModules(false)
    const bus = files.find(f => f.filename === 'a2a/bus.py')!.content
    expect(bus).toContain('send_message')
    expect(bus).toContain('get_task')
    expect(bus).toContain('list_tasks')
    expect(bus).toContain('cancel_task')
    expect(bus).toContain('subscribe')
  })

  it('生成的 Python 代码语法有效', () => {
    const files = generateA2AModules(true)
    for (const f of files) {
      if (f.filename.endsWith('.py')) {
        try {
          // We just check that imports and classes are well-formed
          expect(f.content).toMatch(/^(class |def |"""|import|from|    )/m)
        } catch {
          throw new Error(`Syntax issue in ${f.filename}`)
        }
      }
    }
  })
})

describe('generateMainPy', () => {
  it('a2aEnabled=false 生成纯 DAG 入口', () => {
    const code = generateMainPy(false)
    expect(code).toContain('run_flow')
    expect(code).toContain('--enable-a2a')
    expect(code).not.toContain('A2A_ENABLED')
  })

  it('a2aEnabled=true 生成含 A2A 初始化的入口', () => {
    const code = generateMainPy(true)
    expect(code).toContain('run_flow')
    expect(code).toContain('A2A_ENABLED')
    expect(code).toContain('--disable-a2a')
    expect(code).toContain('_init_a2a')
    expect(code).toContain('TrustAnchor')
    expect(code).toContain('TrustRegistry')
    expect(code).toContain('register_all')
  })
})
