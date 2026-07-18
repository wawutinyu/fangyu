/** 底部预览未挂载时暂存预览结果，避免「有完整结果却看不到 AI 回复」 */

const STORAGE_KEY = 'fangyu-pending-preview-text'
let memory: string | null = null

export function queuePreviewResult(text: string) {
  if (!text) return
  memory = text
  try { sessionStorage.setItem(STORAGE_KEY, text) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('fangyu:preview-result', { detail: { text } }))
}

export function takeQueuedPreviewResult(): string | null {
  let text = memory
  memory = null
  if (!text) {
    try {
      text = sessionStorage.getItem(STORAGE_KEY)
      sessionStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  } else {
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }
  return text || null
}
