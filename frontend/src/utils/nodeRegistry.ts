export const ATOM_TYPE = 'atom-node'
export const COMPOSITE_TYPE = 'composite-node'

export interface PortSchema {
  name: string
  type: string
  label: string
  required?: boolean
}

export interface ConfigField {
  key: string
  label: string
  type: string
  default: unknown
  placeholder?: string
  options?: unknown[]
  min?: number
  max?: number
  step?: number
  rows?: number
  itemLabel?: string
  itemValue?: string
}

export interface NodeMeta {
  type: string
  name: string
  category: string
  categoryColor: string
  categoryBg: string
  desc: string
  defaultConfig: Record<string, unknown>
  inputSchema: PortSchema[]
  outputSchema: PortSchema[]
  configSchema: ConfigField[]
}

export interface CategoryNode {
  type: string
  name: string
  desc: string
  defaultConfig: Record<string, unknown>
  inputSchema: PortSchema[]
  outputSchema: PortSchema[]
  configSchema: ConfigField[]
}

export interface Category {
  name: string
  color: string
  bgColor: string
  borderColor: string
  nodes: CategoryNode[]
}

export const NODE_CATEGORIES: Category[] = [
  {
    name: '流程控制',
    color: '#1890ff',
    bgColor: '#e6f7ff',
    borderColor: '#91d5ff',
    nodes: [
      {
        type: 'condition', name: '条件分支', desc: '根据条件路由到不同分支',
        defaultConfig: { expression: '', branch_count: 2 },
        inputSchema: [{ name: 'input', type: 'any', label: '输入值', required: true }],
        outputSchema: [
          { name: 'true', type: 'any', label: 'True 分支' },
          { name: 'false', type: 'any', label: 'False 分支' },
        ],
        configSchema: [
          { key: 'expression', label: '条件表达式', type: 'code', default: '', placeholder: '例如: input > 10' },
          { key: 'branch_count', label: '分支数', type: 'number', default: 2, min: 2, max: 10 },
        ],
      },
      {
        type: 'switch', name: '多路分支', desc: '多值匹配路由',
        defaultConfig: { expression: '', cases: [] },
        inputSchema: [{ name: 'input', type: 'any', label: '输入值', required: true }],
        outputSchema: [{ name: 'default', type: 'any', label: '默认分支' }],
        configSchema: [
          { key: 'expression', label: '匹配表达式', type: 'code', default: '', placeholder: '例如: input.status' },
          { key: 'cases', label: '分支定义', type: 'key-value', default: [], itemLabel: '值', itemValue: '分支名' },
        ],
      },
      {
        type: 'loop', name: '循环', desc: '遍历数组，对每个元素执行子流程',
        defaultConfig: { loop_var: 'item', max_iterations: 100 },
        inputSchema: [
          { name: 'array', type: 'array', label: '数组', required: true },
          { name: 'body', type: 'any', label: '循环体输入' },
        ],
        outputSchema: [{ name: 'result', type: 'array', label: '结果数组' }],
        configSchema: [
          { key: 'loop_var', label: '循环变量名', type: 'input', default: 'item', placeholder: '例如: item' },
          { key: 'max_iterations', label: '最大迭代数', type: 'number', default: 100, min: 1, max: 10000 },
        ],
      },
      {
        type: 'trigger', name: '触发器', desc: '接收外部消息，自动启动流程',
        defaultConfig: {},
        inputSchema: [
          { name: 'message', type: 'string', label: '消息内容', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [],
      },
      {
        type: 'input', name: '输入', desc: '暂停流程，等待用户输入',
        defaultConfig: { default_value: '' },
        inputSchema: [],
        outputSchema: [{ name: 'input', type: 'any', label: '输出值' }],
        configSchema: [
          { key: 'default_value', label: '默认值', type: 'input', default: '', placeholder: '外部输入为空时的默认值' },
        ],
      },
      {
        type: 'approval', name: '人工审批', desc: '暂停流程，等待用户审批',
        defaultConfig: { timeout: 3600, message: '' },
        inputSchema: [{ name: 'input', type: 'any', label: '待审数据', required: true }],
        outputSchema: [
          { name: 'approved', type: 'any', label: '已通过' },
          { name: 'rejected', type: 'string', label: '拒绝原因' },
        ],
        configSchema: [
          { key: 'message', label: '审批说明', type: 'textarea', default: '', placeholder: '向用户展示的审批说明', rows: 4 },
          { key: 'timeout', label: '超时(秒)', type: 'number', default: 3600, min: 10, max: 86400 },
        ],
      },
      {
        type: 'output', name: '输出', desc: '流程输出节点',
        defaultConfig: {},
        inputSchema: [{ name: 'input', type: 'any', label: '输入', required: true }],
        outputSchema: [],
        configSchema: [],
      },
    ],
  },
  {
    name: 'AI 能力',
    color: '#722ed1',
    bgColor: '#f9f0ff',
    borderColor: '#d3adf7',
    nodes: [
      {
        type: 'llm', name: '大模型调用', desc: '调用语言模型进行推理',
        defaultConfig: {
          model: 'deepseek-v4-flash', prompt: '', system_prompt: '', temperature: 0.7, max_tokens: 2048,
          thinking_mode: false, reasoning_effort: 'medium', auto_inject_memory: false,
          top_p: 1, frequency_penalty: 0, presence_penalty: 0,
        },
        inputSchema: [
          { name: 'input', type: 'string', label: '用户输入', required: false },
          { name: 'system_prompt', type: 'string', label: '系统提示词', required: false },
          { name: 'context', type: 'array', label: '上下文消息', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'model', label: '模型', type: 'select', default: 'deepseek-v4-flash',
            options: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner', 'gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'claude-3.5-haiku', 'moonshot-v1-8k'] },
          { key: 'prompt', label: '提示词模板', type: 'textarea', default: '', placeholder: '可用 {{query}} {{节点名.输出}} 引用变量', rows: 6 },
          { key: 'system_prompt', label: '系统提示词', type: 'textarea', default: '', placeholder: '系统级指令', rows: 3 },
          { key: 'temperature', label: '温度', type: 'number', default: 0.7, min: 0, max: 2, step: 0.1 },
          { key: 'max_tokens', label: '最大 Token', type: 'number', default: 2048, min: 1, max: 128000 },
          { key: 'thinking_mode', label: 'DeepSeek Think 模式', type: 'select', default: false, options: [false, true] },
          { key: 'reasoning_effort', label: '推理强度', type: 'select', default: 'medium', options: ['low', 'medium', 'high'] },
          { key: 'auto_inject_memory', label: '自动注入记忆', type: 'select', default: true, options: [true, false] },
          { key: 'top_p', label: 'Top P', type: 'number', default: 1, min: 0, max: 1, step: 0.05 },
          { key: 'frequency_penalty', label: '频率惩罚', type: 'number', default: 0, min: -2, max: 2, step: 0.1 },
          { key: 'presence_penalty', label: '存在惩罚', type: 'number', default: 0, min: -2, max: 2, step: 0.1 },
        ],
      },
      {
        type: 'code', name: '代码执行', desc: '调用后端 Python 沙箱执行代码',
        defaultConfig: { code: '', timeout: 5000 },
        inputSchema: [
          { name: 'input', type: 'any', label: '输入数据', required: false },
          { name: 'params', type: 'object', label: '额外参数', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'code', label: '代码', type: 'code', default: '', placeholder: '# 使用 input 变量访问输入\n# return 输出结果', rows: 10 },
          { key: 'timeout', label: '超时 (ms)', type: 'number', default: 5000, min: 100, max: 60000 },
        ],
      },
      {
        type: 'knowledge', name: '知识库检索', desc: '从知识库检索相关内容',
        defaultConfig: { top_k: 5, min_score: 0.5, knowledge_base: '' },
        inputSchema: [
          { name: 'query', type: 'string', label: '查询文本', required: true },
          { name: 'filter', type: 'object', label: '过滤条件', required: false },
        ],
        outputSchema: [
          { name: 'results', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'knowledge_base', label: '知识库', type: 'select', default: '', options: ['默认知识库', '产品文档', '技术文档', '客户问答'] },
          { key: 'top_k', label: '返回条数', type: 'number', default: 5, min: 1, max: 50 },
          { key: 'min_score', label: '最低匹配分', type: 'number', default: 0.5, min: 0, max: 1, step: 0.1 },
        ],
      },
      {
        type: 'prompt-assembly', name: '提示词组装', desc: '三层提示词组装 (stable+context+volatile)',
        defaultConfig: { stable: '', context: '', volatile: '' },
        inputSchema: [
          { name: 'context', type: 'string', label: '上下文', required: false },
          { name: 'volatile', type: 'string', label: '即时指令', required: false },
        ],
        outputSchema: [
          { name: 'assembled', type: 'string', label: '组装结果' },
        ],
        configSchema: [
          { key: 'stable', label: '固定层 (stable)', type: 'textarea', default: '', placeholder: '身份定义、核心指令', rows: 6 },
          { key: 'context', label: '上下文默认模板', type: 'textarea', default: '', placeholder: '记忆快照、用户画像', rows: 3 },
          { key: 'volatile', label: '即时指令默认', type: 'textarea', default: '', placeholder: '当前轮指令', rows: 3 },
        ],
      },
    ],
  },
  {
    name: '工具集成',
    color: '#fa8c16',
    bgColor: '#fff7e6',
    borderColor: '#ffd591',
    nodes: [
      {
        type: 'http', name: 'HTTP 请求', desc: '发送 HTTP API 请求',
        defaultConfig: { url: '', method: 'GET', headers: {}, body: '', timeout: 10000 },
        inputSchema: [
          { name: 'url', type: 'string', label: '请求 URL', required: false },
          { name: 'body', type: 'any', label: '请求体', required: false },
          { name: 'headers', type: 'object', label: '请求头', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'url', label: 'URL', type: 'input', default: '', placeholder: 'https://api.example.com/endpoint' },
          { key: 'method', label: '请求方法', type: 'select', default: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          { key: 'headers', label: '请求头', type: 'key-value', default: {}, itemLabel: 'Header名', itemValue: '值' },
          { key: 'body', label: '请求体模板', type: 'textarea', default: '', placeholder: 'JSON 或模板字符串', rows: 4 },
          { key: 'timeout', label: '超时 (ms)', type: 'number', default: 10000, min: 100, max: 300000 },
        ],
      },
      {
        type: 'json-parse', name: 'JSON 解析', desc: '解析 JSON 字符串为对象',
        defaultConfig: { strict: true },
        inputSchema: [
          { name: 'source', type: 'string', label: 'JSON 字符串', required: true },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'strict', label: '严格模式', type: 'select', default: true, options: [true, false] },
        ],
      },
      {
        type: 'search', name: '搜索引擎', desc: '调用搜索引擎获取实时信息',
        defaultConfig: { top_k: 5, source: 'web' },
        inputSchema: [
          { name: 'query', type: 'string', label: '搜索关键词', required: true },
        ],
        outputSchema: [
          { name: 'results', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'top_k', label: '返回条数', type: 'number', default: 5, min: 1, max: 20 },
          { key: 'source', label: '搜索源', type: 'select', default: 'web', options: ['web', 'news', 'academic'] },
        ],
      },
      {
        type: 'tool-call', name: '工具调用', desc: '调用已注册的工具',
        defaultConfig: { tool_name: '' },
        inputSchema: [
          { name: 'tool_name', type: 'string', label: '工具名', required: false },
          { name: 'args', type: 'object', label: '参数', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'tool_name', label: '工具名', type: 'input', default: '', placeholder: '例如: web_search' },
          { key: 'args', label: '默认参数 (JSON)', type: 'code', default: '{}', placeholder: '{"key": "value"}' },
        ],
      },
      {
        type: 'register-tool', name: '工具注册', desc: '从 LLM 输出自动注册新工具',
        defaultConfig: {},
        inputSchema: [
          { name: 'llm_output', type: 'string', label: 'LLM 输出', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [],
      },
      {
        type: 'execute-skill', name: '技能执行', desc: '执行已学习的技能',
        defaultConfig: { skill_name: '' },
        inputSchema: [
          { name: 'skill_name', type: 'string', label: '技能名', required: false },
          { name: 'params', type: 'object', label: '参数', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'skill_name', label: '技能名', type: 'input', default: '', placeholder: '例如: my_skill' },
          { key: 'params', label: '默认参数 (JSON)', type: 'code', default: '{}', placeholder: '{"key": "value"}' },
        ],
      },
      {
        type: 'learn-skill', name: '技能学习', desc: '从 LLM 输出自动学习新技能',
        defaultConfig: {},
        inputSchema: [
          { name: 'llm_output', type: 'string', label: 'LLM 输出', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [],
      },
      {
        type: 'mcp-tools', name: 'MCP 工具列表', desc: '列出 MCP 服务器的可用工具',
        defaultConfig: { server: '__internal__' },
        inputSchema: [],
        outputSchema: [
          { name: 'tools', type: 'any', label: '工具列表' },
        ],
        configSchema: [
          { key: 'server', label: 'MCP 服务器', type: 'input', default: '__internal__', placeholder: '__internal__ 或外部服务器名' },
        ],
      },
      {
        type: 'mcp-call', name: 'MCP 工具调用', desc: '通过 MCP 协议调用工具',
        defaultConfig: { server: '__internal__', tool_name: '', args: '{}' },
        inputSchema: [
          { name: 'server', type: 'string', label: 'MCP 服务器', required: false },
          { name: 'tool_name', type: 'string', label: '工具名', required: false },
          { name: 'args', type: 'object', label: '参数', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'server', label: 'MCP 服务器', type: 'input', default: '__internal__', placeholder: '__internal__ 或外部服务器名' },
          { key: 'tool_name', label: '工具名', type: 'input', default: '', placeholder: '例如: web_search' },
          { key: 'args', label: '默认参数 (JSON)', type: 'code', default: '{}', placeholder: '{"key": "value"}' },
        ],
      },
    ],
  },
  {
    name: '数据操作',
    color: '#52c41a',
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
    nodes: [
      {
        type: 'variable-set', name: '设置变量', desc: '设置流程变量',
        defaultConfig: { var_name: '', var_value: '' },
        inputSchema: [
          { name: 'value', type: 'any', label: '变量值', required: true },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '设置结果' },
        ],
        configSchema: [
          { key: 'var_name', label: '变量名', type: 'input', default: '', placeholder: '例如: user_name' },
          { key: 'var_value', label: '默认值', type: 'input', default: '', placeholder: '可为空' },
        ],
      },
      {
        type: 'variable-get', name: '读取变量', desc: '读取流程变量',
        defaultConfig: { var_name: '' },
        inputSchema: [],
        outputSchema: [
          { name: 'value', type: 'any', label: '变量值' },
        ],
        configSchema: [
          { key: 'var_name', label: '变量名', type: 'select', default: '', options: [] },
        ],
      },
      {
        type: 'transform', name: '数据转换', desc: '转换数据格式',
        defaultConfig: { mapping: {} },
        inputSchema: [
          { name: 'source', type: 'any', label: '源数据', required: true },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '转换结果' },
        ],
        configSchema: [
          { key: 'mapping', label: '字段映射', type: 'key-value', default: {}, itemLabel: '新字段', itemValue: '源字段路径' },
        ],
      },
      {
        type: 'text-process', name: '文本处理', desc: '文本拼接、分割、替换',
        defaultConfig: { operation: 'concat', separator: '', pattern: '', replacement: '' },
        inputSchema: [
          { name: 'text', type: 'string', label: '源文本', required: true },
        ],
        outputSchema: [
          { name: 'result', type: 'string', label: '处理结果' },
        ],
        configSchema: [
          { key: 'operation', label: '操作', type: 'select', default: 'concat', options: ['concat', 'split', 'replace', 'trim', 'uppercase', 'lowercase'] },
          { key: 'separator', label: '分隔符', type: 'input', default: '' },
          { key: 'pattern', label: '匹配模式', type: 'input', default: '', placeholder: '正则或文本' },
          { key: 'replacement', label: '替换为', type: 'input', default: '' },
        ],
      },
    ],
  },
  {
    name: '记忆存储',
    color: '#13c2c2',
    bgColor: '#e6fffb',
    borderColor: '#87e8de',
    nodes: [
      {
        type: 'memory-read', name: '记忆读取', desc: '读取持久化记忆',
        defaultConfig: { memory_key: '', scope: 'user' },
        inputSchema: [
          { name: 'key', type: 'string', label: '记忆键', required: false },
        ],
        outputSchema: [
          { name: 'value', type: 'any', label: '记忆内容' },
        ],
        configSchema: [
          { key: 'memory_key', label: '记忆键名', type: 'input', default: '', placeholder: '例如: user_preferences' },
          { key: 'scope', label: '作用域', type: 'select', default: 'session', options: ['session', 'user', 'global'] },
        ],
      },
      {
        type: 'memory-write', name: '记忆写入', desc: '写入持久化记忆',
        defaultConfig: { memory_key: '', scope: 'user' },
        inputSchema: [
          { name: 'key', type: 'string', label: '记忆键', required: false },
          { name: 'value', type: 'any', label: '记忆内容', required: true },
        ],
        outputSchema: [
          { name: 'success', type: 'boolean', label: '是否成功' },
        ],
        configSchema: [
          { key: 'memory_key', label: '记忆键名', type: 'input', default: '', placeholder: '例如: user_preferences' },
          { key: 'scope', label: '作用域', type: 'select', default: 'user', options: ['session', 'user', 'global'] },
        ],
      },
      {
        type: 'extract-memory', name: '事实提取', desc: '从文本中提取事实并自动存入记忆',
        defaultConfig: { max_facts: 3, scope: 'user' },
        inputSchema: [
          { name: 'text', type: 'string', label: '源文本', required: true },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'max_facts', label: '最大提取数', type: 'number', default: 3, min: 1, max: 20 },
          { key: 'scope', label: '作用域', type: 'select', default: 'user', options: ['session', 'user', 'global'] },
        ],
      },
      {
        type: 'search-sessions', name: '会话搜索', desc: '全文搜索历史对话记录',
        defaultConfig: { limit: 10 },
        inputSchema: [
          { name: 'query', type: 'string', label: '搜索关键词', required: true },
          { name: 'session_id', type: 'string', label: '会话 ID', required: false },
        ],
        outputSchema: [
          { name: 'results', type: 'any', label: '输出' },
        ],
        configSchema: [
          { key: 'limit', label: '返回条数', type: 'number', default: 10, min: 1, max: 100 },
        ],
      },
    ],
  },
]

export const EDGE_TYPES: Record<string, { name: string; color: string; style: string }> = {
  serial: { name: '串行', color: '#333', style: 'solid' },
  branch: { name: '分支', color: '#fa8c16', style: 'dashed' },
  parallel: { name: '并行', color: '#722ed1', style: 'dotted' },
}

let _dynamicOptions: Record<string, string[]> = {}

export function setDynamicOptions(type: string, options: string[]) {
  if (type === 'variable-get') _dynamicOptions['variable-get'] = options
}

export function getNodeMeta(type: string): NodeMeta {
  if (type === 'composite-node') {
    return {
      type: 'composite-node',
      name: '组合原子',
      category: '流程控制',
      categoryColor: '#666',
      categoryBg: '#f5f5f5',
      desc: '多个节点封装的组合',
      defaultConfig: {},
      inputSchema: [{ name: 'input', type: 'any', label: '输入', required: false }],
      outputSchema: [{ name: 'output', type: 'any', label: '输出' }],
      configSchema: [
        { key: 'timeout', label: '超时 (ms)', type: 'number', default: 3000, min: 100 },
        { key: 'retry_times', label: '重试次数', type: 'number', default: 1, min: 0, max: 10 },
      ],
    }
  }

  for (const cat of NODE_CATEGORIES) {
    const found = cat.nodes.find(n => n.type === type)
    if (found) {
      const inputSchema = found.inputSchema.map(s => ({ ...s }))
      const outputSchema = found.outputSchema.map(s => ({ ...s }))
      const configSchema = found.configSchema.map(s => {
        const cs = { ...s, default: found.defaultConfig?.[s.key] ?? s.default }
        if (s.key === 'var_name' && type === 'variable-get' && _dynamicOptions['variable-get']?.length > 0) {
          cs.options = _dynamicOptions['variable-get']
        }
        return cs
      })
      return {
        type: found.type,
        name: found.name,
        category: cat.name,
        categoryColor: cat.color,
        categoryBg: cat.bgColor,
        desc: found.desc,
        defaultConfig: { ...found.defaultConfig },
        inputSchema,
        outputSchema,
        configSchema,
      }
    }
  }
  return {
    type, name: type, category: '未分类', categoryColor: '#666', categoryBg: '#f5f5f5',
    desc: '', defaultConfig: {},
    inputSchema: [], outputSchema: [],
    configSchema: [{ key: 'timeout', label: '超时 (ms)', type: 'number', default: 3000, min: 100 }],
  }
}

export function getDefaultConfig(type: string): Record<string, unknown> {
  const meta = getNodeMeta(type)
  const config: Record<string, unknown> = {}
  for (const field of meta.configSchema) {
    config[field.key] = field.default
  }
  return config
}

export function getAllNodeTypes(): string[] {
  const types: string[] = []
  for (const cat of NODE_CATEGORIES) {
    for (const node of cat.nodes) types.push(node.type)
  }
  return types
}

export function getConfigSchema(type: string): ConfigField[] {
  return getNodeMeta(type).configSchema
}

export function getInputSchema(type: string): PortSchema[] {
  return getNodeMeta(type).inputSchema
}

export function getOutputSchema(type: string): PortSchema[] {
  return getNodeMeta(type).outputSchema
}

const NO_INPUT_TYPES = new Set(['input', 'variable-get'])
export const UNIQUE_NODE_TYPES = new Set<string>()

export function filterUniqueTypes(types: string[], existingNodeTypes: string[]): string[] {
  const existing = new Set(existingNodeTypes)
  return types.filter(t => !UNIQUE_NODE_TYPES.has(t) || !existing.has(t))
}
const NO_OUTPUT_TYPES = new Set(['output'])

/**
 * 给定源节点类型，返回所有可兼容的目标节点类型列表（用于 + 按钮菜单过滤）
 */
export function getCompatibleTargets(sourceType: string): string[] {
  if (NO_OUTPUT_TYPES.has(sourceType)) return []

  const sourceMeta = getNodeMeta(sourceType)
  if (sourceMeta.outputSchema.length === 0) return []

  const allTypes = getAllNodeTypes()

  return allTypes.filter(targetType => {
    if (targetType === sourceType) return false
    if (NO_INPUT_TYPES.has(targetType)) return false

    const targetMeta = getNodeMeta(targetType)
    if (targetMeta.inputSchema.length === 0) return false

    const sourcePortTypes = sourceMeta.outputSchema.map(p => p.type)
    const targetPortTypes = targetMeta.inputSchema.map(p => p.type)

    return sourcePortTypes.some(st =>
      st === 'any' || targetPortTypes.some(tt => tt === 'any' || tt === st),
    )
  })
}
