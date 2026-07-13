import { describe, it, expect } from 'vitest'
import { buildSeedAgentAssets } from '../seedAgents'

describe('seedAgents', () => {
  it('exports OpenClaw, Hermes, OpenCode, Yan seed agents', () => {
    const assets = buildSeedAgentAssets()
    expect(assets).toHaveLength(4)
    const ids = assets.map(a => a.id)
    expect(ids).toContain('official_agent_openclaw')
    expect(ids).toContain('official_agent_hermes')
    expect(ids).toContain('official_agent_opencode')
    expect(ids).toContain('official_agent_yan')
    for (const a of assets) {
      expect(a.payload.nodes.length).toBeGreaterThan(0)
      const agent = a.payload.nodes[0] as { skillFlows?: Record<string, unknown> }
      expect(Object.keys(agent.skillFlows || {}).length).toBeGreaterThan(0)
    }
    const yan = assets.find(a => a.id === 'official_agent_yan')!
    const yanNode = yan.payload.nodes[0] as { skillFlows?: Record<string, unknown>; agentCard?: { skills?: unknown[] } }
    expect(Object.keys(yanNode.skillFlows || {})).toEqual(
      expect.arrayContaining(['smoke', 'unit', 'worker_loop', 'report']),
    )
  })
})
