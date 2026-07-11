import { describe, it, expect } from 'vitest'
import { buildBundleExportPayload } from '../exportAgentBundle'
import type { AgentCanvasNode } from '../../store/agentSlice'

const mockAgent: AgentCanvasNode = {
  id: 'agent_1',
  label: 'TestWorker',
  type: 'a2a-agent',
  agentKind: 'worker',
  position: { x: 0, y: 0 },
  agentCard: {
    name: 'TestWorker',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'default', name: 'default' }],
    defaultInterface: { type: 'a2a' },
  },
  trust: {
    enabled: true,
    algorithm: 'Ed25519',
    anchorSource: 'auto',
    policies: [],
    revocationList: [],
    auditEnabled: true,
    auditPath: './audit.log',
  },
}

describe('buildBundleExportPayload', () => {
  it('builds worker bundle with action-first default skill', () => {
    const payload = buildBundleExportPayload(mockAgent, { a2aPort: 9100, requireEnvelope: true })
    expect(payload.name).toBe('TestWorker')
    expect(payload.agent_kind).toBe('worker')
    expect(payload.worker_only).toBe(true)
    expect(payload.require_envelope).toBe(true)
    expect(payload.a2a_port).toBe(9100)
    expect(payload.skills[0].nodes.some((n: { data: { originType: string } }) => n.data.originType === 'code')).toBe(true)
    expect(payload.agent_card.interfaces?.user?.enabled).toBe(false)
    expect(payload.agent_card.interfaces?.a2a?.enabled).toBe(true)
  })

  it('interface agent enables user interface', () => {
    const agent: AgentCanvasNode = {
      ...mockAgent,
      agentKind: 'interface',
      agentCard: { ...mockAgent.agentCard!, metadata: { agentKind: 'interface' } },
    }
    const payload = buildBundleExportPayload(agent)
    expect(payload.agent_kind).toBe('interface')
    expect(payload.worker_only).toBe(false)
    expect(payload.agent_card.interfaces?.user?.enabled).toBe(true)
  })
})
