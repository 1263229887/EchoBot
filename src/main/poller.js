import axios from 'axios'
import { createHash } from 'crypto'
import { askAI } from './ai'
import { askOpenClaw } from './openclaw'
import { sendReply } from './autotype'
import { loadProcessedIds, saveProcessedIds, loadContentHashes, saveContentHashes } from './store'

export class Poller {
  constructor(mainWindow) {
    this.mainWindow = mainWindow
    this.timer = null
    this.running = false
    this.polling = false // lock to prevent concurrent polls
    this.settings = null
    this.processedIds = loadProcessedIds()
    this.contentHashes = loadContentHashes()
    this.logs = []
  }

  start(settings) {
    if (this.running) return
    this.settings = settings
    this.running = true
    this.poll()
    this.timer = setInterval(() => this.poll(), settings.pollingInterval)
    this.pushStatus()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.running = false
    this.pushStatus()
  }

  get status() {
    return {
      running: this.running,
      processedCount: this.processedIds.size,
      logs: this.logs.slice(-50)
    }
  }

  pushStatus() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('poller:status', this.status)
    }
  }

  addLog(type, message) {
    this.logs.push({ type, message, time: Date.now() })
    if (this.logs.length > 200) this.logs = this.logs.slice(-100)
    this.pushStatus()
  }

  hashContent(text) {
    return createHash('md5').update(text).digest('hex')
  }

  async poll() {
    if (!this.settings || this.polling) return
    this.polling = true
    try {
      const { apiUrl, talker, limit, triggerKeyword } = this.settings
      const res = await axios.get(apiUrl, { params: { talker, limit }, timeout: 10000 })

      if (!res.data.success) {
        this.addLog('error', 'API returned success=false')
        return
      }

      const messages = res.data.messages.filter(
        (m) => m.localType === 1 && m.isSend === 0 && m.parsedContent?.includes(triggerKeyword)
      )

      for (const msg of messages) {
        if (this.processedIds.has(msg.localId)) continue

        // Mark as processed IMMEDIATELY to prevent duplicate processing
        this.processedIds.add(msg.localId)
        saveProcessedIds(this.processedIds)

        const question = msg.parsedContent.split(triggerKeyword).slice(1).join(triggerKeyword).trim()
        if (!question) continue

        const hash = this.hashContent(question)
        if (this.contentHashes.has(hash)) {
          this.addLog('skip', `重复内容跳过: ${question.slice(0, 30)}`)
          continue
        }

        // Mark content hash BEFORE calling AI
        this.contentHashes.add(hash)
        saveContentHashes(this.contentHashes)

        this.addLog('info', `收到提问: ${question.slice(0, 50)}`)

        try {
          let reply
          if (this.settings.aiMode === 'openclaw') {
            reply = await askOpenClaw(question, this.settings)
          } else {
            reply = await askAI(question, this.settings)
          }
          this.addLog('ai', `AI回复: ${reply.slice(0, 80)}`)

          await sendReply(reply, this.settings.coordinates)
          this.addLog('send', '已发送回复')
        } catch (err) {
          this.addLog('error', `处理失败: ${err.message}`)
        }
      }
    } catch (err) {
      this.addLog('error', `轮询出错: ${err.message}`)
    } finally {
      this.polling = false
    }
  }
}
