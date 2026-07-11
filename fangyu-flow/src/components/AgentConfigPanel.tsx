import { useMemo, useState, useEffect } from 'react'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import { updateAgentCard, updateAgentNode, updateAgentEdge, updateRoutingRules, updateSkillFlow, clearSkillFlow } from '../store/agentSlice'
import type { AgentSkill, RoutingRule } from '../utils/a2aProtocol'
import { snapshotFlowFromCanvas } from '../utils/agentDeploy'

export default function AgentConfigPanel() {
  const dispatch = useAppDispatch()
  const nodes = useAppSelector(s => s.agent.nodes)
  const edges = useAppSelector(s => s.agent.edges)
  const selectedNodeId = useAppSelector(s => s.agent.selectedNodeId)
  const selectedEdgeId = useAppSelector(s => s.agent.selectedEdgeId)

  const node = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId])
  const edge = useMemo(() => edges.find(e => e.id === selectedEdgeId), [edges, selectedEdgeId])
  const isRouter = node?.type === 'a2a-router'
  const [tab, setTab] = useState<'card' | 'trust' | 'transport' | 'task' | 'ext' | 'router'>('card')

  useEffect(() => {
    if (isRouter) setTab('router')
  }, [isRouter])
  const [newRuleSkill, setNewRuleSkill] = useState('')
  const [newRuleTarget, setNewRuleTarget] = useState('')
  const [newRuleCondition, setNewRuleCondition] = useState('')
  const [newRulePriority, setNewRulePriority] = useState(0)

  // 如果选中了连线，显示连线配置
  if (edge) {
    const srcNode = nodes.find(n => n.id === edge.source)
    const tgtNode = nodes.find(n => n.id === edge.target)
    return (
      <div style={{ width: 260, borderLeft: '1px solid var(--border-color)', padding: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>连线配置</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {srcNode?.label || edge.source} → {tgtNode?.label || edge.target}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>订阅标签</span>
          <input className="notion-input" value={edge.label || 'subscribe'} onChange={e => dispatch(updateAgentEdge({ id: edge.id, data: { label: e.target.value || undefined } }))} />
        </label>
      </div>
    )
  }

  if (!node) {
    return (
      <div style={{ width: 260, borderLeft: '1px solid var(--border-color)', padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>
        选中一个节点或连线以查看配置
      </div>
    )
  }

  const card = node.agentCard
  const trust = node.trust

  const updateCard = (patch: Partial<typeof card>) => {
    dispatch(updateAgentCard({ nodeId: node.id, card: { ...card, ...patch } }))
  }

  const updateNodeData = (patch: Partial<typeof node>) => {
    dispatch(updateAgentNode({ id: node.id, data: patch }))
  }

  const addSkill = () => {
    const skill: AgentSkill = {
      id: `skill_${Date.now()}`, name: '新技能', description: '',
      tags: [], inputMimeTypes: ['application/json'], outputMimeTypes: ['application/json'],
    }
    updateCard({ skills: [...card.skills, skill] })
  }

  const removeSkill = (idx: number) => {
    const skills = [...card.skills]; skills.splice(idx, 1); updateCard({ skills })
  }

  const updateSkill = (idx: number, patch: Partial<AgentSkill>) => {
    const skills = [...card.skills]; skills[idx] = { ...skills[idx], ...patch }; updateCard({ skills })
  }

  const addRoutingRule = () => {
    if (!newRuleSkill || !newRuleTarget) return
    const rule: RoutingRule = {
      id: `rule_${Date.now()}`,
      sourceSkill: newRuleSkill,
      targetAgentId: newRuleTarget,
      condition: newRuleCondition || undefined,
      priority: newRulePriority,
    }
    dispatch(updateRoutingRules({
      nodeId: node.id,
      rules: [...(node.routingRules || []), rule],
      defaultTarget: node.defaultTarget,
    }))
    setNewRuleSkill(''); setNewRuleTarget(''); setNewRuleCondition(''); setNewRulePriority(0)
  }

  const removeRoutingRule = (idx: number) => {
    const rules = [...(node.routingRules || [])]; rules.splice(idx, 1)
    dispatch(updateRoutingRules({ nodeId: node.id, rules, defaultTarget: node.defaultTarget }))
  }

  const bindSkillFlow = (skillId: string) => {
    const flow = snapshotFlowFromCanvas()
    if (!flow) {
      alert('请先在「Flow 编排」画布中设计流程，再回来绑定技能。')
      return
    }
    dispatch(updateSkillFlow({ nodeId: node.id, skillId, flow }))
  }

  const unbindSkillFlow = (skillId: string) => {
    dispatch(clearSkillFlow({ nodeId: node.id, skillId }))
  }

  const getAgentOptions = () => {
    return nodes.filter(n => n.type === 'a2a-agent' && n.id !== node.id)
      .map(n => ({ id: n.id, label: n.label }))
  }

  const tabs = isRouter
    ? [{ key: 'router' as const, label: '路由规则' }]
    : [
        { key: 'card' as const, label: 'AgentCard' },
        { key: 'trust' as const, label: 'ATP 可信' },
        { key: 'transport' as const, label: '传输' },
        { key: 'task' as const, label: 'Task' },
        { key: 'ext' as const, label: '扩展' },
      ]

  return (
    <div style={{ width: 300, borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #eee' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '8px 0', border: 'none', background: tab === t.key ? '#fff7e6' : 'transparent',
            color: tab === t.key ? '#fa8c16' : '#888', fontWeight: tab === t.key ? 600 : 400,
            cursor: 'pointer', fontSize: 11, borderBottom: tab === t.key ? '2px solid #fa8c16' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {isRouter && tab === 'router' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="默认目标 Agent">
              <select value={node.defaultTarget || ''} onChange={e => dispatch(updateRoutingRules({ nodeId: node.id, rules: node.routingRules || [], defaultTarget: e.target.value }))}>
                <option value="">无（路由失败则报错）</option>
                {getAgentOptions().map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>

            <div style={{ fontWeight: 600, fontSize: 12, marginTop: 8 }}>路由规则 ({node.routingRules?.length || 0})</div>
            {(node.routingRules || []).map((r, i) => (
              <div key={r.id} style={{ background: '#fff7e6', borderRadius: 6, padding: 8, position: 'relative' }}>
                <button onClick={() => removeRoutingRule(i)} style={{ position: 'absolute', top: 4, right: 4, border: 'none', background: 'none', color: '#e00', cursor: 'pointer', fontSize: 12 }}>✕</button>
                <Field label="来源技能">{r.sourceSkill}</Field>
                <Field label="目标 Agent">
                  {nodes.find(n => n.id === r.targetAgentId)?.label || r.targetAgentId}
                </Field>
                {r.condition && <Field label="条件">{r.condition}</Field>}
                <Field label="优先级">{r.priority}</Field>
              </div>
            ))}

            <div style={{ borderTop: '1px solid #eee', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: '#888' }}>添加规则</div>
              <Field label="来源 Skill ID"><input value={newRuleSkill} onChange={e => setNewRuleSkill(e.target.value)} placeholder="如 web-search" /></Field>
              <Field label="目标 Agent">
                <select value={newRuleTarget} onChange={e => setNewRuleTarget(e.target.value)}>
                  <option value="">选择...</option>
                  {getAgentOptions().map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="条件（可选）"><input value={newRuleCondition} onChange={e => setNewRuleCondition(e.target.value)} placeholder="如 urgent" /></Field>
              <Field label="优先级"><input type="number" value={newRulePriority} onChange={e => setNewRulePriority(parseInt(e.target.value) || 0)} /></Field>
              <button onClick={addRoutingRule} style={{ padding: '4px 12px', border: '1px dashed #fa8c16', borderRadius: 6, background: 'transparent', color: '#fa8c16', cursor: 'pointer', fontSize: 12 }}>+ 添加规则</button>
            </div>
          </div>
        )}

        {!isRouter && tab === 'card' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="名称"><input value={card.name} onChange={e => updateCard({ name: e.target.value })} /></Field>
            <Field label="描述"><textarea value={card.description || ''} onChange={e => updateCard({ description: e.target.value })} rows={2} /></Field>
            <Field label="版本"><input value={card.version} onChange={e => updateCard({ version: e.target.value })} /></Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={!!card.capabilities.streaming} onChange={e => updateCard({ capabilities: { ...card.capabilities, streaming: e.target.checked } })} />
              支持流式输出
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={!!card.capabilities.pushNotifications} onChange={e => updateCard({ capabilities: { ...card.capabilities, pushNotifications: e.target.checked } })} />
              支持推送通知
            </label>
            <div style={{ fontWeight: 600, fontSize: 12, marginTop: 8 }}>技能列表 ({card.skills.length})</div>
            {card.skills.map((s, i) => (
              <div key={s.id} style={{ background: '#f9f9f9', borderRadius: 6, padding: 8, position: 'relative' }}>
                <button onClick={() => removeSkill(i)} style={{ position: 'absolute', top: 4, right: 4, border: 'none', background: 'none', color: '#e00', cursor: 'pointer', fontSize: 12 }}>✕</button>
                <Field label="ID"><input value={s.id} onChange={e => updateSkill(i, { id: e.target.value })} /></Field>
                <Field label="名称"><input value={s.name} onChange={e => updateSkill(i, { name: e.target.value })} /></Field>
                <Field label="描述"><input value={s.description || ''} onChange={e => updateSkill(i, { description: e.target.value })} /></Field>
                <Field label="标签"><input value={(s.tags || []).join(', ')} onChange={e => updateSkill(i, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} placeholder="逗号分隔" /></Field>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {node.skillFlows?.[s.id]?.nodes?.length ? (
                    <span style={{ fontSize: 11, color: '#52c41a', alignSelf: 'center' }}>
                      已绑定 Flow（{node.skillFlows[s.id].nodes.length} 节点）
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#888', alignSelf: 'center' }}>未绑定（部署时用默认 LLM 流程）</span>
                  )}
                  <button onClick={() => bindSkillFlow(s.id)} style={{ padding: '2px 8px', border: '1px solid #722ed1', borderRadius: 4, background: 'transparent', color: '#722ed1', cursor: 'pointer', fontSize: 11 }}>
                    绑定 Flow 画布
                  </button>
                  {node.skillFlows?.[s.id] && (
                    <button onClick={() => unbindSkillFlow(s.id)} style={{ padding: '2px 8px', border: '1px solid #ccc', borderRadius: 4, background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 11 }}>
                      清除绑定
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={addSkill} style={{ padding: '4px 12px', border: '1px dashed #722ed1', borderRadius: 6, background: 'transparent', color: '#722ed1', cursor: 'pointer', fontSize: 12 }}>+ 添加技能</button>
          </div>
        )}

        {!isRouter && tab === 'trust' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={trust.enabled} onChange={e => updateNodeData({ trust: { ...trust, enabled: e.target.checked } })} />
              启用 ATP 可信协议
            </label>
            <Field label="签名算法">
              <select value={trust.algorithm} onChange={e => updateNodeData({ trust: { ...trust, algorithm: e.target.value as any } })}>
                <option value="Ed25519">Ed25519</option>
                <option value="ECDSA-P256">ECDSA P-256</option>
              </select>
            </Field>
            <Field label="Anchor 来源">
              <select value={trust.anchorSource} onChange={e => updateNodeData({ trust: { ...trust, anchorSource: e.target.value as any } })}>
                <option value="auto">自动生成</option>
                <option value="import">导入密钥文件</option>
              </select>
            </Field>
            {trust.anchorSource === 'import' && (
              <Field label="密钥路径"><input value={trust.anchorKeyPath || ''} onChange={e => updateNodeData({ trust: { ...trust, anchorKeyPath: e.target.value } })} /></Field>
            )}
            <div style={{ fontWeight: 600, fontSize: 12, marginTop: 8 }}>授权策略</div>
            {trust.policies.map((p, i) => (
              <div key={i} style={{ background: '#f9f9f9', borderRadius: 6, padding: 8 }}>
                <Field label="Agent ID"><input value={p.agentId} onChange={e => {
                  const policies = [...trust.policies]; policies[i] = { ...policies[i], agentId: e.target.value }
                  updateNodeData({ trust: { ...trust, policies } })
                }} /></Field>
                <Field label="允许的技能"><input value={p.allowedSkills.join(', ')} onChange={e => {
                  const policies = [...trust.policies]; policies[i] = { ...policies[i], allowedSkills: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }
                  updateNodeData({ trust: { ...trust, policies } })
                }} placeholder="* 表示全部" /></Field>
              </div>
            ))}
            <button onClick={() => updateNodeData({ trust: { ...trust, policies: [...trust.policies, { agentId: '', allowedSkills: ['*'] }] } })} style={{ padding: '4px 12px', border: '1px dashed #722ed1', borderRadius: 6, background: 'transparent', color: '#722ed1', cursor: 'pointer', fontSize: 12 }}>+ 添加策略</button>
            <Field label="吊销列表 (逗号分隔)"><input value={trust.revocationList.join(', ')} onChange={e => updateNodeData({ trust: { ...trust, revocationList: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} /></Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={trust.auditEnabled} onChange={e => updateNodeData({ trust: { ...trust, auditEnabled: e.target.checked } })} />
              启用审计日志
            </label>
            <Field label="审计日志路径"><input value={trust.auditPath} onChange={e => updateNodeData({ trust: { ...trust, auditPath: e.target.value } })} /></Field>
          </div>
        )}

        {!isRouter && tab === 'transport' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="传输协议">
              <select value={card.defaultInterface.type} onChange={e => updateCard({ defaultInterface: { ...card.defaultInterface, type: e.target.value as any } })}>
                <option value="in-memory">In-Memory (单进程)</option>
                <option value="http">HTTP (分布式)</option>
                <option value="grpc">gRPC (分布式)</option>
              </select>
            </Field>
            {card.defaultInterface.type !== 'in-memory' && (
              <>
                <Field label="端口"><input type="number" value={card.defaultInterface.port || ''} onChange={e => updateCard({ defaultInterface: { ...card.defaultInterface, port: parseInt(e.target.value) || undefined } })} /></Field>
                <Field label="路径"><input value={card.defaultInterface.path || ''} onChange={e => updateCard({ defaultInterface: { ...card.defaultInterface, path: e.target.value } })} /></Field>
              </>
            )}
          </div>
        )}

        {!isRouter && tab === 'task' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="超时 (ms)"><input type="number" value={node.timeout} onChange={e => updateNodeData({ timeout: parseInt(e.target.value) || 30000 })} /></Field>
            <Field label="重试次数"><input type="number" value={node.retryCount} onChange={e => updateNodeData({ retryCount: parseInt(e.target.value) || 0 })} min={0} max={10} /></Field>
            <Field label="生命周期">
              <select value={node.lifecycle} onChange={e => updateNodeData({ lifecycle: e.target.value as any })}>
                <option value="sync">同步</option>
                <option value="async">异步</option>
                <option value="streaming">流式</option>
              </select>
            </Field>
            <Field label="推送通知 URL"><input value={node.pushNotificationUrl} onChange={e => updateNodeData({ pushNotificationUrl: e.target.value })} placeholder="https://..." /></Field>
            <Field label="多租户 ID"><input value={node.tenantId} onChange={e => updateNodeData({ tenantId: e.target.value })} /></Field>
          </div>
        )}

        {!isRouter && tab === 'ext' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#888' }}>自定义扩展属性 (key=value)</div>
            {Object.entries(node.extensions).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input style={{ flex: 1 }} value={k} onChange={e => {
                  const ext = { ...node.extensions }; delete ext[k]; ext[e.target.value] = v
                  updateNodeData({ extensions: ext })
                }} placeholder="key" />
                <input style={{ flex: 2 }} value={v} onChange={e => updateNodeData({ extensions: { ...node.extensions, [k]: e.target.value } })} placeholder="value" />
              </div>
            ))}
            <button onClick={() => updateNodeData({ extensions: { ...node.extensions, '': '' } })} style={{ padding: '4px 12px', border: '1px dashed #722ed1', borderRadius: 6, background: 'transparent', color: '#722ed1', cursor: 'pointer', fontSize: 12 }}>+ 添加扩展</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
      <span style={{ color: '#666' }}>{label}</span>
      {children}
    </label>
  )
}
