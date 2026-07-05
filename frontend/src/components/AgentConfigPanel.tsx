import { useMemo, useState } from 'react'
import { useAppSelector, useAppDispatch } from '../store/hooks'
import { updateAgentCard, updateAgentNode } from '../store/agentSlice'
import type { AgentSkill, TrustPolicy } from '../utils/a2aProtocol'

export default function AgentConfigPanel() {
  const dispatch = useAppDispatch()
  const nodes = useAppSelector(s => s.agent.nodes)
  const selectedId = useAppSelector(s => s.agent.selectedNodeId)

  const node = useMemo(() => nodes.find(n => n.id === selectedId), [nodes, selectedId])
  const [tab, setTab] = useState<'card' | 'trust' | 'transport' | 'task' | 'ext'>('card')

  if (!node) {
    return (
      <div style={{ width: 320, borderLeft: '1px solid #eee', padding: 16, fontSize: 13, color: '#999' }}>
        选中一个智能体节点以查看配置
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

  const tabs = [
    { key: 'card' as const, label: 'AgentCard' },
    { key: 'trust' as const, label: 'ATP 可信' },
    { key: 'transport' as const, label: '传输' },
    { key: 'task' as const, label: 'Task' },
    { key: 'ext' as const, label: '扩展' },
  ]

  return (
    <div style={{ width: 380, borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '8px 0', border: 'none', background: tab === t.key ? '#f0f0ff' : 'transparent',
            color: tab === t.key ? '#722ed1' : '#888', fontWeight: tab === t.key ? 600 : 400,
            cursor: 'pointer', fontSize: 11, borderBottom: tab === t.key ? '2px solid #722ed1' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {tab === 'card' && (
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
              </div>
            ))}
            <button onClick={addSkill} style={{ padding: '4px 12px', border: '1px dashed #722ed1', borderRadius: 6, background: 'transparent', color: '#722ed1', cursor: 'pointer', fontSize: 12 }}>+ 添加技能</button>
          </div>
        )}

        {tab === 'trust' && (
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

        {tab === 'transport' && (
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

        {tab === 'task' && (
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

        {tab === 'ext' && (
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
