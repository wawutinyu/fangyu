import { useAppDispatch } from '../../store/hooks'
import { setGlobalPrompts } from '../../store/flowSlice'

interface Props {
  globalPrompts: { system_prompt: string; user_prompt_template: string; context: string }
}

export default function FlowConfigPanel({ globalPrompts }: Props) {
  const dispatch = useAppDispatch()

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 12 }}>全局提示词</div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>系统提示词</label>
        <textarea className="notion-textarea"
          value={globalPrompts.system_prompt}
          onChange={e => dispatch(setGlobalPrompts({ ...globalPrompts, system_prompt: e.target.value }))}
          placeholder="全局系统提示词，自动注入到所有 LLM 节点"
          rows={4} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>用户提示词模板</label>
        <textarea className="notion-textarea"
          value={globalPrompts.user_prompt_template}
          onChange={e => dispatch(setGlobalPrompts({ ...globalPrompts, user_prompt_template: e.target.value }))}
          placeholder="用户消息模板，可用 {{input}} 引用节点输入"
          rows={3} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>上下文</label>
        <textarea className="notion-textarea"
          value={globalPrompts.context}
          onChange={e => dispatch(setGlobalPrompts({ ...globalPrompts, context: e.target.value }))}
          placeholder="全局上下文信息，如背景知识、角色设定"
          rows={3} />
      </div>
    </div>
  )
}
