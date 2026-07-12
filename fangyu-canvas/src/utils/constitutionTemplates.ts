/** 宪法策略预设模板 — 可在设置面板一键应用 */

export interface ConstitutionPolicyTemplate {
  id: string
  name: string
  description: string
  policy: {
    id: string
    enabled: boolean
    description: string
    when: { node_type?: string }
    assert: { field?: string; op?: string; value?: unknown }
    on_fail: { rule?: string; action: 'warn' | 'deny'; message: string }
  }
}

export const CONSTITUTION_POLICY_TEMPLATES: ConstitutionPolicyTemplate[] = [
  {
    id: 'tpl-llm-model',
    name: 'LLM 必须配置 model',
    description: '未配置 model 的 LLM 节点发出警告',
    policy: {
      id: 'warn-missing-llm-model',
      enabled: true,
      description: 'LLM 节点应配置 model',
      when: { node_type: 'llm' },
      assert: { field: 'config.model', op: 'nonempty' },
      on_fail: { rule: 'policy_llm_model', action: 'warn', message: 'LLM 节点未配置 model: {label}' },
    },
  },
  {
    id: 'tpl-ssrf',
    name: '禁止 localhost HTTP',
    description: '阻止 SSRF：HTTP 节点不得访问 localhost',
    policy: {
      id: 'deny-localhost-http',
      enabled: true,
      description: '禁止 HTTP 访问 localhost',
      when: { node_type: 'http' },
      assert: { field: 'config.url', op: 'not_contains', value: 'localhost' },
      on_fail: { rule: 'policy_ssrf', action: 'deny', message: '禁止访问 localhost: {label}' },
    },
  },
  {
    id: 'tpl-loop-limit',
    name: '循环次数上限',
    description: 'loop 节点 max_iterations 不得超过 100',
    policy: {
      id: 'deny-loop-overflow',
      enabled: true,
      description: '循环次数不得超过 100',
      when: { node_type: 'loop' },
      assert: { field: 'config.max_iterations', op: 'lte', value: 100 },
      on_fail: { rule: 'policy_loop_limit', action: 'deny', message: '循环次数超限: {label}' },
    },
  },
  {
    id: 'tpl-tool-name',
    name: 'tool-call 必填工具名',
    description: 'tool-call 节点必须配置 tool_name',
    policy: {
      id: 'deny-empty-tool-name',
      enabled: true,
      description: 'tool-call 必须指定 tool_name',
      when: { node_type: 'tool-call' },
      assert: { field: 'config.tool_name', op: 'nonempty' },
      on_fail: { rule: 'policy_tool_name', action: 'deny', message: 'tool-call 未配置 tool_name: {label}' },
    },
  },
  {
    id: 'tpl-privacy-url',
    name: '隐私：禁止内网 IP',
    description: 'HTTP 节点 URL 不得包含 192.168./10./172. 内网段',
    policy: {
      id: 'deny-private-ip-http',
      enabled: true,
      description: '禁止 HTTP 访问内网 IP',
      when: { node_type: 'http' },
      assert: { field: 'config.url', op: 'not_contains', value: '192.168.' },
      on_fail: { rule: 'policy_ssrf', action: 'deny', message: '禁止访问内网地址: {label}' },
    },
  },
]

export function applyPolicyTemplate(
  templates: ConstitutionPolicyTemplate[],
  templateId: string,
  existing: { id: string }[],
): ConstitutionPolicyTemplate['policy'][] {
  const tpl = templates.find(t => t.id === templateId)
  if (!tpl) return []
  if (existing.some(p => p.id === tpl.policy.id)) return []
  return [tpl.policy]
}
