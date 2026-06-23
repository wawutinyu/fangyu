import { getNodeMeta } from './nodeRegistry'
import { useSettingsStore } from '../stores/settingsStore'

const PROVIDER_MAP = {
  'gpt-4o': 'openai', 'gpt-4o-mini': 'openai', 'gpt-4-turbo': 'openai', 'gpt-3.5-turbo': 'openai',
  'claude-3.5-sonnet': 'anthropic', 'claude-3.5-haiku': 'anthropic',
  'deepseek-chat': 'deepseek', 'deepseek-reasoner': 'deepseek', 'deepseek-v3': 'deepseek', 'deepseek-r1': 'deepseek', 'deepseek-v4-flash': 'deepseek', 'deepseek-v4-pro': 'deepseek',
  'moonshot-v1-8k': 'moonshot', 'moonshot-v1-32k': 'moonshot', 'moonshot-v1-128k': 'moonshot',
}

export class Executor {
  constructor(lf) {
    this.lf = lf
    this._aborted = false
    this._logs = []
    this._graphData = null
    this._externalInputs = {}
    this._onStream = null
    this._globalVars = {}
  }

  setExternalInputs(inputs) { this._externalInputs = inputs }
  setGlobalVars(vars) { this._globalVars = vars }
  onStream(cb) { this._onStream = cb }

  abort() { this._aborted = true }

  getLogs() { return this._logs }

  addLog(nodeId, nodeName, type, data) {
    this._logs.push({ nodeId, nodeName, type, data, time: Date.now() })
  }

  async run() {
    this._aborted = false
    this._logs = []
    this._graphData = this.lf.getGraphData()
    const nodes = this._graphData.nodes || []
    const edges = this._graphData.edges || []
    if (nodes.length === 0) return { success: false, error: '画布为空' }

    const order = this._topoSort(nodes, edges)
    if (order.length === 0) return { success: false, error: '无法排序（可能包含环）' }

    const outputs = {}
    const results = []

    for (let i = 0; i < order.length; i++) {
      if (this._aborted) return { success: false, error: '已中止', results, logs: this._logs }

      const nodeId = order[i]
      const nodeData = nodes.find(n => n.id === nodeId)
      if (!nodeData) continue

      const type = nodeData.properties?.originType || nodeData.type
      const meta = getNodeMeta(type)
      const nodeName = nodeData.text?.value || meta.name || type

      this._highlightNode(nodeId, true)

      // Resolve inputs from upstream edges
      const upstreamEdges = edges.filter(e => e.targetNodeId === nodeId)
      const inputs = this._resolveNodeInputs(nodeData, upstreamEdges, edges, outputs, meta)

      // Merge with node config
      const config = nodeData.properties?.config || {}

      this.addLog(nodeId, nodeName, 'start', { inputs, config })

      // Inject external inputs for start nodes
      if (type === 'start') {
        Object.assign(inputs, this._externalInputs)
      }

      try {
        const nodeOutputs = await this._executeNode(type, inputs, config, meta, outputs)
        outputs[nodeId] = nodeOutputs
        outputs[nodeName] = nodeOutputs
        this.addLog(nodeId, nodeName, 'complete', { outputs: nodeOutputs })
        results.push({ nodeId, nodeName, type, outputs: nodeOutputs })

        if (this._onStream && nodeOutputs.result) {
          this._onStream({ nodeId, nodeName, type, output: nodeOutputs.result })
        }
      } catch (err) {
        this.addLog(nodeId, nodeName, 'error', { error: err.message })
        results.push({ nodeId, nodeName, type, error: err.message })
      }

      this._highlightNode(nodeId, false)
      await this._sleep(200)
    }

    return { success: true, results, logs: this._logs }
  }

  _resolveNodeInputs(nodeData, upstreamEdges, allEdges, allOutputs, meta) {
    const nodeId = nodeData.id
    const inputs = {}
    for (const port of meta.inputSchema) {
      inputs[port.name] = null
    }

    for (const edge of upstreamEdges) {
      const edgeProps = edge.properties || {}
      const edgeMappings = edgeProps.mappings || {}
      for (const [targetPort, sourceExpr] of Object.entries(edgeMappings)) {
        inputs[targetPort] = this._resolveMapping(sourceExpr, allOutputs)
      }
    }

    const nodeMappings = nodeData.properties?.mappings || {}
    for (const [targetPort, sourceExpr] of Object.entries(nodeMappings)) {
      if (inputs[targetPort] === null || inputs[targetPort] === undefined) {
        inputs[targetPort] = this._resolveMapping(sourceExpr, allOutputs)
      }
    }

    if (upstreamEdges.length === 1 && Object.keys(nodeMappings).length === 0) {
      const upstreamOutputs = allOutputs[upstreamEdges[0].sourceNodeId] || {}
      for (const port of meta.inputSchema) {
        if (port.required && (inputs[port.name] === null || inputs[port.name] === undefined)) {
          const firstKey = Object.keys(upstreamOutputs)[0]
          if (firstKey) inputs[port.name] = upstreamOutputs[firstKey]
        }
      }
    }

    return inputs
  }

  _resolveMapping(sourceExpr, allOutputs) {
    if (!sourceExpr) return null
    const parts = sourceExpr.split('.')
    if (parts.length >= 2) {
      const nodeNameOrId = parts[0]
      const outputKey = parts.slice(1).join('.')
      if (allOutputs[nodeNameOrId] && allOutputs[nodeNameOrId][outputKey] !== undefined) {
        return allOutputs[nodeNameOrId][outputKey]
      }
      for (const [, nodeOutputs] of Object.entries(allOutputs)) {
        if (nodeOutputs && nodeOutputs[outputKey] !== undefined) {
          return nodeOutputs[outputKey]
        }
      }
      return null
    }
    for (const [, nodeOutputs] of Object.entries(allOutputs)) {
      if (nodeOutputs && nodeOutputs[parts[0]] !== undefined) {
        return nodeOutputs[parts[0]]
      }
    }
    return null
  }

  async _executeNode(type, inputs, config, meta, allOutputs) {
    switch (type) {
      case 'start':
        return { ...this._externalInputs, trigger: true }
      case 'end':
        return { result: inputs.input }
      case 'llm':
        return await this._execLLM(inputs, config, allOutputs)
      case 'code':
        return await this._execCode(inputs, config)
      case 'http':
        return await this._execHTTP(inputs, config)
      case 'condition': {
        const expr = config.expression || 'true'
        const fn = this._buildFn(expr, ['input'])
        const result = fn(inputs)
        return { result, branch: result ? 'true' : 'false' }
      }
      case 'switch': {
        const expr = config.expression || 'input'
        const fn = this._buildFn(`(() => ${expr})()`, ['input'])
        const value = fn(inputs)
        return { result: value }
      }
      case 'loop':
        return await this._execLoop(inputs, config)
      case 'knowledge':
        return await this._execKnowledge(inputs, config)
      case 'search':
        return await this._execSearch(inputs, config)
      case 'json-parse': {
        const source = inputs.source || config.source || ''
        try { return { result: JSON.parse(source), error: null } }
        catch (e) { return { result: null, error: e.message } }
      }
      case 'variable-set': {
        const varName = config.var_name || 'var'
        return { result: inputs.value, [`var_${varName}`]: inputs.value }
      }
      case 'variable-get': {
        const varName = config.var_name || 'var'
        return { value: this._globalVars[varName] || null }
      }
      case 'transform': {
        const mapping = config.mapping || {}
        const source = inputs.source || {}
        const result = {}
        for (const [key, val] of Object.entries(mapping)) {
          result[key] = this._resolvePath(source, val)
        }
        return { result }
      }
      case 'text-process': {
        const op = config.operation || 'concat'
        const text = inputs.text || ''
        let result = text
        switch (op) {
          case 'concat': result = text + (config.separator || ''); break
          case 'split': result = text.split(config.separator || ','); break
          case 'replace': result = text.replace(new RegExp(config.pattern || '', 'g'), config.replacement || ''); break
          case 'trim': result = text.trim(); break
          case 'uppercase': result = text.toUpperCase(); break
          case 'lowercase': result = text.toLowerCase(); break
        }
        return { result }
      }
      case 'memory-read':
        return { value: null }
      case 'memory-write':
        return { success: true }
      case 'composite-node':
        return { output: inputs.input }
      default:
        return await this._execDefault(inputs, config, meta)
    }
  }

  async _execLLM(inputs, config, allOutputs) {
    const prompt = this._smartTemplate(config.prompt || '', allOutputs, inputs, this._externalInputs)
    const systemPrompt = this._smartTemplate(config.system_prompt || '', allOutputs, inputs, this._externalInputs)

    const model = config.model || 'gpt-4o'
    const providerId = PROVIDER_MAP[model] || 'openai'

    const settings = useSettingsStore()
    const apiKey = config.api_key || settings.getApiKey(providerId)
    const baseUrl = config.base_url || settings.getBaseUrl(providerId)

    const userContent = prompt || inputs.input || this._externalInputs.query || ''

    if (apiKey && baseUrl) {
      try {
        const messages = []
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })

        const history = this._globalVars._chatHistory || []
        for (const msg of history) {
          messages.push(msg)
        }

        messages.push({ role: 'user', content: userContent })

        const body = {
          model,
          messages,
          temperature: config.temperature ?? 0.7,
          max_tokens: config.max_tokens ?? 2048,
        }
        if (providerId === 'deepseek' && config.thinking_mode) {
          body.thinking = { type: 'enabled' }
          body.reasoning_effort = config.reasoning_effort || 'medium'
        }
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        })
        const json = await resp.json()
        const content = json.choices?.[0]?.message?.content || ''

        this._globalVars._lastLLMOutput = content
        if (!this._globalVars._chatHistory) this._globalVars._chatHistory = []
        this._globalVars._chatHistory.push(
          { role: 'user', content: userContent },
          { role: 'assistant', content }
        )

        return {
          result: content,
          usage: json.usage || { prompt_tokens: 0, completion_tokens: 0 },
        }
      } catch (err) {
        return { result: `[API 调用失败: ${err.message}]`, usage: null }
      }
    }

    await this._sleep(500)
    const mockResult = `[${model} 模拟响应] 输入: "${String(userContent).slice(0, 50)}..."`
    return { result: mockResult, usage: { prompt_tokens: 50, completion_tokens: 30 } }
  }

  async _execCode(inputs, config) {
    const code = config.code || ''
    const timeout = config.timeout || 5000
    try {
      const fn = this._buildFn(code, ['input', 'params', 'console'])
      const logs = []
      const mockConsole = { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push('[ERROR] ' + args.join(' ')) }
      const result = await Promise.race([
        Promise.resolve(fn(inputs, inputs.params || {}, mockConsole)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('执行超时')), timeout)),
      ])
      return { result: result !== undefined ? result : null, logs }
    } catch (err) {
      return { result: null, error: err.message }
    }
  }

  async _execHTTP(inputs, config) {
    const url = inputs.url || config.url || ''
    if (!url) throw new Error('URL 为空')
    const method = config.method || 'GET'
    const headers = config.headers || {}
    const body = config.body || inputs.body || null
    const timeout = config.timeout || 10000

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const opts = { method, headers: { ...headers, 'Content-Type': 'application/json' }, signal: controller.signal }
      if (body && method !== 'GET') opts.body = typeof body === 'string' ? body : JSON.stringify(body)
      const resp = await fetch(url, opts)
      const data = await resp.json().catch(() => resp.text())
      return { status: resp.status, data, headers: Object.fromEntries(resp.headers.entries()) }
    } catch (err) {
      throw new Error(`HTTP 请求失败: ${err.message}`)
    } finally { clearTimeout(timer) }
  }

  async _execKnowledge(inputs, config) {
    await this._sleep(300)
    const query = inputs.query || ''
    const topK = config.top_k || 5
    return { results: [], context: `[知识库模拟] 搜索: "${query.slice(0, 30)}..." 返回 ${topK} 条结果。` }
  }

  async _execSearch(inputs, config) {
    await this._sleep(400)
    const query = inputs.query || ''
    const topK = config.top_k || 5
    return {
      results: Array.from({ length: topK }, (_, i) => ({
        title: `结果 ${i + 1}: ${query}`,
        snippet: `这是关于 "${query}" 的第 ${i + 1} 条模拟搜索结果。`,
        url: `https://example.com/result/${i}`,
      })),
      summary: `搜索 "${query}" 返回 ${topK} 条结果。`,
    }
  }

  async _execLoop(inputs, config) {
    const arr = inputs.array || []
    const maxIter = config.max_iterations || 100
    const results = []
    for (let i = 0; i < Math.min(arr.length, maxIter); i++) {
      results.push(arr[i])
    }
    return { result: results }
  }

  async _execDefault(inputs, config, meta) {
    await this._sleep(200)
    const outputNames = (meta.outputSchema || []).map(p => p.name)
    const outputs = {}
    if (outputNames.length === 0) {
      outputs.result = '[已执行]'
    } else {
      for (const name of outputNames) {
        outputs[name] = inputs[name] || config[name] || null
      }
    }
    return outputs
  }

  _smartTemplate(str, allOutputs, inputs, externalInputs) {
    if (!str) return ''
    const ctx = { ...externalInputs, ...inputs, ...this._globalVars }
    for (const [nodeKey, nodeOutputs] of Object.entries(allOutputs)) {
      if (typeof nodeOutputs === 'object' && nodeOutputs !== null) {
        for (const [key, val] of Object.entries(nodeOutputs)) {
          ctx[`${nodeKey}.${key}`] = val
        }
      }
    }
    return str.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const trimmed = key.trim()
      const pathParts = trimmed.split('.')
      let val = ctx[trimmed]
      if (val === undefined) {
        val = this._resolvePath(ctx, trimmed)
      }
      if (val === undefined) {
        for (const [, nodeOutputs] of Object.entries(allOutputs)) {
          if (typeof nodeOutputs === 'object' && nodeOutputs !== null) {
            const v = this._resolvePath(nodeOutputs, trimmed)
            if (v !== undefined) { val = v; break }
          }
        }
      }
      return val !== undefined ? String(val) : `{{${trimmed}}}`
    })
  }

  _topoSort(nodes, edges) {
    const nodeIds = new Set(nodes.map(n => n.id))
    const adj = new Map()
    const inDegree = new Map()
    nodeIds.forEach(id => { adj.set(id, []); inDegree.set(id, 0) })
    edges.forEach(e => {
      if (nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId)) {
        adj.get(e.sourceNodeId).push(e.targetNodeId)
        inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) || 0) + 1)
      }
    })
    const queue = []
    inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id) })
    const order = []
    while (queue.length) {
      const id = queue.shift()
      order.push(id)
      for (const neighbor of (adj.get(id) || [])) {
        inDegree.set(neighbor, inDegree.get(neighbor) - 1)
        if (inDegree.get(neighbor) === 0) queue.push(neighbor)
      }
    }
    return order
  }

  _highlightNode(nodeId, active) {
    if (!this.lf) return
    this.lf.graphModel.nodes.forEach(n => {
      n.setProperties({ _simulating: nodeId === n.id && active })
    })
  }

  _buildFn(code, paramNames) {
    try { return new Function(...paramNames, `"use strict";\n${code}`) }
    catch { return new Function(...paramNames, `"use strict";\nreturn ${code}`) }
  }

  _resolvePath(obj, path) {
    if (!obj || !path) return undefined
    return path.split('.').reduce((acc, part) => (acc != null ? acc[part] : undefined), obj)
  }

  _sleep(ms) {
    return new Promise(resolve => {
      if (this._aborted) resolve()
      else setTimeout(resolve, ms)
    })
  }
}
