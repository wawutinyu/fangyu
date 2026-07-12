import { describe, it, expect } from 'vitest'
import { buildPipelineFromCanvas, hasCollaborationPipeline } from '../agentOrchestrate'
import type { AgentCanvasNode } from '../../store/agentSlice'

function makeAgent(id: string, label: string, skillId: string): AgentCanvasNode {
  return {
    id,
    label,
    type: 'a2a-agent',
    position: { x: 0, y: 0 },
    agentCard: {
      name: label,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false },
      skills: [{ id: skillId, name: skillId }],
      defaultInterface: { type: 'in-memory' },
    },
  }
}

describe('agentOrchestrate', () => {
  it('从 router 路由规则构建 pipeline', () => {
    const nodes: AgentCanvasNode[] = [
      makeAgent('agent_search', '搜索', 'web_search'),
      makeAgent('agent_analyze', '分析', 'analyze'),
      makeAgent('agent_summary', '汇总', 'summarize'),
      {
        id: 'router_main',
        label: '路由',
        type: 'a2a-router',
        position: { x: 0, y: 0 },
        routingRules: [
          { id: 'r1', sourceSkill: 'web_search', targetAgentId: 'agent_search', priority: 10 },
          { id: 'r2', sourceSkill: 'analyze', targetAgentId: 'agent_analyze', priority: 10 },
          { id: 'r3', sourceSkill: 'summarize', targetAgentId: 'agent_summary', priority: 10 },
        ],
      },
    ]
    const pipeline = buildPipelineFromCanvas(nodes)
    expect(pipeline).not.toBeNull()
    expect(pipeline!.map(s => s.skill_id)).toEqual(['web_search', 'analyze', 'summarize'])
    expect(hasCollaborationPipeline(nodes)).toBe(true)
  })

  it('无 router 时返回 null', () => {
    const nodes = [makeAgent('a1', 'A', 's1')]
    expect(buildPipelineFromCanvas(nodes)).toBeNull()
    expect(hasCollaborationPipeline(nodes)).toBe(false)
  })
})
