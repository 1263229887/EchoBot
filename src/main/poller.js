import axios from 'axios'
import { createHash } from 'crypto'
import { askAI, stripMarkdown } from './ai'
import { askOpenClaw } from './openclaw'
import { sendReply } from './autotype'
import { loadProcessedIds, saveProcessedIds, loadContentHashes, saveContentHashes } from './store'
import { getLastChatContext } from './chatHistory'

export class Poller {
  constructor(mainWindow) {
    this.mainWindow = mainWindow
    this.timer = null
    this.running = false
    this.polling = false
    this.settings = null
    this.processedIds = loadProcessedIds()
    this.contentHashes = loadContentHashes()
    this.logs = []
    this.welcomeSent = false
    this.smartReplyCooldown = 0
  }

  start(settings) {
    if (this.running) return
    this.settings = settings
    this.running = true
    this.welcomeSent = false
    this.smartReplyCooldown = 0
    this.startedAt = Math.floor(Date.now() / 1000)
    this.poll()
    this.timer = setInterval(() => this.poll(), settings.pollingInterval)
    this.pushStatus()

    if (settings.enableWelcome && settings.welcomeMessage) {
      setTimeout(() => this.sendWelcome(), 2000)
    }
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

  clearLogs() {
    this.logs = []
    this.pushStatus()
  }

  hashContent(text) {
    return createHash('md5').update(text).digest('hex')
  }

  async sendWelcome() {
    if (this.welcomeSent || !this.running) return
    this.welcomeSent = true
    try {
      await sendReply(this.settings.welcomeMessage, this.settings.coordinates)
      this.addLog('send', '已发送欢迎语')
    } catch (err) {
      this.addLog('error', `欢迎语发送失败: ${err.message}`)
    }
  }

  async callAI(question) {
    let reply
    if (this.settings.aiMode === 'openclaw') {
      reply = await askOpenClaw(question, this.settings)
    } else {
      reply = await askAI(question, this.settings)
    }
    return stripMarkdown(reply)
  }

  async callAIWithSystem(question, systemPrompt) {
    const opts = { systemOverride: systemPrompt }
    let reply
    if (this.settings.aiMode === 'openclaw') {
      reply = await askOpenClaw(question, this.settings, opts)
    } else {
      reply = await askAI(question, this.settings, opts)
    }
    return stripMarkdown(reply)
  }

  isAboutChatHistory(question) {
    const keywords = ['聊了什么', '聊天记录', '群里', '大家说', '讨论了', '总结', '之前说', '刚才说', '上面说', '前面说', '谁说了', '说过什么']
    const q = question.toLowerCase()
    return keywords.some((k) => q.includes(k))
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

      const allMessages = res.data.messages.filter(
        (m) => m.localType === 1 && m.isSend === 0 && m.createTime >= this.startedAt
      )

      const atMessages = allMessages.filter((m) => m.parsedContent?.includes(triggerKeyword))
      const otherMessages = allMessages.filter((m) => !m.parsedContent?.includes(triggerKeyword))

      // Process @ mentions first (priority)
      for (const msg of atMessages) {
        if (this.processedIds.has(msg.localId)) continue
        this.processedIds.add(msg.localId)
        saveProcessedIds(this.processedIds)

        const question = msg.parsedContent
          .split(triggerKeyword)
          .slice(1)
          .join(triggerKeyword)
          .trim()
        if (!question) continue

        const hash = this.hashContent(question)
        if (this.contentHashes.has(hash)) {
          this.addLog('skip', `重复内容跳过: ${question.slice(0, 30)}`)
          continue
        }
        this.contentHashes.add(hash)
        saveContentHashes(this.contentHashes)

        this.addLog('info', `收到提问: ${question.slice(0, 50)}`)
        try {
          // Check if question is about group chat content and we have context
          const chatContext = getLastChatContext()
          let finalQuestion = question
          if (chatContext && this.isAboutChatHistory(question)) {
            finalQuestion =
              `以下是群聊历史记录供你参考：\n\n${chatContext}\n\n` +
              `用户提问：${question}`
            this.addLog('info', '已注入群聊上下文')
          }
          const reply = await this.callAI(finalQuestion)
          this.addLog('ai', `AI回复: ${reply.slice(0, 80)}`)
          await sendReply(reply, this.settings.coordinates)
          this.addLog('send', '已发送回复')
        } catch (err) {
          this.addLog('error', `处理失败: ${err.message}`)
        }
      }

      // Smart context reply for non-@ messages
      if (this.settings.enableSmartReply && this.smartReplyCooldown <= 0) {
        const unprocessed = otherMessages.filter((m) => !this.processedIds.has(m.localId))
        if (unprocessed.length > 0) {
          await this.handleSmartReply(unprocessed)
        }
      }
      if (this.smartReplyCooldown > 0) this.smartReplyCooldown--
    } catch (err) {
      this.addLog('error', `轮询出错: ${err.message}`)
    } finally {
      this.polling = false
    }
  }

  async handleSmartReply(messages) {
    for (const m of messages) {
      this.processedIds.add(m.localId)
    }
    saveProcessedIds(this.processedIds)

    const context = messages
      .map((m) => m.parsedContent || '')
      .filter(Boolean)
      .join('\n')
    if (!context.trim()) return

    const smartPrompt = this.settings.smartReplyPrompt || ''
    const userMessage = `以下是群里最近的聊天记录：\n\n${context}\n\n请根据以上内容决定是否回复。如果不需要回复，只回复"[SKIP]"。`

    this.addLog('info', `智能分析 ${messages.length} 条消息...`)

    try {
      const reply = await this.callAIWithSystem(userMessage, smartPrompt)

      if (reply.includes('[SKIP]') || !reply.trim()) {
        this.addLog('skip', '智能回复: 无需回复')
      } else {
        this.addLog('ai', `智能回复: ${reply.slice(0, 80)}`)
        await sendReply(reply, this.settings.coordinates)
        this.addLog('send', '已发送智能回复')
      }
      this.smartReplyCooldown = 3
    } catch (err) {
      this.addLog('error', `智能回复失败: ${err.message}`)
    }
  }
}