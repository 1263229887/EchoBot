<template>
  <div class="dashboard">
    <h2>监控面板</h2>

    <div class="controls">
      <button :class="['btn', running ? 'btn-stop' : 'btn-start']" @click="toggle">
        {{ running ? '停止轮询' : '开始轮询' }}
      </button>
      <span :class="['status-dot', running ? 'on' : 'off']"></span>
      <span class="status-text">{{ running ? '运行中' : '已停止' }}</span>
      <span class="count">已处理: {{ processedCount }}</span>
    </div>

    <div class="ai-send-panel">
      <div class="ai-send-row">
        <input
          v-model="aiInput"
          type="text"
          placeholder="输入内容，AI 回复后自动发送到目标窗口..."
          class="ai-input"
          :disabled="aiSending"
          @keyup.enter="doAISend"
        />
        <button class="btn-ai-send" :disabled="aiSending || !aiInput.trim()" @click="doAISend">
          {{ aiSending ? 'AI 思考中...' : '发送' }}
        </button>
      </div>
      <div v-if="aiStatus" :class="['ai-status', aiStatusType]">{{ aiStatus }}</div>
    </div>

    <div class="log-panel">
      <div class="log-header">
        <h3>消息日志</h3>
        <button v-if="logs.length > 0" class="btn-clear" @click="clearLogs">清空</button>
      </div>
      <div class="log-list" ref="logList">
        <div v-if="logs.length === 0" class="empty">暂无日志</div>
        <div v-for="(log, i) in reversedLogs" :key="i" :class="['log-item', log.type]">
          <span class="log-time">{{ formatTime(log.time) }}</span>
          <span class="log-tag">{{ tagMap[log.type] || log.type }}</span>
          <span class="log-msg">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const running = ref(false)
const processedCount = ref(0)
const logs = ref([])
const aiInput = ref('')
const aiSending = ref(false)
const aiStatus = ref('')
const aiStatusType = ref('')

async function doAISend() {
  if (!aiInput.value.trim() || aiSending.value) return
  aiSending.value = true
  aiStatus.value = ''
  try {
    const result = await window.api.aiSendMessage(aiInput.value.trim())
    if (result.success) {
      aiStatus.value = '已发送'
      aiStatusType.value = 'success'
      aiInput.value = ''
    } else {
      aiStatus.value = result.error || '发送失败'
      aiStatusType.value = 'error'
    }
  } catch (err) {
    aiStatus.value = err.message
    aiStatusType.value = 'error'
  } finally {
    aiSending.value = false
  }
}

const tagMap = { info: '提问', ai: 'AI', send: '发送', skip: '跳过', error: '错误' }

const reversedLogs = computed(() => [...logs.value].reverse())

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString()
}

async function toggle() {
  if (running.value) {
    await window.api.stopPolling()
  } else {
    await window.api.startPolling()
  }
}

async function clearLogs() {
  logs.value = []
  await window.api.clearLogs()
}

function onStatus(data) {
  running.value = data.running
  processedCount.value = data.processedCount
  logs.value = data.logs || []
}

onMounted(async () => {
  window.api.onStatusUpdate(onStatus)
  const s = await window.api.getStatus()
  onStatus(s)
})

onUnmounted(() => {
  window.api.removeStatusListener()
})
</script>

<style scoped>
.dashboard { max-width: 720px; }
h2 {
  margin: 0 0 24px;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.3px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
}
.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: #fff;
  transition: background var(--transition);
}
.btn-start { background: var(--success); }
.btn-start:hover { background: #2db84e; }
.btn-stop { background: var(--danger); }
.btn-stop:hover { background: #e02020; }
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.status-dot.on {
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}
.status-dot.off { background: var(--border); }
.status-text {
  font-size: 14px;
  color: var(--text-secondary);
}
.count {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-tertiary);
}
.ai-send-panel {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 20px;
}
.ai-send-row {
  display: flex;
  gap: 8px;
}
.ai-input {
  flex: 1;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}
.ai-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}
.btn-ai-send {
  padding: 10px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition);
}
.btn-ai-send:hover { background: var(--accent-hover); }
.btn-ai-send:disabled { opacity: 0.6; cursor: not-allowed; }
.ai-status {
  margin-top: 8px;
  font-size: 13px;
}
.ai-status.success { color: var(--success); }
.ai-status.error { color: var(--danger); }
.log-panel {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
}
.log-panel h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.btn-clear {
  padding: 4px 12px;
  background: var(--bg-input);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-clear:hover {
  background: var(--danger);
  color: #fff;
  border-color: var(--danger);
}
.log-list { max-height: 420px; overflow-y: auto; }
.empty { color: var(--text-tertiary); font-size: 13px; }
.log-item {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
}
.log-time { color: var(--text-tertiary); min-width: 70px; }
.log-tag {
  min-width: 40px;
  text-align: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
}
.log-item.info .log-tag { background: var(--accent); }
.log-item.ai .log-tag { background: #af52de; }
.log-item.send .log-tag { background: var(--success); }
.log-item.skip .log-tag { background: var(--warning); }
.log-item.error .log-tag { background: var(--danger); }
.log-msg {
  flex: 1;
  color: var(--text-primary);
  word-break: break-all;
}
</style>
