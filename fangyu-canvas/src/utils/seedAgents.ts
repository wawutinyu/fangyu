/** 官方种子 Agent — OpenClaw / Hermes / OpenCode 核心能力映射 */

import type { AgentCanvasNode, AgentCanvasEdge } from '../store/agentSlice'
import type { AgentCard, TrustConfig } from './a2aProtocol'
import { buildActionLoopFlow } from './actionLoopFlow'

export interface SeedAgentAsset {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  payload: { nodes: AgentCanvasNode[]; edges: AgentCanvasEdge[] }
}

const defaultTrust: TrustConfig = {
  enabled: true,
  algorithm: 'Ed25519',
  anchorSource: 'auto',
  policies: [],
  revocationList: [],
  auditEnabled: true,
  auditPath: './audit.log',
}

function chainFlow(
  steps: Array<{ id: string; type: string; label: string; config?: Record<string, unknown> }>,
) {
  const nodes = steps.map(s => ({
    id: s.id,
    data: { originType: s.type, label: s.label, config: s.config || {} },
  }))
  const edges = steps.slice(0, -1).map((s, i) => ({
    id: `e_${s.id}_${steps[i + 1].id}`,
    source: s.id,
    target: steps[i + 1].id,
    data: {},
  }))
  return { nodes, edges }
}

function llmFlow(systemPrompt: string, model = 'deepseek-v4-flash') {
  return chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'llm',
      type: 'llm',
      label: 'LLM',
      config: { model, system_prompt: systemPrompt, temperature: 0.4, max_tokens: 2048, auto_inject_memory: true },
    },
    { id: 'o', type: 'output', label: 'output' },
  ])
}

function agentNode(
  id: string,
  label: string,
  card: AgentCard,
  skillFlows: Record<string, { nodes: unknown[]; edges: unknown[] }>,
  opts?: { agentKind?: AgentCanvasNode['agentKind']; x?: number; y?: number },
): AgentCanvasNode {
  const kind = opts?.agentKind ?? 'hybrid'
  return {
    id,
    label,
    type: 'a2a-agent',
    agentKind: kind,
    position: { x: opts?.x ?? 120, y: opts?.y ?? 160 },
    agentCard: {
      ...card,
      metadata: { ...card.metadata, agentKind: kind, workerOnly: kind === 'worker' },
      interfaces: kind === 'worker'
        ? { user: { enabled: false }, a2a: { enabled: true } }
        : { user: { enabled: true }, a2a: { enabled: true } },
    },
    trust: { ...defaultTrust },
    skillFlows,
    timeout: 120000,
    retryCount: 1,
    lifecycle: 'sync',
    pushNotificationUrl: '',
    tenantId: '',
    extensions: {},
  }
}

/** OpenClaw：本地网关助手 — 记忆 + 工具 + 技能学习 + 主动巡检 */
function buildOpenClawAgent(): SeedAgentAsset {
  const card: AgentCard = {
    name: 'OpenClaw Gateway',
    description: '本地优先个人助手：持久记忆、A2A 网关、工具调用、技能学习与定时巡检（映射 OpenClaw 核心循环）',
    version: '1.0.0',
    capabilities: { streaming: true, pushNotifications: true },
    skills: [
      { id: 'assistant', name: '日常助手', description: '读取记忆 → 推理 → 调用工具 → 写回记忆', tags: ['chat', 'memory', 'tools'] },
      { id: 'heartbeat', name: '主动巡检', description: '定时触发状态摘要与待办提醒', tags: ['cron', 'proactive'] },
      { id: 'skill_manage', name: '技能管理', description: '从对话中学习并注册可复用技能', tags: ['skills'] },
    ],
    defaultInterface: { type: 'in-memory' },
    metadata: { seed: 'openclaw', reference: 'https://openclaw.ai', channels: ['webchat', 'a2a'] },
  }

  const assistantFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    { id: 'mem_r', type: 'memory', label: '读记忆', config: { operation: 'search', scope: 'user', limit: 8 } },
    {
      id: 'llm',
      type: 'llm',
      label: '推理',
      config: {
        model: 'deepseek-v4-flash',
        system_prompt: '你是 OpenClaw 风格本地助手。结合用户记忆与上下文作答；需要实时信息时说明将调用工具。',
        temperature: 0.5,
        max_tokens: 2048,
        auto_inject_memory: true,
      },
    },
    { id: 'tool', type: 'tool-call', label: '工具', config: { tool_name: 'web_search', args: '{"query":"{{input}}"}' } },
    { id: 'mem_w', type: 'memory', label: '写记忆', config: { operation: 'extract', scope: 'user', max_facts: 3 } },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const heartbeatFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    { id: 'tr', type: 'trigger', label: '定时触发', config: {} },
    {
      id: 'llm',
      type: 'llm',
      label: '巡检摘要',
      config: {
        model: 'deepseek-v4-flash',
        system_prompt: '生成简短巡检摘要：系统状态、待办、需要用户确认的事项。3-5 条 bullet。',
        temperature: 0.3,
        max_tokens: 512,
      },
    },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const skillManageFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'llm',
      type: 'llm',
      label: '提炼技能',
      config: {
        model: 'deepseek-v4-flash',
        system_prompt: '若对话包含可复用工作流，输出 skill 定义（name/description/steps）。否则回复 NO_SKILL。',
        temperature: 0.2,
        max_tokens: 1024,
      },
    },
    { id: 'learn', type: 'learn-skill', label: '学习技能', config: {} },
    { id: 'list', type: 'tool-call', label: '列出技能', config: { tool_name: 'skill_list', args: '{}' } },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const node = agentNode('seed_openclaw', 'OpenClaw 网关', card, {
    assistant: assistantFlow,
    heartbeat: heartbeatFlow,
    skill_manage: skillManageFlow,
  })

  return {
    id: 'official_agent_openclaw',
    name: 'OpenClaw Gateway',
    description: card.description!,
    category: '种子 Agent',
    tags: ['官方', 'openclaw', 'gateway', 'memory'],
    payload: { nodes: [node], edges: [] },
  }
}

/** Hermes：开发 Agent — 规划、终端、文件、技能、子任务委派 */
function buildHermesAgent(): SeedAgentAsset {
  const card: AgentCard = {
    name: 'Hermes Developer',
    description: '软件工程 Agent：规划 → 终端/文件工具 → 代码执行 → 技能沉淀（映射 Hermes 核心开发循环）',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [
      { id: 'code_task', name: '编码任务', description: 'LLM 规划 → shell/文件工具 → 验证', tags: ['terminal', 'files', 'code'] },
      { id: 'execute_code', name: '代码编排', description: '多步工具编排，减少上下文膨胀', tags: ['rpc', 'tools'] },
      { id: 'delegate', name: '子任务委派', description: '拆分子任务并并行执行技能', tags: ['subagent'] },
    ],
    defaultInterface: { type: 'in-memory' },
    metadata: { seed: 'hermes', reference: 'https://hermes-agent.org' },
  }

  const codeTaskFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'plan',
      type: 'llm',
      label: '规划',
      config: {
        model: 'deepseek-v4-flash',
        system_prompt: '你是 Hermes 风格开发 Agent。将任务拆为：读代码 → 改文件 → 跑命令 → 验证。输出 JSON：{"steps":[],"shell":"","files":[]}',
        temperature: 0.2,
        max_tokens: 1024,
      },
    },
    { id: 'shell', type: 'tool-call', label: '终端', config: { tool_name: 'shell_execution', args: '{"command":"echo plan received"}' } },
    { id: 'file', type: 'tool-call', label: '读文件', config: { tool_name: 'file_operations', args: '{"action":"list","path":"."}' } },
    { id: 'code', type: 'code', label: '整理结果', config: { code: "result = {'phase': 'act', 'status': 'ok', 'input': input}" } },
    { id: 'verify', type: 'execute-skill', label: '验证', config: { skill_name: 'greet' } },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const executeCodeFlow = buildActionLoopFlow('execute_code', 'execute_code', { useLlmPlan: true })

  const delegateFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'llm',
      type: 'llm',
      label: '拆分任务',
      config: {
        model: 'deepseek-v4-flash',
        system_prompt: '将复杂任务拆成最多 3 个可并行子任务，JSON 数组输出。',
        temperature: 0.3,
        max_tokens: 768,
      },
    },
    { id: 'mcp', type: 'mcp-call', label: 'MCP 调用', config: { tool_name: 'hello', server: '__internal__' } },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const node = agentNode('seed_hermes', 'Hermes 开发', card, {
    code_task: codeTaskFlow,
    execute_code: executeCodeFlow,
    delegate: delegateFlow,
  }, { agentKind: 'worker', y: 200 })

  return {
    id: 'official_agent_hermes',
    name: 'Hermes Developer',
    description: card.description!,
    category: '种子 Agent',
    tags: ['官方', 'hermes', 'coding', 'terminal'],
    payload: { nodes: [node], edges: [] },
  }
}

/** OpenCode：终端编码 Agent — build / plan 双模式 */
function buildOpenCodeAgent(): SeedAgentAsset {
  const card: AgentCard = {
    name: 'OpenCode Terminal',
    description: '终端优先编码 Agent：build 全权限开发 / plan 只读分析（映射 OpenCode build & plan 模式）',
    version: '1.0.0',
    capabilities: { streaming: true, pushNotifications: false },
    skills: [
      { id: 'build', name: 'Build 模式', description: '读写文件 + shell + 代码转换，完整开发权限', tags: ['build', 'write'] },
      { id: 'plan', name: 'Plan 模式', description: '只读分析代码库，输出变更计划', tags: ['plan', 'readonly'] },
      { id: 'general', name: 'General 子代理', description: '复杂搜索与多步推理', tags: ['subagent'] },
    ],
    defaultInterface: { type: 'in-memory' },
    metadata: { seed: 'opencode', reference: 'https://opencode.ai' },
  }

  const buildFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'llm',
      type: 'llm',
      label: 'Build',
      config: {
        model: 'deepseek-v4-flash',
        system_prompt: 'OpenCode build 模式：可编辑文件、运行 shell。先理解任务再行动，输出具体步骤。',
        temperature: 0.3,
        max_tokens: 2048,
      },
    },
    { id: 'read', type: 'tool-call', label: '读文件', config: { tool_name: 'file_operations', args: '{"action":"list","path":"."}' } },
    { id: 'shell', type: 'tool-call', label: 'Shell', config: { tool_name: 'shell_execution', args: '{"command":"git status"}' } },
    { id: 'code', type: 'code', label: '补丁', config: { code: "result = {'mode': 'build', 'done': True}" } },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const planFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'llm',
      type: 'llm',
      label: 'Plan',
      config: {
        model: 'deepseek-v4-flash',
        system_prompt: 'OpenCode plan 模式：只读分析，禁止修改文件。输出变更计划、风险与测试建议。',
        temperature: 0.2,
        max_tokens: 2048,
      },
    },
    { id: 'search', type: 'knowledge', label: '代码检索', config: { top_k: 5 } },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const generalFlow = llmFlow(
    'General 子代理：处理复杂搜索与多步推理，输出结构化结论与下一步建议。',
  )

  const node = agentNode('seed_opencode', 'OpenCode 终端', card, {
    build: buildFlow,
    plan: planFlow,
    general: generalFlow,
  }, { agentKind: 'hybrid', y: 240 })

  return {
    id: 'official_agent_opencode',
    name: 'OpenCode Terminal',
    description: card.description!,
    category: '种子 Agent',
    tags: ['官方', 'opencode', 'terminal', 'build', 'plan'],
    payload: { nodes: [node], edges: [] },
  }
}

/**
 * 验 · Tester — 专门测方隅自己是否还能用。
 * 日常入口：冒烟 → 单测 → 序→行；输出给人看的通过/失败摘要。
 */
function buildYanTesterAgent(): SeedAgentAsset {
  const card: AgentCard = {
    name: '验 · Tester',
    description: '方隅专用测试智能体：一键冒烟、跑单测、验序→行链路，输出可读报告。自己做产品时先问它「还能不能用」。',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    skills: [
      {
        id: 'smoke',
        name: '冒烟验收',
        description: '跑 happy_path_acceptance_check：观/律/场景/Worker 路由是否还在',
        tags: ['smoke', 'api', 'acceptance'],
      },
      {
        id: 'unit',
        name: '单元测试',
        description: 'pytest tests/unit — 快速确认核心逻辑没炸',
        tags: ['pytest', 'unit'],
      },
      {
        id: 'worker_loop',
        name: '序→行链路',
        description: '临时拉起 Worker，验证 shell + run_flow 派发闭环',
        tags: ['worker', 'happy-path'],
      },
      {
        id: 'report',
        name: '读报告',
        description: '把测试原始输出整理成通过/失败清单与建议',
        tags: ['report', 'chat'],
      },
    ],
    defaultInterface: { type: 'in-memory' },
    metadata: { seed: 'yan', role: 'tester', dogfood: true },
  }

  const smokeFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'shell',
      type: 'tool-call',
      label: '冒烟脚本',
      config: {
        tool_name: 'shell_execution',
        args: '{"command":"py scripts/happy_path_acceptance_check.py"}',
      },
    },
    {
      id: 'code',
      type: 'code',
      label: '判结果',
      config: {
        code: `raw = _input if isinstance(_input, dict) else {}
out = raw.get('stdout') or raw.get('result') or raw.get('output') or raw
text = out if isinstance(out, str) else str(out)
ok = '[OK]' in text and 'FAIL' not in text.split('[OK]')[0]
result = {'skill': 'smoke', 'passed': ok, 'summary': text[-2000:]}`,
      },
    },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const unitFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'shell',
      type: 'tool-call',
      label: 'pytest',
      config: {
        tool_name: 'shell_execution',
        args: '{"command":"py -m pytest tests/unit/ -q --tb=line"}',
      },
    },
    {
      id: 'code',
      type: 'code',
      label: '判结果',
      config: {
        code: `raw = _input if isinstance(_input, dict) else {}
out = raw.get('stdout') or raw.get('result') or raw.get('output') or raw
text = out if isinstance(out, str) else str(out)
ok = 'failed' not in text.lower() and 'error' not in text.lower().split('passed')[0]
if 'passed' in text.lower():
    ok = 'failed' not in text.lower()
result = {'skill': 'unit', 'passed': ok, 'summary': text[-2000:]}`,
      },
    },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const workerLoopFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'shell',
      type: 'tool-call',
      label: 'Worker Happy Path',
      config: {
        tool_name: 'shell_execution',
        args: '{"command":"py scripts/worker_happy_path.py --spawn-worker"}',
      },
    },
    {
      id: 'code',
      type: 'code',
      label: '判结果',
      config: {
        code: `raw = _input if isinstance(_input, dict) else {}
out = raw.get('stdout') or raw.get('result') or raw.get('output') or raw
text = out if isinstance(out, str) else str(out)
ok = 'OK: Studio -> Worker' in text or '[happy-path] OK' in text
result = {'skill': 'worker_loop', 'passed': ok, 'summary': text[-2000:]}`,
      },
    },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const reportFlow = chainFlow([
    { id: 's', type: 'start', label: 'start' },
    {
      id: 'llm',
      type: 'llm',
      label: '整理报告',
      config: {
        model: 'deepseek-v4-flash',
        system_prompt:
          '你是方隅「验」测试智能体。把用户粘贴的测试输出整理成中文报告：1) 结论（通过/失败）2) 失败项与原文摘录 3) 建议下一步（最多 3 条）。不要编造未出现的结果。',
        temperature: 0.2,
        max_tokens: 1024,
        auto_inject_memory: false,
      },
    },
    { id: 'o', type: 'output', label: 'output' },
  ])

  const node = agentNode(
    'seed_yan',
    '验 · Tester',
    card,
    {
      smoke: smokeFlow,
      unit: unitFlow,
      worker_loop: workerLoopFlow,
      report: reportFlow,
    },
    { agentKind: 'hybrid', x: 120, y: 280 },
  )

  return {
    id: 'official_agent_yan',
    name: '验 · Tester',
    description: card.description!,
    category: '种子 Agent',
    tags: ['官方', 'tester', 'smoke', 'dogfood', '验'],
    payload: { nodes: [node], edges: [] },
  }
}

export function buildSeedAgentAssets(): SeedAgentAsset[] {
  return [buildOpenClawAgent(), buildHermesAgent(), buildOpenCodeAgent(), buildYanTesterAgent()]
}

export function getSeedAgentById(id: string): SeedAgentAsset | undefined {
  return buildSeedAgentAssets().find(a => a.id === id)
}
