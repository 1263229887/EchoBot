<template>
  <div class="settings">
    <h2>参数设置</h2>

    <section class="section">
      <h3>消息接口</h3>
      <div class="field">
        <label>API 地址</label>
        <input v-model="form.apiUrl" type="text" placeholder="http://127.0.0.1:5031/api/v1/messages" />
      </div>
      <div class="field">
        <label>Talker</label>
        <input v-model="form.talker" type="text" placeholder="20038138259@chatroom" />
      </div>
      <div class="row">
        <div class="field">
          <label>消息数量 (limit)</label>
          <input v-model.number="form.limit" type="number" min="1" max="100" />
        </div>
        <div class="field">
          <label>轮询间隔 (ms)</label>
          <input v-model.number="form.pollingInterval" type="number" min="1000" step="1000" />
        </div>
      </div>
    </section>

    <section class="section">
      <h3>触发关键词</h3>
      <div class="field">
        <label>关键词</label>
        <input v-model="form.triggerKeyword" type="text" placeholder="@双" />
      </div>
      <div class="field">
        <label>Bot Sender ID</label>
        <input v-model="form.botSender" type="text" placeholder="wxid_xxx（用于群聊总结时过滤Bot自身消息）" />
      </div>
    </section>

    <section class="section">
      <h3>系统提示词</h3>
      <p class="hint">指导 AI 以纯文本格式回复，避免 Markdown 语法</p>
      <div class="field">
        <textarea v-model="form.systemPrompt" rows="4" placeholder="请用纯文本回复..."></textarea>
      </div>
    </section>

    <section class="section">
      <h3>欢迎语</h3>
      <div class="toggle-row">
        <label class="toggle">
          <input type="checkbox" v-model="form.enableWelcome" />
          <span class="toggle-slider"></span>
        </label>
        <span>启动轮询时发送欢迎语</span>
      </div>
      <div v-if="form.enableWelcome" class="field">
        <textarea v-model="form.welcomeMessage" rows="3" placeholder="大家好！我是 无双Bot..."></textarea>
      </div>
    </section>

    <section class="section">
      <h3>智能上下文回复</h3>
      <div class="toggle-row">
        <label class="toggle">
          <input type="checkbox" v-model="form.enableSmartReply" />
          <span class="toggle-slider"></span>
        </label>
        <span>分析所有消息，选择性智能回复</span>
      </div>
      <p class="hint">开启后，即使没有 @，也会根据聊天内容判断是否需要回复</p>
      <div v-if="form.enableSmartReply" class="field">
        <label>智能回复人设提示词</label>
        <textarea v-model="form.smartReplyPrompt" rows="5" placeholder="你是群聊里的一个普通群友..."></textarea>
      </div>
    </section>

    <section class="section">
      <h3>AI 模式</h3>
      <div class="mode-switch">
        <button :class="['mode-btn', form.aiMode === 'minimax' && 'active']" @click="form.aiMode = 'minimax'">MiniMax 直连</button>
        <button :class="['mode-btn', form.aiMode === 'anthropic' && 'active']" @click="form.aiMode = 'anthropic'">Anthropic 直连</button>
        <button :class="['mode-btn', form.aiMode === 'gemini' && 'active']" @click="form.aiMode = 'gemini'">Gemini 直连</button>
        <button :class="['mode-btn', form.aiMode === 'openclaw' && 'active']" @click="form.aiMode = 'openclaw'">OpenClaw</button>
      </div>
    </section>

    <section v-if="form.aiMode === 'minimax'" class="section">
      <h3>MiniMax AI</h3>
      <div class="field">
        <label>Base URL</label>
        <input v-model="form.minimax.baseUrl" type="text" />
      </div>
      <div class="field">
        <label>API Key</label>
        <input v-model="form.minimax.apiKey" type="password" />
      </div>
      <div class="field">
        <label>模型 ID</label>
        <input v-model="form.minimax.modelId" type="text" />
      </div>
    </section>

    <section v-if="form.aiMode === 'anthropic'" class="section">
      <h3>Anthropic AI</h3>
      <div class="field">
        <label>Base URL</label>
        <input v-model="form.anthropic.baseUrl" type="text" placeholder="http://43.159.144.102:3000/api" />
      </div>
      <div class="field">
        <label>API Key</label>
        <input v-model="form.anthropic.apiKey" type="password" />
      </div>
      <div class="field">
        <label>模型 ID</label>
        <input v-model="form.anthropic.modelId" type="text" placeholder="claude-code-opus-4-6" />
      </div>
    </section>

    <section v-if="form.aiMode === 'gemini'" class="section">
      <h3>Gemini AI</h3>
      <div class="field">
        <label>Base URL</label>
        <input v-model="form.gemini.baseUrl" type="text" placeholder="https://new.lemonapi.site/v1" />
      </div>
      <div class="field">
        <label>API Key</label>
        <input v-model="form.gemini.apiKey" type="password" />
      </div>
      <div class="field">
        <label>模型 ID</label>
        <input v-model="form.gemini.modelId" type="text" placeholder="[L]gemini-3-pro-preview" />
      </div>
    </section>

    <section v-if="form.aiMode === 'openclaw'" class="section">
      <h3>OpenClaw</h3>
      <div class="field">
        <label>WebSocket 地址</label>
        <input v-model="form.openclaw.wsUrl" type="text" placeholder="ws://localhost:18789/ws" />
      </div>
      <div class="field">
        <label>Token</label>
        <input v-model="form.openclaw.token" type="password" />
      </div>
      <div class="field">
        <label>Session Key</label>
        <input v-model="form.openclaw.sessionKey" type="text" placeholder="agent:main:main" />
      </div>
    </section>

    <section class="section">
      <h3>GitHub Pages 发布</h3>
      <p class="hint">群聊总结生成后可一键发布到 GitHub Pages</p>
      <div class="toggle-row">
        <label class="toggle">
          <input type="checkbox" v-model="form.useAIGeneratedHTML" />
          <span class="toggle-slider"></span>
        </label>
        <span>使用 AI 生成网页（关闭则使用默认模板）</span>
      </div>
      <div class="toggle-row">
        <label class="toggle">
          <input type="checkbox" v-model="form.previewBeforePublish" />
          <span class="toggle-slider"></span>
        </label>
        <span>发布前在浏览器中预览</span>
      </div>
      <div class="field">
        <label>仓库 Git URL</label>
        <input v-model="form.githubRepoUrl" type="text" placeholder="https://github.com/user/repo.git" />
      </div>
      <div class="field">
        <label>仓库标识 (owner/repo)</label>
        <input v-model="form.githubRepo" type="text" placeholder="user/repo" />
      </div>
      <div class="field">
        <label>Pages 基础 URL</label>
        <input v-model="form.githubPagesBase" type="text" placeholder="https://user.github.io/repo" />
      </div>
    </section>

    <section class="section">
      <h3>回复窗口坐标</h3>
      <div class="row">
        <div class="field">
          <label>X</label>
          <input v-model.number="form.coordinates.x" type="number" />
        </div>
        <div class="field">
          <label>Y</label>
          <input v-model.number="form.coordinates.y" type="number" />
        </div>
        <button class="btn-capture" :disabled="capturing" @click="captureCoord">
          {{ capturing ? `${countdown}s 后捕获...` : '点击捕获' }}
        </button>
      </div>
    </section>

    <div class="actions">
      <button class="btn-save" @click="save">保存设置</button>
      <span v-if="saved" class="saved-tip">已保存</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'

const form = reactive({
  apiUrl: '',
  talker: '',
  limit: 30,
  triggerKeyword: '',
  pollingInterval: 3000,
  aiMode: 'minimax',
  minimax: { baseUrl: '', apiKey: '', modelId: '' },
  anthropic: { baseUrl: '', apiKey: '', modelId: '' },
  gemini: { baseUrl: '', apiKey: '', modelId: '' },
  openclaw: { wsUrl: '', token: '', sessionKey: '' },
  coordinates: { x: 0, y: 0 },
  systemPrompt: '',
  enableWelcome: false,
  welcomeMessage: '',
  enableSmartReply: false,
  smartReplyPrompt: '',
  botSender: '',
  useAIGeneratedHTML: true,
  previewBeforePublish: true,
  githubRepoUrl: '',
  githubRepo: '',
  githubPagesBase: ''
})
const saved = ref(false)
const capturing = ref(false)
const countdown = ref(0)

onMounted(async () => {
  const s = await window.api.loadSettings()
  Object.assign(form, s)
  window.api.onCaptureCountdown((seconds) => {
    countdown.value = seconds
  })
})

onUnmounted(() => {
  window.api.removeCaptureListener()
})

async function save() {
  await window.api.saveSettings(JSON.parse(JSON.stringify(form)))
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}

async function captureCoord() {
  capturing.value = true
  countdown.value = 3
  const result = await window.api.captureCoordinate()
  if (result) {
    form.coordinates.x = result.x
    form.coordinates.y = result.y
  }
  capturing.value = false
  countdown.value = 0
}
</script>

<style scoped>
.settings { max-width: 640px; }
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
.hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}
.field { margin-bottom: 10px; }
.field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.field input,
.field textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color var(--transition), box-shadow var(--transition);
  resize: vertical;
}
.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}
.row { display: flex; gap: 12px; align-items: flex-end; }
.row .field { flex: 1; }
.btn-capture {
  padding: 8px 16px;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  margin-bottom: 10px;
  font-size: 13px;
  transition: all var(--transition);
}
.btn-capture:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
.mode-switch {
  display: flex;
  background: var(--bg-input);
  border-radius: var(--radius-sm);
  padding: 2px;
}
.mode-btn {
  flex: 1;
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all var(--transition);
}
.mode-btn.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}
/* macOS toggle switch */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--text-primary);
}
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  inset: 0;
  background: #d1d1d6;
  border-radius: 12px;
  cursor: pointer;
  transition: background var(--transition);
}
.toggle-slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 2px;
  top: 2px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition);
}
.toggle input:checked + .toggle-slider { background: var(--accent); }
.toggle input:checked + .toggle-slider::before { transform: translateX(20px); }
.actions {
  margin-top: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.btn-save {
  padding: 10px 28px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-save:hover { background: var(--accent-hover); }
.saved-tip { color: var(--success); font-size: 14px; }
</style>