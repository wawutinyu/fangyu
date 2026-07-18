/**
 * 流程画布连线规则 — 拖拽连线与「+」菜单共用同一套判定。
 */
import type { Connection, Edge, Node } from 'reactflow'
import { getNodeMeta, getActiveNodeTypes, canConnectTypes } from './nodeRegistry'

export { canConnectTypes } from './nodeRegistry'

const NO_OUTPUT_TYPES = new Set(['output'])

export function resolvePortName(
  handle: string | null | undefined,
  schema: { name: string }[],
  fallbackIndex = 0,
): string | null {
  if (!schema.length) return null
  if (!handle || handle === '__default') {
    return schema[Math.min(fallbackIndex, schema.length - 1)]?.name ?? null
  }
  return schema.some(p => p.name === handle) ? handle : null
}

function portsCompatible(sourceType: string, targetType: string): boolean {
  if (sourceType === 'any' || targetType === 'any') return true
  return sourceType === targetType
}

export interface ConnectContext {
  nodes: Node[]
  edges: Edge[]
}

/**
 * 图上一次连线是否合法。
 * 返回 null 表示通过；返回字符串为拒绝原因（便于调试/测试）。
 */
export function validateFlowConnection(
  connection: Connection,
  ctx: ConnectContext,
): string | null {
  const { source, target, sourceHandle, targetHandle } = connection
  if (!source || !target) return '缺少端点'
  if (source === target) return '不能连接到自身'

  const sourceNode = ctx.nodes.find(n => n.id === source)
  const targetNode = ctx.nodes.find(n => n.id === target)
  if (!sourceNode || !targetNode) return '节点不存在'

  const sourceType = String(sourceNode.data?.originType || '')
  const targetType = String(targetNode.data?.originType || '')
  if (!canConnectTypes(sourceType, targetType)) {
    return `类型不兼容: ${sourceType} → ${targetType}`
  }

  const sourceMeta = getNodeMeta(sourceType)
  const targetMeta = getNodeMeta(targetType)

  const resolvedSource = resolvePortName(sourceHandle, sourceMeta.outputSchema)
  const resolvedTarget = resolvePortName(targetHandle, targetMeta.inputSchema)
  if (!resolvedSource) return `无效输出端口: ${sourceHandle ?? '(empty)'}`
  if (!resolvedTarget) return `无效输入端口: ${targetHandle ?? '(empty)'}`

  const sourcePort = sourceMeta.outputSchema.find(p => p.name === resolvedSource)!
  const targetPort = targetMeta.inputSchema.find(p => p.name === resolvedTarget)!
  if (!portsCompatible(sourcePort.type, targetPort.type)) {
    return `端口类型不匹配: ${sourcePort.type} → ${targetPort.type}`
  }

  const duplicate = ctx.edges.some(e => {
    if (e.source !== source || e.target !== target) return false
    const es = resolvePortName(e.sourceHandle, sourceMeta.outputSchema)
    const et = resolvePortName(e.targetHandle, targetMeta.inputSchema)
    return es === resolvedSource && et === resolvedTarget
  })
  if (duplicate) return '重复连线'

  // 同一目标句柄最多一条入边
  const handleTaken = ctx.edges.some(e => {
    if (e.target !== target) return false
    const existing = resolvePortName(e.targetHandle, targetMeta.inputSchema)
    return existing === resolvedTarget
  })
  if (handleTaken) return `输入端口已被占用: ${resolvedTarget}`

  if (wouldCreateCycle(source, target, ctx.edges)) {
    return '不能形成环路'
  }

  return null
}

export function isValidFlowConnection(connection: Connection, ctx: ConnectContext): boolean {
  return validateFlowConnection(connection, ctx) === null
}

/** 规范化连线句柄：把 __default 写成真实 schema 端口名。 */
export function normalizeConnectionHandles(connection: Connection, ctx: ConnectContext): Connection {
  const sourceNode = ctx.nodes.find(n => n.id === connection.source)
  const targetNode = ctx.nodes.find(n => n.id === connection.target)
  if (!sourceNode || !targetNode) return connection
  const sourceMeta = getNodeMeta(String(sourceNode.data?.originType || ''))
  const targetMeta = getNodeMeta(String(targetNode.data?.originType || ''))
  return {
    ...connection,
    sourceHandle: resolvePortName(connection.sourceHandle, sourceMeta.outputSchema),
    targetHandle: resolvePortName(connection.targetHandle, targetMeta.inputSchema),
  }
}

function wouldCreateCycle(source: string, target: string, edges: Edge[]): boolean {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  }
  const stack = [target]
  const seen = new Set<string>()
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === source) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const next of adj.get(cur) || []) stack.push(next)
  }
  return false
}

/** 「+」菜单：仅推荐现行（非 legacy）可连接类型。 */
export function listCompatibleTargetTypes(sourceType: string): string[] {
  if (NO_OUTPUT_TYPES.has(sourceType)) return []
  return getActiveNodeTypes().filter(t => canConnectTypes(sourceType, t))
}
