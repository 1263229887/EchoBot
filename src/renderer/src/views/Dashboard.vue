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

    <div class="log-panel">
      <h3>消息日志</h3>
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
h2 { margin: 0 0 20px; color: #e94560; }
.controls { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.btn {
  padding: 10px 24px; border: none; border-radius: 6px;
  font-size: 14px; cursor: pointer; color: #fff;
}
.btn-start { background: #4caf50; }
.btn-start:hover { background: #43a047; }
.btn-stop { background: #e94560; }
.btn-stop:hover { background: #c73650; }
.status-dot {
  width: 10px; height: 10px; border-radius: 50%;
}
.status-dot.on { background: #4caf50; box-shadow: 0 0 6px #4caf50; }
.status-dot.off { background: #666; }
.status-text { font-size: 14px; color: #a0a0b0; }
.count { margin-left: auto; font-size: 13px; color: #888; }
.log-panel { background: #16213e; border-radius: 8px; padding: 16px 20px; }
.log-panel h3 { margin: 0 0 12px; font-size: 14px; color: #a0a0b0; }
.log-list { max-height: 420px; overflow-y: auto; }
.empty { color: #555; font-size: 13px; }
.log-item { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid #0f3460; font-size: 13px; }
.log-time { color: #555; min-width: 70px; }
.log-tag {
  min-width: 40px; text-align: center; padding: 1px 6px; border-radius: 3px;
  font-size: 11px; color: #fff;
}
.log-item.info .log-tag { background: #1976d2; }
.log-item.ai .log-tag { background: #7b1fa2; }
.log-item.send .log-tag { background: #4caf50; }
.log-item.skip .log-tag { background: #ff9800; }
.log-item.error .log-tag { background: #e94560; }
.log-msg { flex: 1; color: #ccc; word-break: break-all; }
</style>
