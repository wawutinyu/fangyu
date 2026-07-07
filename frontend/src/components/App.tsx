import { Component, useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, ErrorInfo } from 'react'
import TopToolbar from './TopToolbar'
import NodeLibrary from './NodeLibrary'
import FlowCanvas, { type FlowCanvasHandle } from './FlowCanvas'
import ConfigPanel from './ConfigPanel'
import AgentCanvas from './AgentCanvas'
import AgentConfigPanel from './AgentConfigPanel'
import ExportDialog from './ExportDialog'
import BatchRunner from './BatchRunner'
import BottomPanel from './BottomPanel'
import SaveHistory from './SaveHistory'
import SettingsPanel from './SettingsPanel'
import { store } from '../store'
import { useAppSelector } from '../store/hooks'
import { toggleSettings, fetchSettings } from '../store/settingsSlice'
import { openFlowConfig } from '../store/flowSlice'
import { toggleHistory, saveFlowApi, fetchAllProjects, createProjectApi } from '../store/saveSlice'
import { convertToExportFormat } from '../utils/flowHelper'


class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ErrorBoundary caught:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#e00' }}>应用崩溃</h2>
          <pre style={{ background: '#fee', padding: 16, borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const flowCanvasRef = useRef<FlowCanvasHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportCodeVisible, setExportCodeVisible] = useState(false)
  const [exportedCode, setExportedCode] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [exportDialogVisible, setExportDialogVisible] = useState(false)
  const [exportNodes, setExportNodes] = useState<any[]>([])
  const [exportEdges, setExportEdges] = useState<any[]>([])
  const [view, setView] = useState<'flow' | 'agent'>('flow')
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('theme-dark') === 'true')
  const [batchVisible, setBatchVisible] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : '')
    localStorage.setItem('theme-dark', String(dark))
  }, [dark])

  const handleExportCode = useCallback(() => {
    const handle = flowCanvasRef.current
    if (!handle) return
    setExportedCode(handle.exportCode())
    setExportCodeVisible(true)
  }, [])

  const demoFlows: Record<string, { label: string; data: unknown }> = {
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
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '今天天气真好' }, position: { x: 60, y: 100 } },
          { id: 'n2', type: 'llm', name: '情感分析', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '判断用户情绪是积极还是消极，只输出 "positive" 或 "negative"', temperature: 0.3, max_tokens: 64 }, position: { x: 340, y: 100 } },
          { id: 'n3', type: 'condition', name: '条件判断', category: '流程控制', config: { expression: '"positive" in input' }, position: { x: 620, y: 100 } },
          { id: 'n4', type: 'output', name: '积极', category: '流程控制', config: {}, position: { x: 900, y: 40 } },
          { id: 'n5', type: 'output', name: '消极', category: '流程控制', config: {}, position: { x: 900, y: 160 } },
        ],
        links: [
          { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
          { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
          { id: 'e34', sourceNodeId: 'n3', targetNodeId: 'n4', sourceHandle: 'true', linkType: 'serial', mappings: {} },
          { id: 'e35', sourceNodeId: 'n3', targetNodeId: 'n5', sourceHandle: 'false', linkType: 'serial', mappings: {} },
        ],
        global_meta: { session_id: '', user_id: '' },
      },
    },
    var_text: {
      label: '变量与文本',
      desc: 'variable-set → variable-get → text-process → output',
      data: {
        flow_id: '', flow_name: '变量与文本',
        nodes: [
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: 'hello world, AI Flow' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'variable-set', name: '存入变量', category: '变量', config: { var_name: 'my_text', scope: 'global' }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'variable-get', name: '读取变量', category: '变量', config: { var_name: 'my_text', scope: 'global' }, position: { x: 620, y: 220 } },
          { id: 'n4', type: 'text-process', name: '文本处理', category: '数据处理', config: { operation: 'upper' }, position: { x: 900, y: 220 } },
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
    memory: {
      label: '记忆系统',
      desc: 'input → llm → memory-write → memory-read → output',
      data: {
        flow_id: '', flow_name: '记忆系统',
        nodes: [
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '我的名字是张三' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'llm', name: '提取信息', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '提取用户话中的关键事实，简短输出', temperature: 0.3, max_tokens: 256 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'memory-write', name: '写入记忆', category: '记忆', config: { memory_key: 'user_info', scope: 'user' }, position: { x: 620, y: 220 } },
          { id: 'n4', type: 'memory-read', name: '读取记忆', category: '记忆', config: { memory_key: 'user_info', scope: 'user' }, position: { x: 900, y: 220 } },
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
    ext: {
      label: '外部服务',
      desc: 'input → search → http → llm → output',
      data: {
        flow_id: '', flow_name: '外部服务',
        nodes: [
          { id: 'n1', type: 'input', name: '搜索词', category: '流程控制', config: { default_value: '最新 AI 新闻' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'search', name: '搜索引擎', category: '工具', config: { top_k: 3 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'http', name: 'HTTP 请求', category: '工具', config: { url: 'https://httpbin.org/post', method: 'POST', body: '{"query": "{{input}}"}' }, position: { x: 620, y: 220 } },
          { id: 'n4', type: 'llm', name: 'LLM 总结', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '总结搜索结果', temperature: 0.5, max_tokens: 1024 }, position: { x: 900, y: 220 } },
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
    role: {
      label: '角色扮演',
      desc: 'input → llm(with角色) → output',
      data: {
        flow_id: '', flow_name: '角色扮演',
        nodes: [
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '你是谁？' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'llm', name: 'AI 角色', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '你是 Sherlock Holmes，一位住在贝克街 221B 的大侦探。用他的语气和风格回答。', temperature: 0.8, max_tokens: 1024 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'output', name: '回答', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
        ],
        links: [
          { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
          { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        ],
        global_meta: { session_id: '', user_id: '' },
      },
    },
    switch: {
      label: '多路分支', desc: 'input → llm → switch → output',
      data: {
        flow_id: '', flow_name: '多路分支',
        nodes: [
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '3' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'llm', name: '生成数字', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '只输出一个 1-5 的数字', temperature: 0.3, max_tokens: 16 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'switch', name: '多路分支', category: '流程控制', config: { expression: 'int(input["result"])' }, position: { x: 620, y: 220 } },
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
    loop: {
      label: '循环', desc: 'loop → llm → output',
      data: {
        flow_id: '', flow_name: '循环',
        nodes: [
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '["A","B","C"]' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'loop', name: '循环', category: '流程控制', config: { loop_var: 'item', max_iterations: 10 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'llm', name: '处理元素', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '将输入转为大写输出', temperature: 0.3, max_tokens: 64 }, position: { x: 620, y: 220 } },
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
    trigger: {
      label: '触发器', desc: 'trigger → llm → output',
      data: {
        flow_id: '', flow_name: '触发器',
        nodes: [
          { id: 'n1', type: 'trigger', name: '触发器', category: '流程控制', config: {}, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'llm', name: 'LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '处理收到的消息', temperature: 0.5, max_tokens: 512 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'output', name: '结果', category: '流程控制', config: {}, position: { x: 620, y: 220 } },
        ],
        links: [
          { id: 'e12', sourceNodeId: 'n1', targetNodeId: 'n2', linkType: 'serial', mappings: {} },
          { id: 'e23', sourceNodeId: 'n2', targetNodeId: 'n3', linkType: 'serial', mappings: {} },
        ],
        global_meta: { session_id: '', user_id: '' },
      },
    },
    code_exec: {
      label: '代码执行', desc: 'llm → code → output',
      data: {
        flow_id: '', flow_name: '代码执行',
        nodes: [
          { id: 'n1', type: 'input', name: '需求', category: '流程控制', config: { default_value: '写一个斐波那契数列函数 f(n)，计算 f(10)' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'llm', name: 'LLM 写代码', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '只输出可执行的 Python 代码，不要解释', temperature: 0.3, max_tokens: 2048 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'code', name: '执行代码', category: '数据处理', config: { code: 'exec(_input)\nresult = f(10)' }, position: { x: 620, y: 220 } },
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
    memory_extract: {
      label: '记忆提取', desc: 'memory-write → extract-memory → search-sessions → output',
      data: {
        flow_id: '', flow_name: '记忆提取',
        nodes: [
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '今天学习了 Python 装饰器' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'memory-write', name: '写入记忆', category: '记忆', config: { memory_key: 'daily_log', scope: 'user' }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'extract-memory', name: '提取记忆', category: '记忆', config: { memory_key: 'daily_log', scope: 'user' }, position: { x: 620, y: 220 } },
          { id: 'n4', type: 'search-sessions', name: '搜索会话', category: '记忆', config: { query: 'Python' }, position: { x: 900, y: 220 } },
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
    knowledge: {
      label: '知识库', desc: 'input → knowledge → llm → output',
      data: {
        flow_id: '', flow_name: '知识库',
        nodes: [
          { id: 'n1', type: 'input', name: '查询', category: '流程控制', config: { default_value: 'AI 代理是什么' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'knowledge', name: '知识库', category: '知识', config: { knowledge_base: '默认知识库', top_k: 3 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'llm', name: 'LLM 回答', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '基于知识库结果回答', temperature: 0.5, max_tokens: 1024 }, position: { x: 620, y: 220 } },
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
      label: '提示词组装', desc: 'input → prompt-assembly → llm → output',
      data: {
        flow_id: '', flow_name: '提示词组装',
        nodes: [
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '用 Python 写一个快速排序' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'prompt-assembly', name: '组装提示词', category: '提示词', config: { stable: '你是一个编程专家', context: '', volatile: '' }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'llm', name: 'LLM', category: 'AI 能力', config: { model: 'deepseek-v4-flash', temperature: 0.5, max_tokens: 2048 }, position: { x: 620, y: 220 } },
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
    approval: {
      label: '审批', desc: 'input → llm → approval → output',
      data: {
        flow_id: '', flow_name: '审批',
        nodes: [
          { id: 'n1', type: 'input', name: '输入', category: '流程控制', config: { default_value: '申请 10000 元采购服务器' }, position: { x: 60, y: 220 } },
          { id: 'n2', type: 'llm', name: 'LLM 整理', category: 'AI 能力', config: { model: 'deepseek-v4-flash', system_prompt: '将申请整理为审批格式', temperature: 0.3, max_tokens: 512 }, position: { x: 340, y: 220 } },
          { id: 'n3', type: 'approval', name: '审批', category: '流程控制', config: { message: '请审核以下申请' }, position: { x: 620, y: 220 } },
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
      label: '工具调用', desc: 'llm → tool-call → output',
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
      label: '工具与技能', desc: 'register-tool → learn-skill → execute-skill → output',
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

  const handleLoadDemo = useCallback((demoId: string) => {
    const demo = demoFlows[demoId]
    if (!demo) return
    flowCanvasRef.current?.importFlow(demo.data)
    setTimeout(async () => {
      const handle = flowCanvasRef.current
      if (!handle) return
      const { nodes: flowNodes, edges: flowEdges } = handle.getNodesAndEdges()
      if (flowNodes.length === 0) return
      const resp = await fetch('/api/v1/flow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: flowNodes, edges: flowEdges, external_inputs: {}, global_vars: { flow_id: demoId } }),
      })
      const result = await resp.json()
      if (result.success) {
        handle.showResults(result.results.map((r: { nodeId: string; nodeName: string; outputs?: Record<string, unknown> }) => ({ nodeId: r.nodeId, nodeName: r.nodeName, output: r.outputs || {} })))
      } else {
        alert(`运行失败：${result.error || '请先在右上角齿轮图标设置中配置 API Key'}`)
      }
    }, 500)
  }, [])

  useEffect(() => {
    fetchSettings(store.dispatch)
    fetchAllProjects(store.dispatch)
    // 首次加载时，如果画布为空则添加默认输入节点
    setTimeout(() => {
      const handle = flowCanvasRef.current
      if (handle) {
        const { nodes } = handle.getNodesAndEdges()
        if (nodes.length === 0) {
          handle.importFlow({
            flow_id: '', flow_name: '',
            nodes: [{ id: 'input_default', type: 'input', name: '输入', category: '流程控制', config: { default_value: '' }, position: { x: 300, y: 180 } }],
            links: [], global_meta: { session_id: '', user_id: '' },
          })
        }
      }
    }, 100)
  }, [])

  const handleNewFlow = useCallback(() => {
    if (!confirm('新建将清空当前画布，是否继续？')) return
    flowCanvasRef.current?.newFlow()
    setTimeout(() => {
      flowCanvasRef.current?.importFlow({
        flow_id: '',
        flow_name: '',
        nodes: [
          {
            id: 'input_default',
            type: 'input',
            name: '输入',
            category: '流程控制',
            config: { default_value: '' },
            position: { x: 300, y: 180 },
          },
        ],
        links: [],
        global_meta: { session_id: '', user_id: '' },
      })
    }, 50)
  }, [])

  const handleSaveFlow = useCallback(async () => {
    const handle = flowCanvasRef.current
    if (!handle) return
    const { nodes, edges } = handle.getNodesAndEdges()
    if (nodes.length === 0) return

    const data = convertToExportFormat(nodes, edges)
    const state = store.getState()

    let project = state.saves.projects.find(p => p.id === state.saves.currentProjectId)
    if (!project) {
      await createProjectApi('默认项目', store.dispatch)
      const newState = store.getState()
      project = newState.saves.projects.find(p => p.id === newState.saves.currentProjectId)
      if (!project) return
    }

    const suggested = `保存 ${(project.saves.length || 0) + 1}`
    const name = window.prompt('输入保存名称：', suggested)
    if (!name?.trim()) return

    if (project.saves[0] && JSON.stringify(project.saves[0].data) === JSON.stringify(data)) {
      alert('内容无变化，未保存')
      return
    }
    await saveFlowApi(project.id, name.trim(), data as unknown as Record<string, unknown>, store.dispatch)
    store.dispatch({ type: 'flow/markClean' })
  }, [])

  const handleShowHistory = useCallback(() => {
    store.dispatch(toggleHistory())
  }, [])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        flowCanvasRef.current?.importFlow(data)
      } catch {
        alert('导入失败：无效的 JSON 文件')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const handleExportBundle = useCallback(() => {
    const handle = flowCanvasRef.current
    if (!handle) return
    const { nodes, edges } = handle.getNodesAndEdges()
    if (nodes.length === 0) {
      alert('Flow 画布为空，请先添加节点')
      return
    }
    setExportNodes(nodes)
    setExportEdges(edges)
    setExportDialogVisible(true)
  }, [])

  const handleExportFlow = useCallback(() => {
    const flowData = flowCanvasRef.current?.exportFlow()
    if (!flowData || (flowData as { nodes: unknown[] }).nodes.length === 0) {
      alert('画布为空，请先添加节点')
      return
    }
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flow_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleGroupSelected = useCallback(() => {
    flowCanvasRef.current?.groupSelected()
  }, [])

  const handleUngroupSelected = useCallback(() => {
    flowCanvasRef.current?.ungroupSelected()
  }, [])

  const handleDeleteSelected = useCallback(() => {
    flowCanvasRef.current?.deleteSelected()
  }, [])

  const handleDeleteNode = useCallback((id: string) => {
    flowCanvasRef.current?.deleteNodeById(id)
  }, [])

  const handleDeleteEdge = useCallback((id: string) => {
    flowCanvasRef.current?.deleteEdgeById(id)
  }, [])

  const handleSimulate = useCallback(async () => {
    setSimulating(true)
    try {
      await flowCanvasRef.current?.runSimulation()
    } finally {
      setSimulating(false)
    }
  }, [])

  const handleRestore = useCallback((saveData: unknown) => {
    flowCanvasRef.current?.restoreFromSave(saveData)
  }, [])

  const handleOpenSettings = useCallback(() => {
    store.dispatch(toggleSettings())
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void handleSaveFlow()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        flowCanvasRef.current?.undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        flowCanvasRef.current?.redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSaveFlow])

  return (
    <ErrorBoundary>
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* 导航栏 */}
      <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', padding: '0 16px', alignItems: 'center', height: 32 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 16 }}>AI Flow Canvas</span>
        <button onClick={() => setView('flow')} style={{
          padding: '3px 12px', border: 'none', borderRadius: '4px 4px 0 0',
          background: view === 'flow' ? 'var(--bg-primary)' : 'transparent',
          color: view === 'flow' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: view === 'flow' ? 600 : 400,
          cursor: 'pointer', fontSize: 12, marginRight: 1,
        }}>Flow 画布{useAppSelector(s => s.flow.dirty) ? ' ●' : ''}</button>
        <button onClick={() => setView('agent')} style={{
          padding: '3px 12px', border: 'none', borderRadius: '4px 4px 0 0',
          background: view === 'agent' ? 'var(--bg-primary)' : 'transparent',
          color: view === 'agent' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: view === 'agent' ? 600 : 400,
          cursor: 'pointer', fontSize: 12,
        }}>Agent 编排</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setDark(d => !d)} style={{
          padding: '3px 10px', border: 'none', borderRadius: 4, cursor: 'pointer',
          background: 'transparent', color: '#888', fontSize: 14,
        }} title={dark ? '切换浅色模式' : '切换深色模式'}>{dark ? '☀' : '☾'}</button>
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>v2.0</span>
      </div>
      {/* 两个画布始终挂载，通过 display 切换 */}
      <div style={{ display: view === 'flow' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <TopToolbar
        onNewFlow={handleNewFlow}
        onSaveFlow={handleSaveFlow}
        onShowHistory={handleShowHistory}
        onImportFlow={handleImportClick}
        onExportFlow={handleExportBundle}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        onDeleteSelected={handleDeleteSelected}
        onSimulate={handleSimulate}
        onFileSelected={handleFileSelected}
        onOpenSettings={handleOpenSettings}
        onOpenFlowConfig={() => store.dispatch(openFlowConfig())}
        onLoadDemo={handleLoadDemo}
        onBatchTest={() => setBatchVisible(true)}
        simulating={simulating}
      />
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelected} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {libraryCollapsed ? (
          <button onClick={() => setLibraryCollapsed(false)} style={{ width: 20, border: 'none', borderRight: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="展开组件">
            ▶
          </button>
        ) : (
          <NodeLibrary onCollapse={() => setLibraryCollapsed(true)} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} data-testid="flow-canvas">
            <FlowCanvas ref={flowCanvasRef} />
            <ConfigPanel
          onUpdateEdge={(edgeId, data) => flowCanvasRef.current?.updateEdgeData(edgeId, data)}
          onUpdateNode={(nodeId, data) => flowCanvasRef.current?.updateNodeData(nodeId, data)}
          onDeleteNode={handleDeleteNode}
          onDeleteEdge={handleDeleteEdge}
        />
          </div>
          <BottomPanel />
        </div>
      </div>
      <SaveHistory onRestore={handleRestore} />
      <SettingsPanel />
      {compiling && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 32,
            textAlign: 'center', minWidth: 300,
          }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              正在编译打包（首次需下载 PyInstaller，约 1-2 分钟）
            </div>
            <div style={{
              width: 40, height: 40, border: '3px solid #e8e8e8',
              borderTopColor: '#0070f3', borderRadius: '50%',
              margin: '0 auto', animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: 12, color: '#999', marginTop: 16 }}>
              完成自动下载 （含 .exe + 源码）
            </div>
          </div>
        </div>,
        document.body
      )}
        </div>
      <div style={{ display: view === 'agent' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }} data-testid="agent-canvas">
        <AgentCanvas />
        <AgentConfigPanel />
      </div>
      {exportDialogVisible && (
        <ExportDialog
          nodes={exportNodes}
          edges={exportEdges}
          onClose={() => setExportDialogVisible(false)}
          onCompileStart={() => setCompiling(true)}
          onCompileEnd={() => setCompiling(false)}
        />
      )}
      <>{batchVisible && <BatchRunner onClose={() => setBatchVisible(false)} />}</>
      {exportCodeVisible && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setExportCodeVisible(false)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 16,
            width: 700, maxWidth: '90vw', maxHeight: '80vh',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>导出 Python 代码</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                onClick={() => setExportCodeVisible(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <textarea readOnly value={exportedCode}
              style={{
                flex: 1, minHeight: 400, fontFamily: 'monospace', fontSize: 12,
                padding: 12, borderRadius: 8, border: '1px solid #e8e8e8',
                background: '#fafafa', resize: 'none', whiteSpace: 'pre', overflow: 'auto',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="notion-btn" onClick={() => {
                navigator.clipboard.writeText(exportedCode)
              }}>复制</button>
              <button className="notion-btn primary" onClick={() => {
                const blob = new Blob([exportedCode], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = 'flow.py'; a.click()
                URL.revokeObjectURL(url)
              }}>下载</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
    </ErrorBoundary>
  )
}
