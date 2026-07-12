import { describe, it, expect } from 'vitest'
import { generateAgentPythonFiles } from '../agentCardGenerator'
import type { AgentCard } from '../a2aProtocol'

function makeAgentCard(name: string, skills: string[]): AgentCard {
  return {
    name,
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: skills.map(s => ({
      id: s, name: s, description: '',
      tags: [], inputMimeTypes: ['application/json'], outputMimeTypes: ['application/json'],
    })),
    defaultInterface: { type: 'in-memory' },
  }
}

describe('generateAgentPythonFiles', () => {
  it('空 agent 列表生成最小 __init__.py', () => {
    const files = generateAgentPythonFiles([])
    expect(files.length).toBe(1)
    expect(files[0].filename).toBe('__init__.py')
    expect(files[0].content).toContain('register_all')
  })

  it('单个 agent 生成 __init__.py + agent_ 文件', () => {
    const files = generateAgentPythonFiles([
      { id: 'a1', card: makeAgentCard('SearchAgent', ['web-search']) },
    ])
    const names = files.map(f => f.filename)
    expect(names).toContain('__init__.py')
    expect(names).toContain('agent_searchagent.py')
  })

  it('多个 agent 各自生成独立文件', () => {
    const files = generateAgentPythonFiles([
      { id: 'a1', card: makeAgentCard('Search', ['search']) },
      { id: 'a2', card: makeAgentCard('LLM', ['chat', 'generate']) },
      { id: 'a3', card: makeAgentCard('CodeRunner', ['code']) },
    ])
    expect(files.length).toBe(4)
    expect(files.find(f => f.filename === 'agent_search.py')).toBeTruthy()
    expect(files.find(f => f.filename === 'agent_llm.py')).toBeTruthy()
    expect(files.find(f => f.filename === 'agent_coderunner.py')).toBeTruthy()
  })

  it('agent 文件包含 handle_task 和 skill handler', () => {
    const files = generateAgentPythonFiles([
      { id: 'a1', card: makeAgentCard('Search', ['web-search']) },
    ])
    const agentFile = files.find(f => f.filename === 'agent_search.py')!.content
    expect(agentFile).toContain('class Agent_search')
    expect(agentFile).toContain('def handle_task')
    expect(agentFile).toContain('_handle_web_search')
    expect(agentFile).toContain('def create_agent')
  })

  it('agent 文件包含 AgentCard 构建', () => {
    const files = generateAgentPythonFiles([
      { id: 'a1', card: makeAgentCard('Translator', ['translate-zh-en', 'translate-en-zh']) },
    ])
    const agentFile = files.find(f => f.filename === 'agent_translator.py')!.content
    expect(agentFile).toContain('_build_card')
    expect(agentFile).toContain('translate-zh-en')
    expect(agentFile).toContain('translate-en-zh')
    expect(agentFile).toContain('AgentCapabilities')
    expect(agentFile).toContain('AgentSkill')
  })

  it('__init__.py 包含 register_all 和所有 agent import', () => {
    const files = generateAgentPythonFiles([
      { id: 'x', card: makeAgentCard('Alpha', ['s1']) },
      { id: 'y', card: makeAgentCard('Beta', ['s2']) },
    ])
    const init = files.find(f => f.filename === '__init__.py')!.content
    expect(init).toContain('def register_all()')
    expect(init).toContain('create_alpha')
    expect(init).toContain('create_beta')
    expect(init).toContain('AgentRegistry.register("x"')
    expect(init).toContain('AgentRegistry.register("y"')
  })
})
