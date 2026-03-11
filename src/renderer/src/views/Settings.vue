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
    </section>

    <section class="section">
      <h3>AI 模式</h3>
      <div class="mode-switch">
        <button :class="['mode-btn', form.aiMode === 'minimax' && 'active']" @click="form.aiMode = 'minimax'">MiniMax 直连</button>
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
  openclaw: { wsUrl: '', token: '', sessionKey: '' },
  coordinates: { x: 0, y: 0 }
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
h2 { margin: 0 0 20px; color: #e94560; }
.section { background: #16213e; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
h3 { margin: 0 0 12px; font-size: 14px; color: #a0a0b0; }
.field { margin-bottom: 10px; }
.field label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; }
.field input {
  width: 100%; padding: 8px 10px; background: #1a1a2e; border: 1px solid #0f3460;
  border-radius: 4px; color: #e0e0e0; font-size: 14px; box-sizing: border-box;
}
.field input:focus { outline: none; border-color: #e94560; }
.row { display: flex; gap: 12px; align-items: flex-end; }
.row .field { flex: 1; }
.btn-capture {
  padding: 8px 16px; background: #0f3460; color: #fff; border: none;
  border-radius: 4px; cursor: pointer; white-space: nowrap; margin-bottom: 10px;
}
.btn-capture:hover { background: #e94560; }
.mode-switch { display: flex; gap: 8px; }
.mode-btn {
  padding: 8px 20px; background: #1a1a2e; border: 1px solid #0f3460;
  border-radius: 4px; color: #a0a0b0; cursor: pointer; font-size: 13px;
}
.mode-btn.active { background: #0f3460; color: #fff; border-color: #e94560; }
.actions { margin-top: 20px; display: flex; align-items: center; gap: 12px; }
.btn-save {
  padding: 10px 28px; background: #e94560; color: #fff; border: none;
  border-radius: 6px; font-size: 15px; cursor: pointer;
}
.btn-save:hover { background: #c73650; }
.saved-tip { color: #4caf50; font-size: 14px; }
</style>
