<template>
  <div class="chat-summary">
    <h2>群聊总结</h2>

    <section class="section">
      <h3>选择日期</h3>
      <div class="row">
        <div class="field">
          <input type="date" v-model="selectedDate" />
        </div>
        <button class="btn-fetch" :disabled="loading" @click="fetchHistory">
          {{ loading ? '获取中...' : '获取记录' }}
        </button>
      </div>
    </section>

    <section v-if="chatText" class="section">
      <div class="stats-row">
        <h3>聊天记录</h3>
        <span class="stats">{{ messageCount }} 条有效消息 / {{ totalRaw }} 条原始</span>
      </div>
      <div class="chat-preview">{{ chatText }}</div>
      <div class="summary-actions">
        <button class="btn-summarize" :disabled="summarizing" @click="doSummarize">
          {{ summarizing ? 'AI 总结中...' : '生成 AI 总结' }}
        </button>
      </div>
    </section>

    <section v-if="summary" class="section summary-section">
      <h3>AI 总结</h3>
      <div class="summary-content">{{ summary }}</div>
      <div class="publish-actions">
        <button class="btn-publish" :disabled="publishing" @click="doPublish">
          {{ publishing ? '发布中...' : '发布到 GitHub Pages 并发送' }}
        </button>
      </div>
      <div v-if="publishStatus" :class="['publish-status', publishType]">
        {{ publishStatus }}
      </div>
      <div v-if="publishedUrl" class="published-url">
        <a :href="publishedUrl" target="_blank">{{ publishedUrl }}</a>
      </div>
    </section>

    <section v-if="errorMsg" class="section error-section">
      <p class="error-text">{{ errorMsg }}</p>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const selectedDate = ref(new Date().toISOString().slice(0, 10))
const loading = ref(false)
const summarizing = ref(false)
const publishing = ref(false)
const chatText = ref('')
const messageCount = ref(0)
const totalRaw = ref(0)
const summary = ref('')
const errorMsg = ref('')
const publishStatus = ref('')
const publishType = ref('')
const publishedUrl = ref('')

async function fetchHistory() {
  loading.value = true
  errorMsg.value = ''
  summary.value = ''
  chatText.value = ''
  try {
    const date = selectedDate.value.replace(/-/g, '')
    const result = await window.api.fetchChatHistory({ date })
    chatText.value = result.text
    messageCount.value = result.messageCount
    totalRaw.value = result.totalRaw
    if (!result.text.trim()) {
      errorMsg.value = '该日期没有聊天记录'
    }
  } catch (err) {
    errorMsg.value = `获取失败: ${err.message}`
  } finally {
    loading.value = false
  }
}

async function doSummarize() {
  summarizing.value = true
  errorMsg.value = ''
  try {
    summary.value = await window.api.summarizeChat(chatText.value)
  } catch (err) {
    errorMsg.value = `总结失败: ${err.message}`
  } finally {
    summarizing.value = false
  }
}

async function doPublish() {
  publishing.value = true
  publishStatus.value = ''
  publishType.value = ''
  publishedUrl.value = ''
  try {
    const date = selectedDate.value.replace(/-/g, '')
    const result = await window.api.publishSummary({ summary: summary.value, date })
    if (result.success) {
      publishedUrl.value = result.url
    }
  } catch (err) {
    publishStatus.value = `发布失败: ${err.message}`
    publishType.value = 'error'
  } finally {
    publishing.value = false
  }
}

function onPublishUpdate(data) {
  publishStatus.value = data.message
  publishType.value = data.type
  if (data.type === 'done') {
    publishedUrl.value = data.message
    publishStatus.value = '发布成功，链接已发送到群聊'
    publishType.value = 'done'
  }
}

onMounted(() => {
  window.api.onPublishStatus(onPublishUpdate)
})

onUnmounted(() => {
  window.api.removePublishListener()
})
</script>

<style scoped>
.chat-summary { max-width: 720px; }
h2 {
  margin: 0 0 24px;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.3px;
}
.section {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 20px 24px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}
h3 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.row { display: flex; gap: 12px; align-items: flex-end; }
.field { flex: 1; }
.field input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
}
.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}
.btn-fetch, .btn-summarize {
  padding: 10px 24px;
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
.btn-fetch:hover, .btn-summarize:hover { background: var(--accent-hover); }
.btn-fetch:disabled, .btn-summarize:disabled { opacity: 0.6; cursor: not-allowed; }
.stats-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.stats-row h3 { margin: 0; }
.stats { font-size: 12px; color: var(--text-tertiary); }
.chat-preview {
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}
.summary-actions { margin-top: 12px; }
.summary-content {
  padding: 12px;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.error-section { border-left: 3px solid var(--danger); }
.error-text { color: var(--danger); font-size: 14px; margin: 0; }
.publish-actions { margin-top: 12px; }
.btn-publish {
  padding: 10px 24px;
  background: var(--success);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-publish:hover { background: #2db84e; }
.btn-publish:disabled { opacity: 0.6; cursor: not-allowed; }
.publish-status {
  margin-top: 8px;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-input);
}
.publish-status.progress { color: var(--accent); }
.publish-status.done { color: var(--success); }
.publish-status.error { color: var(--danger); }
.published-url {
  margin-top: 8px;
  font-size: 13px;
}
.published-url a {
  color: var(--accent);
  text-decoration: none;
  word-break: break-all;
}
.published-url a:hover { text-decoration: underline; }
</style>
