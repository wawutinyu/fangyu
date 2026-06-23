<template>
  <div class="chat-interface" :class="{ expanded: expanded }">
    <div class="chat-bar" @click="expanded = !expanded">
      <div class="chat-bar-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>运行预览</span>
      </div>
      <div class="chat-bar-right">
        <span v-if="messages.length > 0" class="chat-msg-count">{{ messages.length }} 条消息</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :style="{ transform: expanded ? 'rotate(180deg)' : '' }"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>

    <div v-if="expanded" class="chat-body">
      <div class="chat-messages" ref="msgListRef">
        <div v-if="messages.length === 0" class="chat-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bfbeba" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="chat-empty-text">在下方输入消息，运行当前流程</span>
        </div>
        <div v-for="(msg, i) in messages" :key="i" class="chat-msg" :class="'msg-' + msg.role">
          <div class="msg-avatar">
            <svg v-if="msg.role === 'user'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="msg-content">
            <div class="msg-name">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
            <div class="msg-text" v-html="renderMarkdown(msg.content)"></div>
            <div v-if="msg.logs && msg.logs.length > 0" class="msg-logs">
              <div class="msg-logs-toggle" @click="msg._showLogs = !msg._showLogs">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                执行日志 ({{ msg.logs.length }})
              </div>
              <div v-if="msg._showLogs" class="msg-logs-body">
                <div v-for="(log, li) in msg.logs" :key="li" class="log-line" :class="'log-' + log.type">
                  <span class="log-icon">{{ log.type === 'start' ? '▶' : log.type === 'complete' ? '✓' : '✗' }}</span>
                  <span class="log-node">{{ log.nodeName }}</span>
                  <span class="log-info">
                    <template v-if="log.type === 'start'">输入: {{ truncate(log.data.inputs, 60) }}</template>
                    <template v-else-if="log.type === 'complete'">输出: {{ truncate(log.data.outputs, 60) }}</template>
                    <template v-else>{{ log.data.error }}</template>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="running" class="chat-msg msg-assistant">
          <div class="msg-avatar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="msg-content">
            <div class="msg-name">AI</div>
            <div class="msg-text typing">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
            </div>
          </div>
        </div>
      </div>

      <div class="chat-input-area">
        <div class="chat-input-row">
          <input
            ref="inputRef"
            class="chat-input"
            v-model="inputText"
            placeholder="输入消息，按 Enter 发送..."
            @keydown.enter.prevent="sendMessage"
            :disabled="running"
          />
          <button class="chat-send-btn" :disabled="running || !inputText.trim()" @click="sendMessage">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { Executor } from '../utils/executor'

const props = defineProps({ lf: { type: Object, default: null } })

const expanded = ref(true)
const inputText = ref('')
const messages = ref([])
const running = ref(false)
const msgListRef = ref(null)
const inputRef = ref(null)

watch(expanded, () => { nextTick(() => scrollToBottom()) })

function scrollToBottom() {
  nextTick(() => {
    if (msgListRef.value) {
      msgListRef.value.scrollTop = msgListRef.value.scrollHeight
    }
  })
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || running.value || !props.lf) return
  inputText.value = ''
  running.value = true

  messages.value.push({
    role: 'user',
    content: text,
    _showLogs: false,
  })
  scrollToBottom()

  const executor = new Executor(props.lf)
  executor.setExternalInputs({ query: text })
  executor.setGlobalVars({ _chatHistory: buildChatHistory() })

  try {
    const result = await executor.run()
    const logs = executor.getLogs()

    const lastLLM = result.results?.find(r => r.type === 'llm' && r.outputs?.result)
    const output = lastLLM?.outputs?.result || ''

    messages.value.push({
      role: 'assistant',
      content: output || '(流程执行完成，无输出)',
      logs,
      _showLogs: logs.length > 0,
    })
  } catch (err) {
    messages.value.push({
      role: 'assistant',
      content: `执行出错: ${err.message}`,
      logs: [],
      _showLogs: false,
    })
  }

  running.value = false
  scrollToBottom()
}

function buildChatHistory() {
  const history = []
  const msgs = messages.value
  for (let i = Math.max(0, msgs.length - 10); i < msgs.length; i++) {
    const m = msgs[i]
    if (m.role === 'user') history.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant' && m.content) history.push({ role: 'assistant', content: m.content })
  }
  return history
}

function truncate(val, len) {
  if (!val) return '—'
  const s = typeof val === 'string' ? val : JSON.stringify(val)
  return s.length > len ? s.slice(0, len) + '…' : s
}

function renderMarkdown(text) {
  if (!text) return ''
  let html = escapeHtml(text)
  html = html.replace(/\n/g, '<br>')
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  })
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return html
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
</script>

<style scoped>
.chat-interface {
  border-top: 1px solid var(--border-color);
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.chat-interface.expanded {
  height: 280px;
}
.chat-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
}
.chat-bar:hover { background: var(--bg-hover); }
.chat-bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.chat-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chat-msg-count {
  font-size: 11px;
  color: var(--text-muted);
}
.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  min-height: 80px;
}
.chat-empty-text {
  font-size: 12px;
  color: var(--text-muted);
}
.chat-msg {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.msg-user .msg-avatar { background: #e8e8e6; color: #37352f; }
.msg-assistant .msg-avatar { background: #37352f; color: #fff; }
.msg-content {
  flex: 1;
  min-width: 0;
}
.msg-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 2px;
}
.msg-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-word;
  white-space: pre-wrap;
}
.msg-text :deep(pre) {
  background: #f5f5f3;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  font-size: 11px;
  line-height: 1.5;
  margin: 6px 0;
}
.msg-text :deep(code) {
  background: #f0f0ee;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}
.msg-text :deep(pre code) {
  background: none;
  padding: 0;
}
.typing {
  display: flex;
  gap: 3px;
  align-items: center;
  padding: 4px 0;
}
.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typingBounce 1.4s infinite ease-in-out both;
}
.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }
.typing-dot:nth-child(3) { animation-delay: 0s; }
@keyframes typingBounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
.msg-logs { margin-top: 6px; }
.msg-logs-toggle {
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}
.msg-logs-toggle:hover { color: var(--text-primary); }
.msg-logs-body {
  margin-top: 4px;
  background: #fafaf8;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 6px 8px;
  max-height: 120px;
  overflow-y: auto;
  font-size: 10px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
}
.log-line {
  display: flex;
  gap: 4px;
  padding: 2px 0;
  align-items: flex-start;
}
.log-icon { flex-shrink: 0; font-weight: 700; }
.log-start .log-icon { color: #1890ff; }
.log-complete .log-icon { color: #52c41a; }
.log-error .log-icon { color: #ff4d4f; }
.log-node {
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
  white-space: nowrap;
}
.log-info {
  color: var(--text-muted);
  word-break: break-all;
}
.chat-input-area {
  padding: 8px 12px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}
.chat-input-row {
  display: flex;
  gap: 6px;
}
.chat-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 13px;
  outline: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.chat-input:focus { border-color: var(--text-primary); }
.chat-input:disabled { opacity: 0.5; }
.chat-send-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-md);
  background: #37352f;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s;
}
.chat-send-btn:hover { background: #2b2a26; }
.chat-send-btn:disabled { background: #d0d0ce; cursor: not-allowed; }
</style>
