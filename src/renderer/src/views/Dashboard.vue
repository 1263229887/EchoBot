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

    <div class="scheduler-panel">
      <div class="scheduler-header">
        <h3>定时任务</h3>
        <button class="btn-add" @click="showAddForm = !showAddForm">
          {{ showAddForm ? '取消添加' : '+ 新建任务' }}
        </button>
      </div>

      <div v-if="showAddForm" class="add-form">
        <div class="form-row">
          <label>任务名称</label>
          <input v-model="newTask.name" type="text" placeholder="如：黄金价格提醒" />
        </div>
        <div class="form-row">
          <label>执行方式</label>
          <select v-model="newTask.scheduleType">
            <option value="hourly">每小时整点</option>
            <option value="daily">每天定时</option>
            <option value="interval">间隔分钟</option>
          </select>
        </div>
        <div v-if="newTask.scheduleType === 'daily'" class="form-row">
          <label>执行时间</label>
          <input v-model="newTask.time" type="time" />
        </div>
        <div v-if="newTask.scheduleType === 'interval'" class="form-row">
          <label>间隔分钟</label>
          <input v-model.number="newTask.intervalMinutes" type="number" min="1" />
        </div>
        <div class="form-row">
          <label>AI 提问内容</label>
          <input v-model="newTask.prompt" type="text" placeholder="如：查询当前黄金价格" />
        </div>
        <div class="form-actions">
          <button class="btn-create" @click="createTask">创建任务</button>
        </div>
      </div>

      <div v-if="schedulerEvents.length > 0" class="scheduler-events">
        <div v-for="(event, i) in schedulerEvents.slice(-5)" :key="i" :class="['event-item', event.type]">
          <span class="event-time">{{ event.time }}</span>
          <span class="event-msg">{{ event.taskName }}: {{ event.message || (event.type === 'run' ? '执行中...' : event.type) }}</span>
        </div>
      </div>

      <div class="task-list" v-if="tasks.length > 0">
        <div v-for="task in tasks" :key="task.id" :class="['task-item', { disabled: !task.enabled }]">
          <div class="task-info">
            <div class="task-name">{{ task.name }}</div>
            <div class="task-schedule">
              {{ task.scheduleType === 'hourly' ? '每小时整点' : task.scheduleType === 'daily' ? `每天 ${task.time}` : `每${task.intervalMinutes}分钟` }}
              <span class="task-prompt">{{ task.prompt }}</span>
            </div>
            <div class="task-meta">
              执行 {{ task.runCount || 0 }} 次
              <span v-if="task.lastRunAt">，上次 {{ formatTime(new Date(task.lastRunAt).getTime()) }}</span>
            </div>
          </div>
          <div class="task-actions">
            <button class="btn-run" @click="runTask(task.id)">立即执行</button>
            <button :class="['btn-toggle', task.enabled ? 'on' : 'off']" @click="toggleTask(task.id)">
              {{ task.enabled ? '已启用' : '已禁用' }}
            </button>
            <button class="btn-delete" @click="removeTask(task.id)">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty">暂无定时任务</div>
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

// Scheduler state
const tasks = ref([])
const schedulerEvents = ref([])
const showAddForm = ref(false)
const newTask = ref({
  name: '',
  scheduleType: 'hourly',
  time: '09:00',
  intervalMinutes: 60,
  prompt: '查询当前黄金价格'
})

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

// Scheduler functions
async function loadTasks() {
  tasks.value = await window.api.listScheduledTasks()
}

async function createTask() {
  if (!newTask.value.name.trim() || !newTask.value.prompt.trim()) return
  await window.api.addScheduledTask({ ...newTask.value })
  await loadTasks()
  showAddForm.value = false
  newTask.value = {
    name: '',
    scheduleType: 'hourly',
    time: '09:00',
    intervalMinutes: 60,
    prompt: '查询当前黄金价格'
  }
}

async function runTask(id) {
  const task = tasks.value.find((t) => t.id === id)
  if (!task) return
  const now = new Date()
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  schedulerEvents.value.push({ type: 'run', taskId: id, taskName: task.name, message: '开始执行...', time: timeStr })
  try {
    const result = await window.api.runScheduledTask(id)
    if (result.success) {
      schedulerEvents.value.push({ type: 'success', taskId: id, taskName: task.name, message: result.reply?.slice(0, 50), time: timeStr })
    } else {
      schedulerEvents.value.push({ type: 'error', taskId: id, taskName: task.name, message: result.error, time: timeStr })
    }
    await loadTasks()
  } catch (err) {
    schedulerEvents.value.push({ type: 'error', taskId: id, taskName: task.name, message: err.message, time: timeStr })
  }
}

async function toggleTask(id) {
  await window.api.toggleScheduledTask(id)
  await loadTasks()
}

async function removeTask(id) {
  await window.api.deleteScheduledTask(id)
  await loadTasks()
}

function onSchedulerEvent(data) {
  schedulerEvents.value.push(data)
  if (schedulerEvents.value.length > 20) {
    schedulerEvents.value = schedulerEvents.value.slice(-20)
  }
}

function onStatus(data) {
  running.value = data.running
  processedCount.value = data.processedCount
  logs.value = data.logs || []
}

onMounted(async () => {
  window.api.onStatusUpdate(onStatus)
  window.api.onSchedulerEvent(onSchedulerEvent)
  const s = await window.api.getStatus()
  onStatus(s)
  await loadTasks()
})

onUnmounted(() => {
  window.api.removeStatusListener()
  window.api.removeSchedulerListener()
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

/* Scheduler Panel */
.scheduler-panel {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 20px;
}
.scheduler-panel h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.scheduler-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.btn-add {
  padding: 4px 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-add:hover { background: var(--accent-hover); }

/* Add Form */
.add-form {
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 16px;
  margin-bottom: 12px;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.form-row label {
  min-width: 80px;
  font-size: 13px;
  color: var(--text-secondary);
}
.form-row input,
.form-row select {
  flex: 1;
  padding: 8px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
}
.form-row input:focus,
.form-row select:focus {
  outline: none;
  border-color: var(--accent);
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.btn-create {
  padding: 8px 20px;
  background: var(--success);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-create:hover { background: #2db84e; }

/* Scheduler Events */
.scheduler-events {
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 12px;
}
.event-item {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
}
.event-item:last-child { border-bottom: none; }
.event-time { color: var(--text-tertiary); }
.event-item.run .event-msg { color: var(--accent); }
.event-item.success .event-msg { color: var(--success); }
.event-item.error .event-msg { color: var(--danger); }

/* Task List */
.task-list { margin-top: 8px; }
.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
}
.task-item:last-child { border-bottom: none; }
.task-item.disabled { opacity: 0.5; }
.task-info { flex: 1; }
.task-name { font-size: 14px; font-weight: 500; color: var(--text-primary); margin-bottom: 4px; }
.task-schedule { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.task-prompt { color: var(--accent); margin-left: 8px; }
.task-meta { font-size: 11px; color: var(--text-tertiary); }
.task-actions { display: flex; gap: 8px; }
.btn-toggle {
  padding: 4px 10px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-toggle.on { background: var(--success); color: #fff; }
.btn-toggle.on:hover { background: #2db84e; }
.btn-toggle.off { background: var(--bg-input); color: var(--text-tertiary); border: 1px solid var(--border-light); }
.btn-toggle.off:hover { background: var(--border); }
.btn-run {
  padding: 4px 10px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-run:hover { background: var(--accent-hover); }

.btn-delete {
  padding: 4px 10px;
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-delete:hover { background: var(--danger); color: #fff; }
</style>
