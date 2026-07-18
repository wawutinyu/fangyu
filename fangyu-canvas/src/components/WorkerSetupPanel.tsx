import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchWorkers } from '../utils/workerApi'

interface WorkerPreview {
  name: string
  plain: string
  confirm_prompt: string
  risks: string[]
  capabilities: string[]
  install_cmd: string
}

interface Props {
  open: boolean
  onClose: () => void
  onWorkerSeen?: (name: string) => void
}

/** 行 · 对话建 Worker：预览文案 + 复制启动命令 + 轮询在线 */
export default function WorkerSetupPanel({ open, onClose, onWorkerSeen }: Props) {
  const [desc, setDesc] = useState('本机巡检助手，能跑 shell 和 Flow')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<WorkerPreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [onlineHint, setOnlineHint] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setConfirmed(false)
      setError(null)
      setWaiting(false)
      setOnlineHint(null)
      setCopied(false)
    }
  }, [open])

  const runPreview = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPreview(null)
    setConfirmed(false)
    setOnlineHint(null)
    try {
      const res = await fetch('/api/v1/setup/worker/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const body = await res.json() as { preview: WorkerPreview }
      setPreview(body.preview)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [desc])

  const copyCmd = useCallback(async () => {
    if (!preview?.install_cmd) return
    try {
      await navigator.clipboard.writeText(preview.install_cmd)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('复制失败，请手动选中命令')
    }
  }, [preview])

  useEffect(() => {
    if (!waiting || !preview?.name) return
    const name = preview.name
    const started = Date.now()
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const list = await fetchWorkers()
          const hit = list.find(w => w.online && (w.name === name || w.name.includes(name)))
          if (hit) {
            setWaiting(false)
            setOnlineHint(`已上线：${hit.name}`)
            onWorkerSeen?.(hit.name)
            return
          }
          if (Date.now() - started > 90_000) {
            setWaiting(false)
            setOnlineHint('仍未看到在线 Worker — 请确认本机 Terminal 已跑启动命令')
          }
        } catch {
          /* ignore */
        }
      })()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [waiting, preview?.name, onWorkerSeen])

  if (!open) return null

  return createPortal(
    <div
      data-testid="worker-setup-panel"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(480px, 100%)', maxHeight: '90vh', overflow: 'auto',
          background: 'var(--bg-primary, #fff)', borderRadius: 10,
          border: '1px solid var(--border-color, #e5e5e5)',
          padding: 18, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>添加 Worker</div>
          <button type="button" className="notion-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>关闭</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          用一句话描述本机执行助手，生成名称与启动命令（不会替你拉起进程）。
        </div>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={3}
          style={{
            width: '100%', fontSize: 13, padding: 8, borderRadius: 6,
            border: '1px solid var(--border-color)', resize: 'vertical',
            boxSizing: 'border-box',
          }}
          placeholder="例如：本机巡检助手，能跑 shell 和 Flow"
        />
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="button" className="notion-btn primary" disabled={loading || !desc.trim()} onClick={() => void runPreview()}>
            {loading ? '生成中…' : '生成预览'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#b42318' }}>{error}</div>
        )}
        {preview && (
          <div style={{ marginTop: 14, fontSize: 12, lineHeight: 1.55 }}>
            <pre style={{
              whiteSpace: 'pre-wrap', margin: 0, padding: 10, borderRadius: 6,
              background: 'var(--bg-secondary, #f7f6f3)', fontFamily: 'inherit',
            }}>{preview.plain}</pre>
            {preview.risks.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {preview.risks.map(r => <li key={r}>{r}</li>)}
              </ul>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
              <span>{preview.confirm_prompt}</span>
            </label>
            <div style={{
              marginTop: 10, padding: 10, borderRadius: 6, fontSize: 11,
              background: '#1e1e1e', color: '#e8e8e8', fontFamily: 'ui-monospace, monospace',
              wordBreak: 'break-all',
            }}>
              {preview.install_cmd}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="notion-btn primary" disabled={!confirmed} onClick={() => void copyCmd()}>
                {copied ? '已复制' : '复制启动命令'}
              </button>
              <button type="button" className="notion-btn" disabled={!confirmed || waiting} onClick={() => {
                setOnlineHint('正在等待 Worker 上线…')
                setWaiting(true)
              }}>
                {waiting ? '等待上线…' : '我已启动，检测在线'}
              </button>
            </div>
            {onlineHint && (
              <div style={{ marginTop: 8, fontSize: 12, color: onlineHint.includes('已上线') ? '#16a34a' : 'var(--text-muted)' }}>
                {onlineHint}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
