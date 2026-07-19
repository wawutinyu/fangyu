export const demoFlows: Record<string, { label: string; desc?: string; category?: string; data: unknown }> = {
  full_tour: {
    label: '全功能画布游',
    category: '入门',
    desc: '离线可预览：输入→文本→分支→转换→代码→记忆→输出（不依赖外网 LLM）',
    data: {
      flow_id: '',
      flow_name: '全功能画布游',
      nodes: [
        { id: 'n1', type: 'input', name: '任务', category: '流程控制', config: { default_value: '方隅体验：把这句话做成摘要' }, position: { x: 40, y: 200 } },
        { id: 'n2', type: 'text-process', name: '文本处理', category: '数据操作', config: { operation: 'upper' }, position: { x: 220, y: 200 } },
        { id: 'n3', type: 'branch', name: '是否够长', category: '流程控制', config: { mode: 'bool', expression: 'len(str(input)) > 4' }, position: { x: 420, y: 200 } },
        { id: 'n4', type: 'transform', name: '字段映射', category: '数据操作', config: { mapping: { summary: 'result' } }, position: { x: 620, y: 120 } },
        { id: 'n5', type: 'code', name: '组装结果', category: 'AI 能力', config: { code: "const s = (input && (input.summary || input.result || input)) || ''\nreturn { ok: true, tour: 'full_tour', text: String(s).slice(0, 80), tip: '下一步可加载「体验全部功能」场景' }" }, position: { x: 820, y: 120 } },
        { id: 'n6', type: 'memory', name: '记一笔', category: '记忆存储', config: { operation: 'write', memory_key: 'full_tour_last', scope: 'session' }, position: { x: 1020, y: 120 } },
        { id: 'n7', type: 'output', name: '完成', category: '流程控制', config: {}, position: { x: 1220, y: 120 } },
        { id: 'n8', type: 'output', name: '太短', category: '流程控制', config: {}, position: { x: 620, y: 320 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'branch', sourceHandle: 'true', mappings: {} },
        { id: 'e38', sourceNodeId: 'n3', targetNodeId: 'n8', linkType: 'branch', sourceHandle: 'false', mappings: {} },
        { id: 'e45', sourceNodeId: 'n4', targetNodeId: 'n5', linkType: 'serial', mappings: {} },
        { id: 'e56', sourceNodeId: 'n5', targetNodeId: 'n6', linkType: 'serial', mappings: {} },
        { id: 'e67', sourceNodeId: 'n6', targetNodeId: 'n7', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  core: {
    label: '核心链路',
    desc: 'input → llm → json-parse → code → output',
    data: {
      flow_id: '', flow_name: '核心链路',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '为一个 AI 流程编辑器写 3 个核心功能介绍，JSON 格式' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: 'LLM 生成', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '用 JSON 数组输出，格式：[{"name":"功能名","desc":"描述"}]', temperature: 0.5, max_tokens: 2048 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'json-parse', name: 'JSON 解析', category: '数据处理', config: { strict: false }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'code', name: '格式转换', category: '数据处理', config: { code: "const items = (input && input.result) || []\nreturn { count: items.length, items, summary: `共 ${items.length} 项` }" }, position: { x: 900, y: 220 } },
        { id: 'n5', type: 'output', name: '输出', category: '流程控制', config: {}, position: { x: 1180, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
        { id: 'e45', sourceNodeId: 'n4', targetNodeId: 'n5', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  condition: {
    label: '条件分支',
    desc: 'input → condition → 两路 output',
    data: {
      flow_id: '', flow_name: '条件分支',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '5' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'condition', name: '条件判断', category: '流程控制', config: { expression: 'int(input) > 3' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: 'True 分支', category: '流程控制', config: {}, position: { x: 200, y: 420 } },
        { id: 'n4', type: 'output', name: 'False 分支', category: '流程控制', config: {}, position: { x: 480, y: 420 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'branch', sourceHandle: 'true', mappings: {} },
        { id: 'e24', sourceNodeId: 'n2', targetNodeId: 'n4', linkType: 'branch', sourceHandle: 'false', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  switch: {
    label: '多路分支',
    desc: 'input → switch → 3 路',
    data: {
      flow_id: '', flow_name: '多路分支',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '1' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'switch', name: '多路分支', category: '流程控制', config: { expression: 'int(input)' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '分支 0', category: '流程控制', config: {}, position: { x: 140, y: 420 } },
        { id: 'n4', type: 'output', name: '分支 1', category: '流程控制', config: {}, position: { x: 340, y: 420 } },
        { id: 'n5', type: 'output', name: '分支 2', category: '流程控制', config: {}, position: { x: 540, y: 420 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'branch', sourceHandle: 'branch_0', mappings: {} },
        { id: 'e24', sourceNodeId: 'n2', targetNodeId: 'n4', linkType: 'branch', sourceHandle: 'branch_1', mappings: {} },
        { id: 'e25', sourceNodeId: 'n2', targetNodeId: 'n5', linkType: 'branch', sourceHandle: 'branch_2', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  loop: {
    label: '循环迭代',
    desc: 'input → code → loop → output',
    data: {
      flow_id: '', flow_name: '循环迭代',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'a,b,c' }, position: { x: 60, y: 220 } },
        { id: 'n1b', type: 'code', name: '转数组', category: '代码', config: { code: "const val = (input && typeof input === 'object' && input.input != null) ? input.input : ''\nreturn String(val).split(',').map(x => x.trim()).filter(Boolean)" }, position: { x: 200, y: 220 } },
        { id: 'n2', type: 'loop', name: '循环', category: '流程控制', config: { loop_var: 'item', max_iterations: 100 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n1b', linkType: 'serial', mappings: {} },
        { id: 'e1b2', sourceNodeId: 'n1b', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  approval: {
    label: '人工审批',
    desc: 'input → approval → output',
    data: {
      flow_id: '', flow_name: '人工审批',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '{"amount": 1500, "reason": "报销"}' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'approval', name: '审批节点', category: '流程控制', config: { message: '请审核以下报销单' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  knowledge: {
    label: '知识库',
    desc: 'input → knowledge → llm → output',
    data: {
      flow_id: '', flow_name: '知识库',
      nodes: [
        { id: 'n1', type: 'input', name: '问题', category: '流程控制', config: { default_value: 'AI 代理是什么？' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'knowledge', name: '知识检索', category: 'AI 能力', config: { top_k: 3 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'llm', name: 'LLM 回答', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '根据上下文回答问题', temperature: 0.5, max_tokens: 1024 }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  search_web: {
    label: '联网搜索',
    desc: 'input → search → llm → output',
    data: {
      flow_id: '', flow_name: '联网搜索',
      nodes: [
        { id: 'n1', type: 'input', name: '问题', category: '流程控制', config: { default_value: '今天的 AI 新闻' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'search', name: '网络搜索', category: '工具集成', config: { top_k: 3 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'llm', name: 'LLM 总结', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '总结搜索结果', temperature: 0.5, max_tokens: 1024 }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  memory: {
    label: '记忆存储',
    desc: 'input → memory-write → memory-read → output',
    data: {
      flow_id: '', flow_name: '记忆存储',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '我的名字是张三，今年 28 岁' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'memory-write', name: '写入记忆', category: '记忆存储', config: { memory_key: 'user_info', scope: 'user' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'memory-read', name: '读取记忆', category: '记忆存储', config: { memory_key: 'user_info', scope: 'user' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  ext: {
    label: '扩展能力',
    desc: 'input → http → prompt-assembly → output',
    data: {
      flow_id: '', flow_name: '扩展能力',
      nodes: [
        { id: 'n1', type: 'input', name: '问题', category: '流程控制', config: { default_value: '2025 年 AI 趋势' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'http', name: 'HTTP 请求', category: '工具集成', config: { url: 'https://httpbin.org/post', method: 'POST', body: '{"query": "AI trends 2025"}' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'prompt-assembly', name: '提示词组装', category: 'AI 能力', config: { stable: '你是 AI 助手', context: '', volatile: '' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  text_processing: {
    label: '文本处理',
    desc: 'input → text-process → output',
    data: {
      flow_id: '', flow_name: '文本处理',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'Hello World!' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'text-process', name: '文本处理', category: '数据操作', config: { operation: 'upper' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  variable: {
    label: '变量操作',
    desc: 'input → variable-set → variable-get → output',
    data: {
      flow_id: '', flow_name: '变量操作',
      nodes: [
        { id: 'n1', type: 'input', name: '输入值', category: '流程控制', config: { default_value: '42' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'variable-set', name: '设变量', category: '数据操作', config: { var_name: 'my_var' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'variable-get', name: '读变量', category: '数据操作', config: { var_name: 'my_var' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  mcp: {
    label: 'MCP 调用',
    desc: 'input → mcp-tools → mcp-call → output',
    data: {
      flow_id: '', flow_name: 'MCP 调用',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'hello' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'mcp-tools', name: 'MCP 工具列表', category: '工具集成', config: { server: '__internal__' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'mcp-call', name: 'MCP 调用', category: '工具集成', config: { server: '__internal__', tool_name: 'current_time', args: '{}' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  tool_call: {
    label: '工具调用',
    desc: 'llm → tool-call → output',
    data: {
      flow_id: '', flow_name: '工具调用',
      nodes: [
        { id: 'n1', type: 'input', name: '指令', category: '流程控制', config: { default_value: '查询北京的天气' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: '识别工具', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '判断需要调用什么工具，输出工具名和参数 JSON', temperature: 0.3, max_tokens: 256 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'tool-call', name: '调用工具', category: '工具', config: { tool_name: 'skill_list', args: '{}' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  tool_skill: {
    label: '工具与技能',
    desc: 'register-tool → learn-skill → execute-skill → output',
    data: {
      flow_id: '', flow_name: '工具与技能',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '创建一个叫 weather_check 的工具，功能是检查天气' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: 'LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '输出工具定义格式', temperature: 0.3, max_tokens: 512 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'register-tool', name: '注册工具', category: '工具', config: {}, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'learn-skill', name: '学习技能', category: '技能', config: {}, position: { x: 900, y: 220 } },
        { id: 'n5', type: 'execute-skill', name: '执行技能', category: '技能', config: { skill_name: 'weather_check' }, position: { x: 1180, y: 220 } },
        { id: 'n6', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 1460, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
        { id: 'e45', sourceNodeId: 'n4', targetNodeId: 'n5', linkType: 'serial', mappings: {} },
        { id: 'e56', sourceNodeId: 'n5', targetNodeId: 'n6', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  trigger: {
    label: '触发器',
    desc: 'start → trigger → llm → output',
    data: {
      flow_id: '', flow_name: '触发器',
      nodes: [
        { id: 's', type: 'start', name: '开始', category: '流程控制', config: {}, position: { x: 60, y: 220 } },
        { id: 't', type: 'trigger', name: '触发器', category: '流程控制', config: {}, position: { x: 220, y: 220 } },
        { id: 'l', type: 'llm', name: 'LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '简洁回复收到的消息', temperature: 0.3, max_tokens: 256 }, position: { x: 400, y: 220 } },
        { id: 'o', type: 'output', name: '输出', category: '流程控制', config: {}, position: { x: 580, y: 220 } },
      ],
      links: [
        { id: 'e1', sourceNodeId: 's', targetNodeId: 't', linkType: 'serial', mappings: {} },
        { id: 'e2', sourceNodeId: 't', targetNodeId: 'l', linkType: 'serial', mappings: {} },
        { id: 'e3', sourceNodeId: 'l', targetNodeId: 'o', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  code_exec: {
    label: '代码执行',
    desc: 'input → llm → code → output',
    data: {
      flow_id: '', flow_name: '代码执行',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'hello fangyu' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: 'LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '用一句话回应', temperature: 0.3, max_tokens: 128 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'code', name: '处理', category: '代码', config: { code: "const text = (input && input.result) ? String(input.result) : JSON.stringify(input)\nreturn { processed: text.slice(0, 120), length: text.length }" }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '输出', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  var_text: {
    label: '变量与文本',
    desc: 'input → variable-set → variable-get → text-process → output',
    data: {
      flow_id: '', flow_name: '变量与文本',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'hello world' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'variable-set', name: '设变量', category: '数据操作', config: { var_name: 'msg' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'variable-get', name: '读变量', category: '数据操作', config: { var_name: 'msg' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'text-process', name: '大写', category: '数据操作', config: { operation: 'upper' }, position: { x: 900, y: 220 } },
        { id: 'n5', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 1180, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
        { id: 'e45', sourceNodeId: 'n4', targetNodeId: 'n5', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  memory_extract: {
    label: '记忆提取',
    desc: 'input → extract-memory → search-sessions → output',
    data: {
      flow_id: '', flow_name: '记忆提取',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '用户喜欢 Python 和 AI 编排' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'extract-memory', name: '提取事实', category: '记忆存储', config: { max_facts: 3 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'search-sessions', name: '搜索会话', category: '记忆存储', config: { query: 'Python', limit: 5 }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  prompt: {
    label: '提示词组装',
    desc: 'input → prompt-assembly → llm → output',
    data: {
      flow_id: '', flow_name: '提示词组装',
      nodes: [
        { id: 'n1', type: 'input', name: '问题', category: '流程控制', config: { default_value: '什么是 Agent？' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'prompt-assembly', name: '组装提示词', category: 'AI 能力', config: { stable: '你是 fangyu 助手', context: 'Agent 是可协作的智能体节点', volatile: '' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'llm', name: 'LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '', temperature: 0.5, max_tokens: 512 }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  role: {
    label: '角色扮演',
    desc: 'input → llm(角色) → output',
    data: {
      flow_id: '', flow_name: '角色扮演',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '介绍一下你自己' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: '角色 LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '你是一位资深工业自动化工程师，回答简洁专业', temperature: 0.6, max_tokens: 512 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  actionWorker: {
    label: 'Action Worker',
    desc: 'observe → plan → act → verify（画布模拟，内存 workspace）',
    data: {
      flow_id: '', flow_name: 'Action Worker',
      nodes: [
        { id: 'n1', type: 'input', name: '任务', category: '流程控制', config: { default_value: 'bundle mqtt trigger demo' }, position: { x: 60, y: 220 } },
        { id: 'observe', type: 'code', name: 'observe', category: '代码', config: { code: "const goal = (input && (input.input || input.query || input.message)) || 'demo task'\nconst files = (input && input.files) || []\nreturn { phase: 'observe', goal, files }" }, position: { x: 220, y: 220 } },
        { id: 'plan', type: 'code', name: 'plan', category: '代码', config: { code: "const _r=(input&&input.result&&typeof input.result==='object')?input.result:null;const ctx=_r?{...input,..._r}:(input||{})\nconst goal = ctx.goal || 'task'\nconst files = ctx.files || []\nconst action = files.includes('result.txt') ? 'verify_only' : 'write_result'\nreturn { phase: 'plan', goal, action, files }" }, position: { x: 400, y: 220 } },
        { id: 'act', type: 'code', name: 'act', category: '代码', config: { code: "const _r=(input&&input.result&&typeof input.result==='object')?input.result:null;const ctx=_r?{...input,..._r}:(input||{})\nconst action = ctx.action || ''\nconst goal = ctx.goal || ''\nlet files = ctx.files || []\nif (action === 'write_result') {\n  if (!files.includes('result.txt')) files = [...files, 'result.txt']\n  return { phase: 'act', acted: true, goal, files }\n}\nreturn { phase: 'act', acted: false, goal, files }" }, position: { x: 580, y: 220 } },
        { id: 'verify', type: 'code', name: 'verify', category: '代码', config: { code: "const _r=(input&&input.result&&typeof input.result==='object')?input.result:null;const ctx=_r?{...input,..._r}:(input||{})\nconst files = ctx.files || []\nconst ok = files.includes('result.txt')\nreturn { phase: 'verify', verified: ok, status: ok ? 'completed' : 'pending', files }" }, position: { x: 760, y: 220 } },
        { id: 'o', type: 'output', name: '输出', category: '流程控制', config: {}, position: { x: 940, y: 220 } },
      ],
      links: [
        { id: 'e0', sourceNodeId: 'n1', targetNodeId: 'observe', linkType: 'serial', mappings: {} },
        { id: 'e2', sourceNodeId: 'observe', targetNodeId: 'plan', linkType: 'serial', mappings: {} },
        { id: 'e3', sourceNodeId: 'plan', targetNodeId: 'act', linkType: 'serial', mappings: {} },
        { id: 'e4', sourceNodeId: 'act', targetNodeId: 'verify', linkType: 'serial', mappings: {} },
        { id: 'e5', sourceNodeId: 'verify', targetNodeId: 'o', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  start_end: {
    label: '开始与结束',
    category: '流程控制',
    desc: 'start → input → output → end',
    data: {
      flow_id: '', flow_name: '开始与结束',
      nodes: [
        { id: 's', type: 'start', name: '开始', category: '流程控制', config: {}, position: { x: 60, y: 220 } },
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'fangyu flow' }, position: { x: 220, y: 220 } },
        { id: 'n2', type: 'output', name: '输出', category: '流程控制', config: {}, position: { x: 400, y: 220 } },
        { id: 'e', type: 'end', name: '结束', category: '流程控制', config: {}, position: { x: 580, y: 220 } },
      ],
      links: [
        { id: 'e1', sourceNodeId: 's', targetNodeId: 'n1', linkType: 'serial', mappings: {} },
        { id: 'e2', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e3', sourceNodeId: 'n2', targetNodeId: 'e', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  branch_bool: {
    label: '统一分支(布尔)',
    category: '流程控制',
    desc: 'input → branch(bool) → 两路 output',
    data: {
      flow_id: '', flow_name: '统一分支(布尔)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '8' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'branch', name: '分支', category: '流程控制', config: { mode: 'bool', expression: 'int(input) >= 5' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: 'True', category: '流程控制', config: {}, position: { x: 200, y: 420 } },
        { id: 'n4', type: 'output', name: 'False', category: '流程控制', config: {}, position: { x: 480, y: 420 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'branch', sourceHandle: 'true', mappings: {} },
        { id: 'e24', sourceNodeId: 'n2', targetNodeId: 'n4', linkType: 'branch', sourceHandle: 'false', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  branch_multi: {
    label: '统一分支(多路)',
    category: '流程控制',
    desc: 'input → branch(multi) → 3 路 output',
    data: {
      flow_id: '', flow_name: '统一分支(多路)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '2' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'branch', name: '多路分支', category: '流程控制', config: { mode: 'multi', expression: 'int(input)', branch_count: 3 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '路 0', category: '流程控制', config: {}, position: { x: 140, y: 420 } },
        { id: 'n4', type: 'output', name: '路 1', category: '流程控制', config: {}, position: { x: 340, y: 420 } },
        { id: 'n5', type: 'output', name: '路 2', category: '流程控制', config: {}, position: { x: 540, y: 420 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'branch', sourceHandle: 'branch_0', mappings: {} },
        { id: 'e24', sourceNodeId: 'n2', targetNodeId: 'n4', linkType: 'branch', sourceHandle: 'branch_1', mappings: {} },
        { id: 'e25', sourceNodeId: 'n2', targetNodeId: 'n5', linkType: 'branch', sourceHandle: 'branch_2', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  loop_inner: {
    label: '循环(子流程)',
    category: '流程控制',
    desc: 'input → code → loop(子图) → output',
    data: {
      flow_id: '', flow_name: '循环(子流程)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'x,y,z' }, position: { x: 60, y: 220 } },
        { id: 'n1b', type: 'code', name: '转数组', category: '代码', config: { code: "const val = (input && input.input != null) ? input.input : ''\nreturn String(val).split(',').map(x => x.trim()).filter(Boolean)" }, position: { x: 200, y: 220 } },
        {
          id: 'n2', type: 'loop', name: '循环', category: '流程控制', config: { loop_var: 'item', max_iterations: 10 }, position: { x: 360, y: 220 },
          is_group: false,
          inner_nodes: [
            { id: 'li', type: 'code', name: '处理', config: { code: "const item = (input && input.item) || ''\nreturn { item: String(item).toUpperCase() }" } },
            { id: 'lo', type: 'output', name: '子输出', config: {} },
          ],
          inner_links: [
            { sourceNodeId: 'li', targetNodeId: 'lo', linkType: 'serial' },
          ],
        },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n1b', linkType: 'serial', mappings: {} },
        { id: 'e1b2', sourceNodeId: 'n1b', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  composite_demo: {
    label: '组合原子',
    category: '流程控制',
    desc: 'input → composite(upper) → output',
    data: {
      flow_id: '', flow_name: '组合原子',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'hello composite' }, position: { x: 60, y: 220 } },
        {
          id: 'g', type: 'composite-node', name: '大写子流程', category: '流程控制', config: {}, position: { x: 340, y: 220 },
          is_group: true,
          inner_nodes: [
            { id: 'gi', type: 'input', name: '子输入', config: { default_value: '' } },
            { id: 'gt', type: 'text-process', name: '大写', config: { operation: 'upper' } },
            { id: 'go', type: 'output', name: '子输出', config: {} },
          ],
          inner_links: [
            { sourceNodeId: 'gi', targetNodeId: 'gt', linkType: 'serial' },
            { sourceNodeId: 'gt', targetNodeId: 'go', linkType: 'serial' },
          ],
        },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'g', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'g', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  json_parse: {
    label: 'JSON 解析',
    category: '数据操作',
    desc: 'input → json-parse → output',
    data: {
      flow_id: '', flow_name: 'JSON 解析',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '{"name":"fangyu","version":1}' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'json-parse', name: '解析', category: '数据处理', config: { strict: false }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  transform_map: {
    label: '数据转换',
    category: '数据操作',
    desc: 'input → json-parse → transform → output',
    data: {
      flow_id: '', flow_name: '数据转换',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '{"items":[{"k":"a","v":1},{"k":"b","v":2}]}' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'json-parse', name: '解析', category: '数据处理', config: { strict: false }, position: { x: 280, y: 220 } },
        { id: 'n3', type: 'transform', name: '映射', category: '数据处理', config: { mapping: { first: 'result.items.0.k', count: 'result.items.1.v' } }, position: { x: 500, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 720, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  text_split: {
    label: '文本分割',
    category: '数据操作',
    desc: 'input → text-process(split) → output',
    data: {
      flow_id: '', flow_name: '文本分割',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'a,b,c,d' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'text-process', name: '分割', category: '数据操作', config: { operation: 'split', separator: ',' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  memory_unified: {
    label: '记忆操作(统一)',
    category: '记忆存储',
    desc: 'input → memory(write) → memory(read) → output',
    data: {
      flow_id: '', flow_name: '记忆操作(统一)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '偏好：深色主题' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'memory', name: '写记忆', category: '记忆存储', config: { operation: 'write', memory_key: 'ui_pref', scope: 'user' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'memory', name: '读记忆', category: '记忆存储', config: { operation: 'read', memory_key: 'ui_pref', scope: 'user' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  execute_node: {
    label: '执行(统一)',
    category: '工具集成',
    desc: 'input → execute(tool) → output',
    data: {
      flow_id: '', flow_name: '执行(统一)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'list skills' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'execute', name: '执行工具', category: '工具集成', config: { mode: 'tool', tool_name: 'skill_list', args: '{}' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  register_node: {
    label: '注册(统一)',
    category: '工具集成',
    desc: 'input → llm → register(tool) → output',
    data: {
      flow_id: '', flow_name: '注册(统一)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '定义 ping 工具' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: 'LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '输出工具 JSON', temperature: 0.2, max_tokens: 256 }, position: { x: 280, y: 220 } },
        { id: 'n3', type: 'register', name: '注册', category: '工具集成', config: { mode: 'tool' }, position: { x: 500, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 720, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  mcp_node: {
    label: 'MCP(统一)',
    category: '工具集成',
    desc: 'input → mcp(call) → output',
    data: {
      flow_id: '', flow_name: 'MCP(统一)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'now' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'mcp', name: 'MCP', category: '工具集成', config: { operation: 'call', server: '__internal__', tool_name: 'current_time', args: '{}' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  execute_skill: {
    label: '执行(技能模式)',
    category: '工具集成',
    desc: 'input → execute(skill) → output',
    data: {
      flow_id: '', flow_name: '执行(技能模式)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'run weather_check' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'execute', name: '执行技能', category: '工具集成', config: { mode: 'skill', skill_name: 'weather_check', params: '{}' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  register_skill: {
    label: '注册(技能模式)',
    category: '工具集成',
    desc: 'input → llm → register(skill) → output',
    data: {
      flow_id: '', flow_name: '注册(技能模式)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '定义 weather_check 技能' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: 'LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '输出技能 JSON', temperature: 0.2, max_tokens: 256 }, position: { x: 280, y: 220 } },
        { id: 'n3', type: 'register', name: '注册技能', category: '工具集成', config: { mode: 'skill' }, position: { x: 500, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 720, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  mcp_list: {
    label: 'MCP(列表模式)',
    category: '工具集成',
    desc: 'input → mcp(list) → output',
    data: {
      flow_id: '', flow_name: 'MCP(列表模式)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'list tools' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'mcp', name: 'MCP 列表', category: '工具集成', config: { operation: 'list', server: '__internal__' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  memory_ops: {
    label: '记忆(提取/搜索)',
    category: '记忆存储',
    desc: 'input → memory(extract) → memory(search) → output',
    data: {
      flow_id: '', flow_name: '记忆(提取/搜索)',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '用户偏好 Python 和 AI 编排' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'memory', name: '提取事实', category: '记忆存储', config: { operation: 'extract', max_facts: 3, scope: 'user' }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'memory', name: '搜索会话', category: '记忆存储', config: { operation: 'search', limit: 5, query: 'Python' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 900, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
        { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  agent_loop_advanced: {
    label: '整环执行器（高级）',
    category: 'Harness',
    desc: '可选捷径：单节点多轮 tool-loop。搭 harness 请用「节点编排 · Harness」',
    data: {
      flow_id: '',
      flow_name: '整环执行器（高级）',
      nodes: [
        {
          id: 'n1',
          type: 'input',
          name: '任务',
          category: '流程控制',
          config: { default_value: '（高级）仅当你明确需要整包 tool-loop 时用此节点' },
          position: { x: 80, y: 220 },
        },
        {
          id: 'loop',
          type: 'agent-loop',
          name: '整环',
          category: 'AI 能力',
          config: {
            max_turns: 12,
            toolbelt: 'coding',
            temperature: 0.2,
            max_tokens: 4096,
            model: 'deepseek-chat',
            require_plan: true,
            enable_task: true,
            agent_mode: 'build',
            shell_policy: 'ask',
          },
          position: { x: 360, y: 220 },
        },
        {
          id: 'o',
          type: 'output',
          name: '输出',
          category: '流程控制',
          config: {},
          position: { x: 640, y: 220 },
        },
      ],
      links: [
        { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'loop', linkType: 'serial', mappings: {} },
        { id: 'e2', sourceNodeId: 'loop', targetNodeId: 'o', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  opencode_harness: {
    label: '节点编排 · Harness',
    category: 'Harness',
    desc: '任务→记忆→计划→执行→记忆→验收→输出；用节点拼 harness，可继续插工具/分支/MCP',
    data: {
      flow_id: '',
      flow_name: '节点编排 · Harness',
      nodes: [
        {
          id: 'n1',
          type: 'input',
          name: '任务',
          category: '流程控制',
          config: { default_value: '在工作区创建 hello.md，内容写方隅 harness 验证' },
          position: { x: 40, y: 220 },
        },
        {
          id: 'mem_in',
          type: 'memory',
          name: '记目标',
          category: '记忆存储',
          config: { operation: 'write', memory_key: 'harness_goal', scope: 'session' },
          position: { x: 220, y: 220 },
        },
        {
          id: 'plan',
          type: 'llm',
          name: '计划',
          category: 'AI 能力',
          config: {
            model: 'deepseek-chat',
            temperature: 0.2,
            max_tokens: 1024,
            system_prompt:
              '你是编码 harness 的规划节点。根据任务拆成 2～5 步可执行计划，说明要用哪些工具（读/写/搜/shell）。不要假装已改文件。',
            prompt: '任务：{{input}}\n请输出分步计划。',
          },
          position: { x: 420, y: 220 },
        },
        {
          id: 'act',
          type: 'code',
          name: '执行',
          category: 'AI 能力',
          config: {
            // 与意图模板一致：后端沙箱跑 Python
            code:
              "src = _input if isinstance(_input, dict) else {'input': _input}\n"
              + "if isinstance(src.get('result'), dict):\n"
              + "    src = {**src, **src['result']}\n"
              + "goal = src.get('input') or src.get('goal') or src.get('result') or 'task'\n"
              + "if not isinstance(goal, str):\n"
              + "    goal = str(goal)\n"
              + "files = list(src.get('files') or [])\n"
              + "if 'hello.md' not in files:\n"
              + "    files = files + ['hello.md']\n"
              + "result = {'phase': 'act', 'goal': goal, 'files': files, 'acted': True,\n"
              + "          'note': '可在此后插入 tool-call / MCP / 分支'}\n",
          },
          position: { x: 620, y: 220 },
        },
        {
          id: 'mem_out',
          type: 'memory',
          name: '记结果',
          category: '记忆存储',
          config: { operation: 'write', memory_key: 'harness_last_act', scope: 'session' },
          position: { x: 820, y: 220 },
        },
        {
          id: 'verify',
          type: 'llm',
          name: '验收',
          category: 'AI 能力',
          config: {
            model: 'deepseek-chat',
            temperature: 0.2,
            max_tokens: 512,
            system_prompt:
              '你是验收员。根据上游结果说明是否达成任务、还缺哪步、建议在画布上再加哪个节点（记忆/工具/分支）。',
            prompt: '上游结果：{{input}}\n请验收并给出下一步画布改造建议。',
          },
          position: { x: 1020, y: 220 },
        },
        {
          id: 'o',
          type: 'output',
          name: '输出',
          category: '流程控制',
          config: {},
          position: { x: 1220, y: 220 },
        },
      ],
      links: [
        { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'mem_in', linkType: 'serial', mappings: {} },
        { id: 'e2', sourceNodeId: 'mem_in', targetNodeId: 'plan', linkType: 'serial', mappings: {} },
        { id: 'e3', sourceNodeId: 'plan', targetNodeId: 'act', linkType: 'serial', mappings: {} },
        { id: 'e4', sourceNodeId: 'act', targetNodeId: 'mem_out', linkType: 'serial', mappings: {} },
        { id: 'e5', sourceNodeId: 'mem_out', targetNodeId: 'verify', linkType: 'serial', mappings: {} },
        { id: 'e6', sourceNodeId: 'verify', targetNodeId: 'o', linkType: 'serial', mappings: {} },
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
}
