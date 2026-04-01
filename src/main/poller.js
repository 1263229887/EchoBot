import axios from 'axios'
import { createHash } from 'crypto'
import { askAI, stripMarkdown } from './ai'
import { askOpenClaw } from './openclaw'
import { askAnthropic } from './anthropic'
import { askGemini } from './gemini'
import { generateImage } from './imageGen'
import { sendReply, sendImageReply } from './autotype'
import { loadProcessedIds, saveProcessedIds, loadContentHashes, saveContentHashes } from './store'
import { fetchChatHistory, formatForSummary, getLastChatContext } from './chatHistory'

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

  // Update settings in-place while running (e.g. after user changes settings)
  updateSettings(settings) {
    this.settings = settings
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
    } else if (this.settings.aiMode === 'anthropic') {
      reply = await askAnthropic(question, this.settings)
    } else if (this.settings.aiMode === 'gemini') {
      reply = await askGemini(question, this.settings)
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
    } else if (this.settings.aiMode === 'anthropic') {
      reply = await askAnthropic(question, this.settings, opts)
    } else if (this.settings.aiMode === 'gemini') {
      reply = await askGemini(question, this.settings, opts)
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

  isImageRequest(question) {
    const keywords = ['画', '生成图片', '生成一张', '生成一幅', '画一个', '画一张', '画一幅', '帮我画', '给我画', 'draw', 'generate image']
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
          // Check if this is an image generation request
          if (this.isImageRequest(question) && this.settings.gemini?.apiKey) {
            this.addLog('info', '检测到画图意图，生成图片中...')
            const imagePath = await generateImage(question, this.settings)
            this.addLog('ai', `图片已生成: ${imagePath}`)
            await sendImageReply(imagePath, this.settings.coordinates)
            this.addLog('send', '已发送图片')
          } else {
            // Check if question is about group chat content — if so, fetch fresh data
            let finalQuestion = question
            if (this.isAboutChatHistory(question)) {
              try {
                this.addLog('info', '检测到群聊查询意图，正在获取今日聊天记录...')
                const today = new Date()
                const y = today.getFullYear()
                const m = String(today.getMonth() + 1).padStart(2, '0')
                const d = String(today.getDate()).padStart(2, '0')
                const dateStr = `${y}${m}${d}`
                const groupId = this.settings.talker.includes('@chatroom')
                  ? this.settings.talker
                  : `${this.settings.talker}@chatroom`
                const result = await fetchChatHistory({
                  apiUrl: this.settings.apiUrl,
                  talker: this.settings.talker,
                  date: dateStr,
                  botSender: this.settings.botSender,
                  groupId
                })
                const chatContext = formatForSummary(result.messages)
                if (chatContext.trim()) {
                  finalQuestion =
                    `以下是今日群聊历史记录（共 ${result.messages.length} 条有效消息）：\n\n${chatContext}\n\n` +
                    `用户提问：${question}`
                  this.addLog('info', `已获取 ${result.messages.length} 条消息并注入上下文`)
                } else {
                  this.addLog('info', '今日暂无群聊记录')
                }
              } catch (err) {
                this.addLog('warn', `获取群聊记录失败: ${err.message}`)
              }
            }
            const reply = await this.callAI(finalQuestion)
            this.addLog('ai', `AI回复: ${reply.slice(0, 80)}`)
            await sendReply(reply, this.settings.coordinates)
            this.addLog('send', '已发送回复')
          }
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