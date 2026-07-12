import { describe, it, expect } from 'vitest'
import { buildSeedAgentAssets } from '../seedAgents'

describe('seedAgents', () => {
  it('exports OpenClaw, Hermes, OpenCode seed agents', () => {
    const assets = buildSeedAgentAssets()
    expect(assets).toHaveLength(3)
    const ids = assets.map(a => a.id)
    expect(ids).toContain('official_agent_openclaw')
    expect(ids).toContain('official_agent_hermes')
    expect(ids).toContain('official_agent_opencode')
    for (const a of assets) {
      expect(a.payload.nodes.length).toBeGreaterThan(0)
      const agent = a.payload.nodes[0] as { skillFlows?: Record<string, unknown> }
      expect(Object.keys(agent.skillFlows || {}).length).toBeGreaterThan(0)
    }
  })
})
