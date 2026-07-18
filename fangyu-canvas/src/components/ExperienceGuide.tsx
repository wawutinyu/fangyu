import React from 'react'
import { createPortal } from 'react-dom'

export interface ExperienceGuideProps {
  open: boolean
  title?: string
  bundlePath?: string | null
  policiesApplied?: string[]
  onClose: () => void
  onGoLaw: () => void
  onGoPresence: () => void
  onGoWorker: () => void
  onPreview: () => void
}

const STEPS = [
  { n: 1, title: '序 · 预览', desc: '展开底部「预览」→ 确认 Flow 聊天 → 发一句；或点工具栏「预览」。二者同一后端引擎。成功看绿色结论，别只盯执行日志' },
  { n: 2, title: '序 · Agent', desc: '顶栏切到「Agent」，看检索→分析→汇总协作拓扑' },
  { n: 3, title: '律', desc: '打开「律」，查看已写入的 LLM / SSRF / 循环 / 工具策略' },
  { n: 4, title: '行', desc: '先 ./install-worker.sh 或 ./dev-worker.sh，再点「派发至行」真执行' },
  { n: 5, title: '观', desc: '派发或 A2A 后打开「观」，看 Presence、协作边与时间线' },
]

/** 全平台体验包加载后的分步引导 */
export default function ExperienceGuide({
  open, title, bundlePath, policiesApplied, onClose, onGoLaw, onGoPresence, onGoWorker, onPreview,
}: ExperienceGuideProps) {
  if (!open) return null
  return createPortal(
    <div
      data-testid="experience-guide"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 480, maxWidth: '92vw',
          background: 'var(--bg-primary, #fff)', borderRadius: 12,
          border: '1px solid var(--border-color, #e5e7eb)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)', padding: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
          {title || '体验全部功能'} 已就绪
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Flow、Agent 网、策略与 Bundle 已装入。按下面五步逛完四门。
        </div>
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STEPS.map(s => (
            <li key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: '#111', color: '#fff', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{s.n}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 650 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
        {bundlePath && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#065f46', background: '#ecfdf5', padding: 8, borderRadius: 6 }}>
            Bundle：{bundlePath}
            {policiesApplied && policiesApplied.length > 0 && (
              <div>新策略：{policiesApplied.join(', ')}</div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button type="button" className="notion-btn notion-btn-primary" onClick={onPreview}>开始预览</button>
          <button type="button" className="notion-btn" onClick={onGoLaw}>去律</button>
          <button type="button" className="notion-btn" onClick={onGoWorker}>去行</button>
          <button type="button" className="notion-btn" onClick={onGoPresence}>去观</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="notion-btn" onClick={onClose}>我自己逛</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
