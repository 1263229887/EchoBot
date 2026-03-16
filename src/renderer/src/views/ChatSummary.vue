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
      <div class="prompt-toggle" @click="showPrompt = !showPrompt">
        {{ showPrompt ? '收起提示词 ▲' : '查看/编辑提示词 ▼' }}
      </div>
      <div v-if="showPrompt" class="prompt-editor">
        <textarea v-model="systemPrompt" class="prompt-textarea" rows="10"></textarea>
        <button class="btn-reset" @click="systemPrompt = defaultPrompt">恢复默认</button>
      </div>
      <div class="summary-actions">
        <button class="btn-generate" :disabled="generating" @click="doGenerateHTML">
          {{ generating ? 'AI 生成网页中...' : '生成网页日报' }}
        </button>
      </div>
    </section>

    <section v-if="generatedHTML" class="section summary-section">
      <h3>网页已生成</h3>
      <div class="preview-section">
        <div class="preview-actions">
          <button class="btn-preview" @click="doPreview">在浏览器中预览</button>
          <button class="btn-publish" :disabled="publishing" @click="doPublish">
            {{ publishing ? '发布中...' : '发布到 GitHub Pages 并发送' }}
          </button>
        </div>
        <div class="refine-row">
          <input
            v-model="feedbackText"
            type="text"
            placeholder="对网页不满意？输入修改意见后回车..."
            class="feedback-input"
            :disabled="refining"
            @keyup.enter="doRefine"
          />
          <button class="btn-refine" :disabled="refining || !feedbackText.trim()" @click="doRefine">
            {{ refining ? '修改中...' : '重新生成' }}
          </button>
        </div>
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
const publishing = ref(false)
const generating = ref(false)
const refining = ref(false)
const chatText = ref('')
const messageCount = ref(0)
const totalRaw = ref(0)
const generatedHTML = ref('')
const feedbackText = ref('')
const errorMsg = ref('')
const publishStatus = ref('')
const publishType = ref('')
const publishedUrl = ref('')
const settings = ref({})
const systemPrompt = ref('')
const defaultPrompt = ref('')
const showPrompt = ref(false)

async function fetchHistory() {
  loading.value = true
  errorMsg.value = ''
  chatText.value = ''
  generatedHTML.value = ''
  feedbackText.value = ''
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

async function doGenerateHTML() {
  generating.value = true
  errorMsg.value = ''
  try {
    const date = selectedDate.value.replace(/-/g, '')
    const result = await window.api.generateHTML({ chatText: chatText.value, date, customSystemPrompt: systemPrompt.value })
    generatedHTML.value = result.html
    // Auto-preview if setting enabled
    if (settings.value.previewBeforePublish !== false) {
      await window.api.previewHTML({ html: result.html, date })
    }
  } catch (err) {
    errorMsg.value = `生成网页失败: ${err.message}`
  } finally {
    generating.value = false
  }
}

async function doPreview() {
  const date = selectedDate.value.replace(/-/g, '')
  await window.api.previewHTML({ html: generatedHTML.value, date })
}

async function doRefine() {
  if (!feedbackText.value.trim()) return
  refining.value = true
  errorMsg.value = ''
  try {
    const result = await window.api.refineHTML({
      chatText: chatText.value,
      date: selectedDate.value.replace(/-/g, ''),
      feedback: feedbackText.value,
      customSystemPrompt: systemPrompt.value
    })
    generatedHTML.value = result.html
    feedbackText.value = ''
    // Auto-preview after refinement
    const date = selectedDate.value.replace(/-/g, '')
    await window.api.previewHTML({ html: result.html, date })
  } catch (err) {
    errorMsg.value = `修改失败: ${err.message}`
  } finally {
    refining.value = false
  }
}

async function doPublish() {
  publishing.value = true
  publishStatus.value = ''
  publishType.value = ''
  publishedUrl.value = ''
  try {
    const date = selectedDate.value.replace(/-/g, '')
    const result = await window.api.publishSummary({
      summary: chatText.value,
      date,
      html: generatedHTML.value || undefined
    })
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

onMounted(async () => {
  settings.value = await window.api.loadSettings()
  window.api.onPublishStatus(onPublishUpdate)
  try {
    const res = await window.api.getHTMLPrompt()
    defaultPrompt.value = res.prompt
    systemPrompt.value = res.prompt
  } catch {}
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
.btn-fetch {
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
.btn-fetch:hover { background: var(--accent-hover); }
.btn-fetch:disabled { opacity: 0.6; cursor: not-allowed; }
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
.error-section { border-left: 3px solid var(--danger); }
.error-text { color: var(--danger); font-size: 14px; margin: 0; }
.publish-actions { margin-top: 12px; display: flex; gap: 8px; }
.btn-generate {
  padding: 10px 24px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-generate:hover { background: var(--accent-hover); }
.btn-generate:disabled { opacity: 0.6; cursor: not-allowed; }
.preview-section { margin-top: 12px; }
.preview-actions { display: flex; gap: 8px; margin-bottom: 10px; }
.btn-preview {
  padding: 10px 24px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-preview:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
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
.refine-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.feedback-input {
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
.feedback-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}
.btn-refine {
  padding: 10px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition);
}
.btn-refine:hover { background: var(--accent-hover); }
.btn-refine:disabled { opacity: 0.6; cursor: not-allowed; }
.prompt-toggle {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--accent);
  cursor: pointer;
  user-select: none;
}
.prompt-toggle:hover { text-decoration: underline; }
.prompt-editor { margin-bottom: 12px; }
.prompt-textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  box-sizing: border-box;
}
.prompt-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}
.btn-reset {
  margin-top: 6px;
  padding: 6px 16px;
  background: var(--bg-input);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-reset:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
</style>
