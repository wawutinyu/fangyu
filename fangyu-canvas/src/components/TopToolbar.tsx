import React, { useState, useRef, useEffect } from 'react'
import type { WorkerInfo } from '@fangyu/core/schema'
import { demoFlows } from '../utils/demoFlows'
import { isDesktop, isNative, queryNativeHealth } from '../platform'

const CATEGORY_ORDER = ['入门', '流程控制', 'AI 能力', '数据操作', '记忆存储', '工具集成', '其他']

const DEMO_CATEGORY_BY_ID: Record<string, string> = {
  core: 'AI 能力',
  condition: '流程控制',
  switch: '流程控制',
  loop: '流程控制',
  approval: '流程控制',
  knowledge: 'AI 能力',
  search_web: '工具集成',
  memory: '记忆存储',
  ext: '工具集成',
  text_processing: '数据操作',
  variable: '数据操作',
  mcp: '工具集成',
  tool_call: '工具集成',
  tool_skill: '工具集成',
  trigger: '流程控制',
  code_exec: 'AI 能力',
  var_text: '数据操作',
  memory_extract: '记忆存储',
  prompt: 'AI 能力',
  role: 'AI 能力',
  actionWorker: 'AI 能力',
}

function inferCategory(id: string): string {
  return demoFlows[id].category || DEMO_CATEGORY_BY_ID[id] || '其他'
}

const GROUPED_DEMOS = CATEGORY_ORDER.map(cat => ({
  category: cat,
  items: Object.keys(demoFlows)
    .filter(id => inferCategory(id) === cat)
    .map(id => ({
      id,
      label: demoFlows[id].label,
      desc: demoFlows[id].desc || '',
    })),
})).filter(g => g.items.length > 0)

const DEMO_COUNT = Object.keys(demoFlows).length

export type AppView = 'flow' | 'law' | 'worker' | 'presence'
export type XuMode = 'flow' | 'agent'

interface Props {
  view: AppView
  onViewChange: (view: AppView) => void
  xuMode: XuMode
  onXuModeChange: (mode: XuMode) => void
  flowDirty?: boolean
  dark?: boolean
  onToggleDark?: () => void
  onNewFlow: () => void
  onSaveFlow: () => void
  onShowHistory: () => void
  onImportFlow: () => void
  onExportFlow: () => void
  onOpenFlowConfig: () => void
  onGroupSelected: () => void
  onUngroupSelected: () => void
  onDeleteSelected: () => void
  onSimulate: () => void
  onDispatchToWorker?: () => void
  onBatchTest: () => void
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void
  onOpenSettings: () => void
  onLoadDemo: (demoId: string) => void
  onOpenAssets: () => void
  onOpenIntent?: () => void
  onOpenScenario?: () => void
  /** 一键加载「体验全部功能」场景包 */
  onFullExperience?: () => void
  fullExperienceBusy?: boolean
  onOpenSetupCopilot?: () => void
  simulating?: boolean
  dispatching?: boolean
  workersOnline?: number
  onlineWorkers?: WorkerInfo[]
  selectedWorkerId?: string | null
  onSelectWorker?: (workerId: string) => void
}

/** 四门排布：序 · 律 · 行 · 观（Agent 归入序） */
const VIEWS: { id: AppView; label: string; title: string; testId?: string }[] = [
  { id: 'flow', label: '序', title: '方隅·序 — 流程 / Agent 编排', testId: 'nav-xu' },
  { id: 'law', label: '律', title: '方隅·律 — 宪法与审计', testId: 'nav-law' },
  { id: 'worker', label: '行', title: '方隅·行 — Worker 看板', testId: 'nav-hang' },
  { id: 'presence', label: '观', title: '方隅·观 — 协作现场', testId: 'nav-presence' },
]

const XU_MODES: { id: XuMode; label: string; title: string }[] = [
  { id: 'flow', label: '流程', title: 'Flow 画布' },
  { id: 'agent', label: 'Agent', title: 'Agent 编排' },
]

export default function TopToolbar(props: Props) {
  const Btn = ({
    title, onClick, primary, style, children,
  }: {
    title?: string
    onClick: () => void
    primary?: boolean
    style?: React.CSSProperties
    children: React.ReactNode
  }) => (
    <button className={`notion-btn${primary ? ' primary' : ''}`} onClick={onClick} title={title} style={style}>
      {children}
    </button>
  )

  const isXu = props.view === 'flow'
  const isFlow = isXu && props.xuMode === 'flow'
  const isAgent = isXu && props.xuMode === 'agent'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 48, padding: '0 12px', gap: 12,
      borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)',
      userSelect: 'none', flexShrink: 0,
    }}>
      {/* 品牌 + 三门（Agent 归入序） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
          方隅
        </span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: 2, borderRadius: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}>
          {VIEWS.map(v => {
            const active = props.view === v.id
            const label = v.id === 'flow' && props.flowDirty ? `${v.label} ●` : v.label
            const hangBadge = v.id === 'worker' && (props.workersOnline ?? 0) > 0
              ? ` ${props.workersOnline}`
              : ''
            return (
              <button
                key={v.id}
                type="button"
                data-testid={v.testId}
                title={v.title}
                onClick={() => props.onViewChange(v.id)}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: active ? 600 : 450,
                  cursor: 'pointer',
                  background: active ? 'var(--bg-primary)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {label}{hangBadge}
              </button>
            )
          })}
        </div>
        {isXu && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            padding: 2, borderRadius: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
          }}>
            {XU_MODES.map(m => {
              const active = props.xuMode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  data-testid={m.id === 'agent' ? 'nav-xu-agent' : 'nav-xu-flow'}
                  title={m.title}
                  onClick={() => props.onXuModeChange(m.id)}
                  style={{
                    padding: '3px 9px',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: active ? 600 : 450,
                    cursor: 'pointer',
                    background: active ? 'var(--bg-primary)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
        )}
        {isNative() ? (
          <NativeShellBadge />
        ) : isDesktop() ? (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Electron 过渡壳">过渡</span>
        ) : null}
      </div>

      {/* 情境操作：只保留主路径 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center', minWidth: 0 }}>
        {isFlow && (
          <>
            <Btn onClick={props.onNewFlow} title="新建画布">新建</Btn>
            <Btn onClick={props.onSaveFlow} primary title="保存 Ctrl+S">保存</Btn>
            {props.onFullExperience && (
              <Btn
                onClick={props.onFullExperience}
                primary
                title="一键加载：Flow + Agent + 律策略 + Worker Bundle"
                style={props.fullExperienceBusy ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
              >
                {props.fullExperienceBusy ? '加载中…' : '体验全部'}
              </Btn>
            )}
            <ToolbarMenu
              label="创建"
              title="意图 / 场景 / 用例 / 资产"
              items={[
                ...(props.onOpenIntent ? [{ label: '意图生成', hint: '自然语言 → Flow', onClick: props.onOpenIntent }] : []),
                ...(props.onOpenScenario ? [{ label: '场景模板', hint: '一键实例化', onClick: props.onOpenScenario }] : []),
                ...(props.onFullExperience ? [{ label: '体验全部功能', hint: '推荐新手', onClick: props.onFullExperience }] : []),
                { label: `示例用例 (${DEMO_COUNT})`, hint: '加载演示流程', submenu: true },
                { label: '资产库', hint: '官方模板 + 我的流程', onClick: props.onOpenAssets },
              ]}
              demoGroups={GROUPED_DEMOS}
              onLoadDemo={props.onLoadDemo}
            />
            <ToolbarMenu
              label="更多"
              title="文件与编辑"
              items={[
                { label: '历史版本', onClick: props.onShowHistory },
                { label: '导入 JSON', onClick: props.onImportFlow },
                { label: '导出 Bundle', onClick: props.onExportFlow },
                { label: '组合选中', onClick: props.onGroupSelected },
                { label: '展开组合', onClick: props.onUngroupSelected },
                { label: '删除选中', onClick: props.onDeleteSelected },
                { label: '画布提示词', onClick: props.onOpenFlowConfig },
                { label: '批量测试', onClick: props.onBatchTest },
              ]}
            />
            <div style={{ width: 1, height: 18, background: 'var(--border-color)', margin: '0 6px' }} />
            <Btn
              onClick={props.onSimulate}
              primary
              title="与底部预览相同：后端真跑（/api/v1/flow/run/stream）"
              style={props.simulating ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
            >
              {props.simulating ? '预览中…' : '预览'}
            </Btn>
            {props.onDispatchToWorker && (
              <>
                {(props.onlineWorkers?.length ?? 0) > 1 && (
                  <select
                    value={props.selectedWorkerId ?? props.onlineWorkers![0].id}
                    onChange={e => props.onSelectWorker?.(e.target.value)}
                    title="选择目标 Worker"
                    style={{
                      fontSize: 11, padding: '4px 6px', borderRadius: 4,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                      maxWidth: 120,
                    }}
                  >
                    {props.onlineWorkers!.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                )}
                <Btn
                  onClick={props.onDispatchToWorker}
                  title={
                    (props.workersOnline ?? 0) === 0
                      ? '没有在线 Worker — 点击查看如何启动方隅·行'
                      : '派发至行 — 本机 Worker 真执行'
                  }
                  style={
                    props.dispatching || (props.workersOnline ?? 0) === 0
                      ? { opacity: 0.55, ...(props.dispatching ? { pointerEvents: 'none' } : {}) }
                      : undefined
                  }
                >
                  {props.dispatching ? '派发中…' : '派发至行'}
                </Btn>
              </>
            )}
          </>
        )}
        {isAgent && props.onOpenSetupCopilot && (
          <Btn onClick={props.onOpenSetupCopilot} title="粘贴外部 Agent URL → 确认信任">
            Setup Copilot
          </Btn>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {props.onToggleDark && (
          <button
            type="button"
            className="notion-btn"
            onClick={props.onToggleDark}
            title={props.dark ? '浅色' : '深色'}
            style={{ padding: '4px 8px', minWidth: 32 }}
          >
            {props.dark ? '浅' : '深'}
          </button>
        )}
        <Btn onClick={props.onOpenSettings} title="设置">设置</Btn>
      </div>
    </div>
  )
}

type MenuItem = {
  label: string
  hint?: string
  onClick?: () => void
  submenu?: boolean
}

function ToolbarMenu({
  label,
  title,
  items,
  demoGroups,
  onLoadDemo,
}: {
  label: string
  title?: string
  items: MenuItem[]
  demoGroups?: { category: string; items: { id: string; label: string; desc: string }[] }[]
  onLoadDemo?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setDemoOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="notion-btn"
        title={title}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setPos({ top: r.bottom + 4, left: r.left })
          setOpen(o => !o)
          setDemoOpen(false)
        }}
      >
        {label}
        <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 10000,
          background: 'var(--bg-primary)', borderRadius: 8,
          boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-color)',
          minWidth: 200, padding: 4,
        }}>
          {items.map(item => {
            if (item.submenu && demoGroups && onLoadDemo) {
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => setDemoOpen(d => !d)}
                    style={menuBtnStyle}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    {item.hint && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.hint}</div>}
                  </button>
                  {demoOpen && (
                    <div style={{
                      maxHeight: '50vh', overflowY: 'auto',
                      borderTop: '1px solid var(--border-light)',
                      marginTop: 2, paddingTop: 2,
                    }}>
                      {demoGroups.map(g => (
                        <div key={g.category}>
                          <div style={{
                            padding: '6px 10px 2px', fontSize: 10, fontWeight: 700,
                            color: 'var(--text-muted)', letterSpacing: '0.4px',
                          }}>
                            {g.category}
                          </div>
                          {g.items.map(d => (
                            <button
                              key={d.id}
                              type="button"
                              style={{ ...menuBtnStyle, paddingLeft: 14 }}
                              onClick={() => {
                                onLoadDemo(d.id)
                                setOpen(false)
                                setDemoOpen(false)
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <div style={{ fontWeight: 600 }}>{d.label}</div>
                              {d.desc && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.desc}</div>}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <button
                key={item.label}
                type="button"
                style={menuBtnStyle}
                onClick={() => {
                  item.onClick?.()
                  setOpen(false)
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontWeight: 600 }}>{item.label}</div>
                {item.hint && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.hint}</div>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const menuBtnStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
  border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12,
  color: 'var(--text-primary)', borderRadius: 6,
}

function NativeShellBadge() {
  const [tip, setTip] = useState('Windows 原生 · 探测中…')
  const [ok, setOk] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      const h = await queryNativeHealth()
      if (cancelled) return
      if (!h) {
        setOk(null)
        setTip('Windows 原生（IPC 不可用）')
        return
      }
      const apiOk = h.api === 'running'
      const workerOk = h.worker === 'running'
      setOk(apiOk && workerOk)
      setTip(`原生 · API ${h.api} · Worker ${h.worker}`)
    }
    tick()
    const id = window.setInterval(tick, 8000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const color = ok === true
    ? 'var(--success, #2a9d6e)'
    : ok === false
      ? 'var(--danger, #c44)'
      : 'var(--text-muted)'

  return (
    <span style={{ fontSize: 10, color }} title={tip}>原生</span>
  )
}
