/** 场景模板 API client */

export interface ScenarioMeta {
  id: string
  title: string
  summary: string
  policy_ids: string[]
  flow_template: string
  agent_template: string
  agent_kind: string
  featured?: boolean
}

/** 全平台体验包场景 id */
export const FULL_EXPERIENCE_SCENARIO_ID = 'full_experience'

export interface ScenarioInstantiateResult {
  scenario: { id: string; title: string; summary: string }
  flow: {
    flow: {
      flow_name?: string
      nodes: unknown[]
      links: unknown[]
    }
    template: string
    rationale?: string
    scan?: { blocked?: boolean }
  }
  agents: {
    graph: { nodes: unknown[]; edges: unknown[] }
    template?: string
    rationale?: string
  }
  policy_ids: string[]
  policies: unknown[]
  policies_applied: string[]
  bundle: {
    path: string
    name: string
    agent_id?: string
    agent_kind: string
    mqtt_topic?: string | null
  } | null
}

export async function fetchScenarioTemplates(): Promise<ScenarioMeta[]> {
  const res = await fetch('/api/v1/scenario/templates')
  if (!res.ok) throw new Error(`场景列表失败 (${res.status})`)
  const data = await res.json() as { scenarios: ScenarioMeta[] }
  return data.scenarios
}

export async function instantiateScenario(
  id: string,
  opts?: { apply_policies?: boolean; create_bundle?: boolean },
): Promise<ScenarioInstantiateResult> {
  let res: Response
  try {
    res = await fetch('/api/v1/scenario/instantiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        apply_policies: opts?.apply_policies ?? true,
        create_bundle: opts?.create_bundle ?? true,
      }),
    })
  } catch {
    throw new Error('连不上 API（请先在本机 Terminal 运行 ./dev.sh 或 python -m fangyu --server）')
  }
  if (!res.ok) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error('API 未启动或已退出（代理 ' + res.status + '）。请运行 ./dev.sh 后重试「体验全部」')
    }
    const detail = await res.text()
    throw new Error(detail || `实例化失败 (${res.status})`)
  }
  return res.json() as Promise<ScenarioInstantiateResult>
}
