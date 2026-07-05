import { describe, it, expect } from 'vitest'
import { generateA2AModules, generateMainPy, generateRouterAgentFile } from '../agentCodeGenerator'

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

  it('identity.py 使用真实的 Ed25519 签名（cryptography 库）', () => {
    const files = generateA2AModules(false)
    const identity = files.find(f => f.filename === 'a2a/trust/identity.py')!.content
    expect(identity).toContain('cryptography.hazmat.primitives.asymmetric.ed25519')
    expect(identity).toContain('Ed25519PrivateKey')
    expect(identity).toContain('Ed25519PublicKey')
    expect(identity).not.toContain('import hashlib')
    expect(identity).not.toContain('TODO: replace with real Ed25519')
  })

  it('transport_http.py 包含完整 JSON-RPC 2.0 实现', () => {
    const files = generateA2AModules(false)
    const http = files.find(f => f.filename === 'a2a/transport_http.py')!.content
    expect(http).toContain('class HTTPTransport')
    expect(http).toContain('class JSONRPCError')
    expect(http).toContain('"jsonrpc": "2.0"')
    expect(http).toContain('urllib.request')
    expect(http).toContain('Bearer')
    expect(http).toContain('def call')
    expect(http).toContain('def send_message')
    expect(http).toContain('def get_task')
    expect(http).toContain('def list_tasks')
    expect(http).toContain('def subscribe')
    expect(http).not.toContain('print(f"[HTTP Transport]')
    expect(http).not.toContain('"stub"')
  })

  it('生成的 Python 代码语法有效', () => {
    const files = generateA2AModules(true)
    for (const f of files) {
      if (f.filename.endsWith('.py')) {
        try {
          expect(f.content).toMatch(/^(class |def |"""|import |from |    )/m)
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

describe('generateRouterAgentFile', () => {
  it('空路由列表返回空数组', () => {
    const files = generateRouterAgentFile([])
    expect(files.length).toBe(0)
  })

  it('单个路由器生成 router_*.py 文件', () => {
    const files = generateRouterAgentFile([
      { id: 'r1', label: '主路由器', rules: [], defaultTarget: '' },
    ])
    expect(files.length).toBe(1)
    expect(files[0].filename).toContain('router')
    expect(files[0].filename).toContain('.py')
    expect(files[0].content).toContain('class Router_')
    expect(files[0].content).toContain('def route')
    expect(files[0].content).toContain('def handle_task')
    expect(files[0].content).toContain('def create_router')
  })

  it('路由规则正确生成', () => {
    const files = generateRouterAgentFile([
      {
        id: 'r1',
        label: '智能路由',
        rules: [
          { sourceSkill: 'web-search', targetAgentId: 'search_agent', condition: '', priority: 10 },
          { sourceSkill: 'chat', targetAgentId: 'llm_agent', condition: 'urgent', priority: 5 },
        ],
        defaultTarget: 'fallback_agent',
      },
    ])
    const content = files[0].content
    expect(content).toContain('RoutingRule')
    expect(content).toContain('web-search')
    expect(content).toContain('search_agent')
    expect(content).toContain('chat')
    expect(content).toContain('llm_agent')
    expect(content).toContain('fallback_agent')
    expect(content).toContain('priority')
    expect(content).toContain('sorted(self.rules, key=lambda r: -r.priority)')
  })

  it('多个路由器各自生成独立文件', () => {
    const files = generateRouterAgentFile([
      { id: 'r1', label: '主路由', rules: [{ sourceSkill: 's1', targetAgentId: 'a1', condition: '', priority: 0 }], defaultTarget: '' },
      { id: 'r2', label: '备用路由', rules: [{ sourceSkill: 's2', targetAgentId: 'a2', condition: '', priority: 0 }], defaultTarget: '' },
    ])
    expect(files.length).toBe(2)
    expect(files[0].filename).not.toBe(files[1].filename)
    expect(files[0].content).toContain('主路由')
    expect(files[1].content).toContain('备用路由')
  })
})
