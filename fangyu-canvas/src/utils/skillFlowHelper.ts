/** skillFlows（Agent 绑定格式）↔ Executor / Flow 画布格式转换 */

export interface SkillFlowShape {
  nodes: unknown[]
  edges: unknown[]
}

export function skillFlowToExecutorFormat(flow: SkillFlowShape) {
  const nodes = (flow.nodes || []).map((raw, i) => {
    const n = raw as Record<string, unknown>
    const d = (n.data as Record<string, unknown>) || n
    const originType = (d.originType as string) || (n.type as string) || 'code'
    return {
      id: (n.id as string) || `n${i}`,
      type: originType,
      name: (d.label as string) || (n.name as string) || originType,
      category: (d.category as string) || '',
      config: (d.config as Record<string, unknown>) || {},
      inner_nodes: (d.inner_nodes as unknown[]) || [],
      inner_links: (d.inner_links as unknown[]) || [],
      mappings: (d.mappings as Record<string, string>) || {},
    }
  })

  const links = (flow.edges || []).map((raw, i) => {
    const e = raw as Record<string, unknown>
    const ed = (e.data as Record<string, unknown>) || {}
    return {
      id: (e.id as string) || `e${i}`,
      sourceNodeId: (e.source as string) || (e.sourceNodeId as string),
      targetNodeId: (e.target as string) || (e.targetNodeId as string),
      sourceHandle: e.sourceHandle as string | undefined,
      targetHandle: e.targetHandle as string | undefined,
      linkType: (ed.linkType as string) || (e.linkType as string) || 'serial',
      mappings: (ed.mappings as Record<string, string>) || {},
    }
  })

  return { nodes, links }
}

export function skillFlowToImportFormat(flow: SkillFlowShape, flowName = '技能工作流') {
  const { nodes, links } = skillFlowToExecutorFormat(flow)
  return {
    flow_id: '',
    flow_name: flowName,
    nodes: nodes.map((n, i) => ({
      ...n,
      position: { x: 80 + (i % 4) * 220, y: 80 + Math.floor(i / 4) * 120 },
    })),
    links,
    global_meta: { session_id: '', user_id: '' },
  }
}

export function describeSkillFlow(flow: SkillFlowShape): Array<{ id: string; type: string; label: string }> {
  return (flow.nodes || []).map((raw, i) => {
    const n = raw as Record<string, unknown>
    const d = (n.data as Record<string, unknown>) || n
    return {
      id: (n.id as string) || `n${i}`,
      type: (d.originType as string) || (n.type as string) || '?',
      label: (d.label as string) || (n.name as string) || (n.id as string) || `节点${i + 1}`,
    }
  })
}
