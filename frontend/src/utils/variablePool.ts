import type { Node, Edge } from 'reactflow'
import { getNodeMeta } from './nodeRegistry'

const TEMPLATE_RE = /\{\{(.+?)\.(.+?)\}\}/g

export class VariablePool {
  private store = new Map<string, unknown>()

  add(nodeId: string, varName: string, value: unknown): void {
    this.store.set(`${nodeId}.${varName}`, value)
  }

  addOutputs(nodeId: string, output: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(output)) {
      this.store.set(`${nodeId}.${key}`, value)
    }
  }

  getVariable(selector: string): unknown {
    return this.store.get(selector)
  }

  resolve(template: string): string {
    return template.replace(TEMPLATE_RE, (_, nodeId: string, varName: string) => {
      const value = this.store.get(`${nodeId}.${varName}`)
      if (value === undefined) return `{{${nodeId}.${varName}}}`
      if (typeof value === 'object') return JSON.stringify(value)
      return String(value)
    })
  }

  resolveInObject<T>(obj: T): T {
    if (typeof obj === 'string') return this.resolve(obj) as T
    if (Array.isArray(obj)) return obj.map(item => this.resolveInObject(item)) as T
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveInObject(value)
      }
      return result as T
    }
    return obj
  }

  hasVariable(selector: string): boolean {
    return this.store.has(selector)
  }

  clear(): void {
    this.store.clear()
  }

  get allVariables(): Map<string, unknown> {
    return new Map(this.store)
  }
}

export function getUpstreamSelectors(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
  sortByLabel = true,
): Array<{ selector: string; nodeLabel: string; portName: string }> {
  const upstreamIds = edges.filter(e => e.target === nodeId).map(e => e.source)
  const results: Array<{ selector: string; nodeLabel: string; portName: string }> = []

  for (const uid of upstreamIds) {
    const upNode = nodes.find(n => n.id === uid)
    if (!upNode) continue
    const upMeta = getNodeMeta((upNode.data?.originType as string) || '')
    const label = (upNode.data?.label as string) || upNode.id
    for (const port of upMeta.outputSchema) {
      results.push({ selector: `${uid}.${port.name}`, nodeLabel: label, portName: port.name })
    }
  }

  if (sortByLabel) {
    results.sort((a, b) => a.nodeLabel.localeCompare(b.nodeLabel))
  }
  return results
}
