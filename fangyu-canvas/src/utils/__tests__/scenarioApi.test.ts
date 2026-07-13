import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchScenarioTemplates, instantiateScenario } from '../scenarioApi'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('scenarioApi', () => {
  it('fetchScenarioTemplates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenarios: [{
          id: 'line_inspection',
          title: '产线巡检',
          summary: 'x',
          policy_ids: ['tpl-ssrf'],
          flow_template: 'action_loop',
          agent_template: 'worker_pair',
          agent_kind: 'worker',
        }],
      }),
    }))
    const list = await fetchScenarioTemplates()
    expect(list[0].id).toBe('line_inspection')
  })

  it('instantiateScenario posts id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scenario: { id: 'doc_assistant', title: '文档助手', summary: '' },
        flow: { flow: { nodes: [], links: [] }, template: 'doc_assistant' },
        agents: { graph: { nodes: [], edges: [] } },
        policy_ids: [],
        policies: [],
        policies_applied: [],
        bundle: null,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await instantiateScenario('doc_assistant')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/scenario/instantiate')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.id).toBe('doc_assistant')
  })
})
