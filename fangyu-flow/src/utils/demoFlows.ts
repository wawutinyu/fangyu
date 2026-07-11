export const demoFlows: Record<string, { label: string; desc?: string; data: unknown }> = {
  core: {
    label: '核心链路',
    desc: 'input → llm → json-parse → transform → code → output',
    data: {
      flow_id: '', flow_name: '核心链路',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '为一个 AI 流程编辑器写 3 个核心功能介绍，JSON 格式' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: 'LLM 生成', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '用 JSON 数组输出，格式：[{"name":"功能名","desc":"描述"}]', temperature: 0.5, max_tokens: 2048 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'json-parse', name: 'JSON 解析', category: '数据处理', config: { strict: true }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'transform', name: '格式转换', category: '数据处理', config: { expression: '{"count": len(data["result"]), "items": data["result"], "summary": f"共 {len(data[\'result\'])} 项"}' }, position: { x: 900, y: 220 } },
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
    desc: 'input → llm → condition → 两路 output',
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
      ],
      global_meta: { session_id: '', user_id: '' },
    },
  },
  loop: {
    label: '循环迭代',
    desc: 'input → loop → output',
    data: {
      flow_id: '', flow_name: '循环迭代',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'a,b,c' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'loop', name: '循环', category: '流程控制', config: { loop_var: 'item', max_iterations: 100 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
      ],
      links: [
        { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
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
    desc: 'input → llm → extract-memory → memory-write → memory-read → output',
    data: {
      flow_id: '', flow_name: '记忆存储',
      nodes: [
        { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '我的名字是张三，今年 28 岁' }, position: { x: 60, y: 220 } },
        { id: 'n2', type: 'llm', name: '提取信息', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '提取用户信息中的关键事实', temperature: 0.3, max_tokens: 256 }, position: { x: 340, y: 220 } },
        { id: 'n3', type: 'extract-memory', name: '提取记忆', category: '记忆存储', config: { memory_key: 'user_info' }, position: { x: 620, y: 220 } },
        { id: 'n4', type: 'memory-read', name: '读取记忆', category: '记忆存储', config: { memory_key: 'user_info' }, position: { x: 900, y: 220 } },
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
  ext: {
    label: '扩展能力',
    desc: 'input → search → http → prompt-assembly → output',
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
        { id: 'n3', type: 'mcp-call', name: 'MCP 调用', category: '工具集成', config: { server: '__internal__', tool_name: 'hello', args: '{}' }, position: { x: 620, y: 220 } },
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
        { id: 'n3', type: 'tool-call', name: '调用工具', category: '工具', config: { tool_name: '' }, position: { x: 620, y: 220 } },
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
        { id: 'n5', type: 'execute-skill', name: '执行技能', category: '技能', config: { skill_name: '' }, position: { x: 1180, y: 220 } },
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
}
