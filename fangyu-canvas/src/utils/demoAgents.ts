import type { AgentCanvasNode, AgentCanvasEdge } from '../store/agentSlice'
import type { AgentCard, TrustConfig } from './a2aProtocol'

const defaultTrust: TrustConfig = {
  enabled: true,
  algorithm: 'Ed25519',
  anchorSource: 'auto',
  policies: [],
  revocationList: [],
  auditEnabled: true,
  auditPath: './audit.log',
}

function llmFlow(systemPrompt: string, model = 'deepseek-chat') {
  return {
    nodes: [
      { id: 's', data: { originType: 'start', config: {}, label: '开始' } },
      {
        id: 'llm',
        data: {
          originType: 'llm',
          label: 'LLM',
          config: { model, system_prompt: systemPrompt, auto_inject_memory: false },
        },
      },
      { id: 'o', data: { originType: 'output', config: {}, label: '输出' } },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'llm', data: {} },
      { id: 'e2', source: 'llm', target: 'o', data: {} },
    ],
  }
}

/** 最小 AI 社会 Demo：搜索 → 分析 → 汇总，带路由协调 */
export function buildAgentSocietyDemo(): { nodes: AgentCanvasNode[]; edges: AgentCanvasEdge[] } {
  const searchCard: AgentCard = {
    name: '搜索助手',
    description: '负责检索与收集信息',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'web_search', name: '网络搜索', description: '根据用户问题检索相关信息并简要列出要点' }],
    defaultInterface: { type: 'in-memory' },
  }
  const analyzeCard: AgentCard = {
    name: '分析助手',
    description: '负责分析与提炼',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'analyze', name: '深度分析', description: '对给定信息进行结构化分析，输出关键洞察' }],
    defaultInterface: { type: 'in-memory' },
  }
  const summaryCard: AgentCard = {
    name: '汇总助手',
    description: '负责生成最终答复',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'summarize', name: '汇总输出', description: '将分析结果整理成清晰、可执行的中文建议' }],
    defaultInterface: { type: 'in-memory' },
  }

  const nodes: AgentCanvasNode[] = [
    {
      id: 'agent_search',
      label: '搜索 Agent',
      type: 'a2a-agent',
      position: { x: 80, y: 120 },
      agentCard: searchCard,
      trust: defaultTrust,
      skillFlows: { web_search: llmFlow('你是搜索助手。根据用户问题列出 3-5 条相关信息要点，简洁有条理。') },
    },
    {
      id: 'agent_analyze',
      label: '分析 Agent',
      type: 'a2a-agent',
      position: { x: 80, y: 280 },
      agentCard: analyzeCard,
      trust: defaultTrust,
      skillFlows: { analyze: llmFlow('你是分析助手。对用户给出的信息进行结构化分析，输出洞察与风险点。') },
    },
    {
      id: 'agent_summary',
      label: '汇总 Agent',
      type: 'a2a-agent',
      position: { x: 80, y: 440 },
      agentCard: summaryCard,
      trust: defaultTrust,
      skillFlows: { summarize: llmFlow('你是汇总助手。将信息整理成清晰的中文结论与行动建议。') },
    },
    {
      id: 'router_main',
      label: '协调路由',
      type: 'a2a-router',
      position: { x: 380, y: 280 },
      agentCard: {
        name: '协调路由',
        version: '1.0.0',
        capabilities: { streaming: false, pushNotifications: false },
        skills: [],
        defaultInterface: { type: 'in-memory' },
      },
      trust: defaultTrust,
      routingRules: [
        { id: 'r1', sourceSkill: 'web_search', targetAgentId: 'agent_search', priority: 10 },
        { id: 'r2', sourceSkill: 'analyze', targetAgentId: 'agent_analyze', priority: 10 },
        { id: 'r3', sourceSkill: 'summarize', targetAgentId: 'agent_summary', priority: 10 },
      ],
      defaultTarget: 'agent_search',
    },
  ]

  const edges: AgentCanvasEdge[] = [
    { id: 'ae1', source: 'router_main', target: 'agent_search', label: 'search' },
    { id: 'ae2', source: 'router_main', target: 'agent_analyze', label: 'analyze' },
    { id: 'ae3', source: 'router_main', target: 'agent_summary', label: 'summarize' },
  ]

  return { nodes, edges }
}
