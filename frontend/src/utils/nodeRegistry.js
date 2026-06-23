export const ATOM_TYPE = 'atom-node'
export const COMPOSITE_TYPE = 'composite-node'

export const PORT_TYPES = ['string', 'number', 'boolean', 'object', 'array', 'any']

export const NODE_CATEGORIES = [
  {
    name: '流程控制',
    color: '#1890ff',
    bgColor: '#e6f7ff',
    borderColor: '#91d5ff',
    nodes: [
      {
        type: 'start', name: '开始', desc: '流程入口，有且仅有一个',
        defaultConfig: {},
        inputSchema: [],
        outputSchema: [{ name: 'trigger', type: 'any', label: '触发信号' }],
        configSchema: [],
      },
      {
        type: 'end', name: '结束', desc: '流程出口',
        defaultConfig: {},
        inputSchema: [{ name: 'input', type: 'any', label: '输入', required: true }],
        outputSchema: [],
        configSchema: [],
      },
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
          model: 'gpt-4o', prompt: '', system_prompt: '', temperature: 0.7, max_tokens: 2048,
          thinking_mode: false, reasoning_effort: 'medium',
        },
        inputSchema: [
          { name: 'input', type: 'string', label: '用户输入', required: false },
          { name: 'system_prompt', type: 'string', label: '系统提示词', required: false },
          { name: 'context', type: 'array', label: '上下文消息', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'string', label: '生成结果' },
          { name: 'usage', type: 'object', label: 'Token 用量' },
        ],
        configSchema: [
          { key: 'model', label: '模型', type: 'select', default: 'gpt-4o',
            options: ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'claude-3.5-haiku', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner', 'moonshot-v1-8k'] },
          { key: 'prompt', label: '提示词模板', type: 'textarea', default: '', placeholder: '可用 {{query}} {{节点名.输出}} 引用变量', rows: 6 },
          { key: 'system_prompt', label: '系统提示词', type: 'textarea', default: '', placeholder: '系统级指令', rows: 3 },
          { key: 'temperature', label: '温度', type: 'number', default: 0.7, min: 0, max: 2, step: 0.1 },
          { key: 'max_tokens', label: '最大 Token', type: 'number', default: 2048, min: 1, max: 128000 },
          { key: 'thinking_mode', label: 'DeepSeek Think 模式', type: 'select', default: false, options: [false, true] },
          { key: 'reasoning_effort', label: '推理强度', type: 'select', default: 'medium', options: ['low', 'medium', 'high'] },
        ],
      },
      {
        type: 'code', name: '代码执行', desc: '运行 JavaScript 代码',
        defaultConfig: { code: '', timeout: 5000 },
        inputSchema: [
          { name: 'input', type: 'any', label: '输入数据', required: false },
          { name: 'params', type: 'object', label: '额外参数', required: false },
        ],
        outputSchema: [
          { name: 'result', type: 'any', label: '执行结果' },
          { name: 'error', type: 'string', label: '错误信息' },
        ],
        configSchema: [
          { key: 'code', label: '代码', type: 'code', default: '', placeholder: '// 使用 input 变量访问输入\n// return 输出结果', rows: 10 },
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
          { name: 'results', type: 'array', label: '检索结果列表' },
          { name: 'context', type: 'string', label: '拼接上下文' },
        ],
        configSchema: [
          { key: 'knowledge_base', label: '知识库', type: 'select', default: '', options: ['默认知识库', '产品文档', '技术文档', '客户问答'] },
          { key: 'top_k', label: '返回条数', type: 'number', default: 5, min: 1, max: 50 },
          { key: 'min_score', label: '最低匹配分', type: 'number', default: 0.5, min: 0, max: 1, step: 0.1 },
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
          { name: 'status', type: 'number', label: '状态码' },
          { name: 'data', type: 'any', label: '响应数据' },
          { name: 'headers', type: 'object', label: '响应头' },
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
          { name: 'result', type: 'object', label: '解析结果' },
          { name: 'error', type: 'string', label: '解析错误' },
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
          { name: 'results', type: 'array', label: '搜索结果' },
          { name: 'summary', type: 'string', label: '摘要' },
        ],
        configSchema: [
          { key: 'top_k', label: '返回条数', type: 'number', default: 5, min: 1, max: 20 },
          { key: 'source', label: '搜索源', type: 'select', default: 'web', options: ['web', 'news', 'academic'] },
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
        defaultConfig: { memory_key: '', scope: 'session' },
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
        defaultConfig: { memory_key: '', scope: 'session' },
        inputSchema: [
          { name: 'key', type: 'string', label: '记忆键', required: false },
          { name: 'value', type: 'any', label: '记忆内容', required: true },
        ],
        outputSchema: [
          { name: 'success', type: 'boolean', label: '是否成功' },
        ],
        configSchema: [
          { key: 'memory_key', label: '记忆键名', type: 'input', default: '', placeholder: '例如: user_preferences' },
          { key: 'scope', label: '作用域', type: 'select', default: 'session', options: ['session', 'user', 'global'] },
        ],
      },
    ],
  },
]

export const EDGE_TYPES = {
  serial: { name: '串行', color: '#333', style: 'solid' },
  branch: { name: '分支', color: '#fa8c16', style: 'dashed' },
  parallel: { name: '并行', color: '#722ed1', style: 'dotted' },
}

let _dynamicOptions = {}

export function setDynamicOptions(type, options) {
  if (type === 'variable-get') {
    _dynamicOptions['variable-get'] = options
  }
}

export function getNodeMeta(type) {
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

export function getDefaultConfig(type) {
  const meta = getNodeMeta(type)
  const config = {}
  for (const field of meta.configSchema) {
    config[field.key] = field.default
  }
  return config
}

export function getAllNodeTypes() {
  const types = []
  for (const cat of NODE_CATEGORIES) {
    for (const node of cat.nodes) {
      types.push(node.type)
    }
  }
  return types
}

export function getConfigSchema(type) {
  return getNodeMeta(type).configSchema
}

export function getInputSchema(type) {
  return getNodeMeta(type).inputSchema
}

export function getOutputSchema(type) {
  return getNodeMeta(type).outputSchema
}
