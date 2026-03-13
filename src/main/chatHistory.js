import axios from 'axios'

// In-memory cache for chat summaries (keyed by "talker|date")
const summaryCache = new Map()
// In-memory cache for cleaned chat text (for @reply context injection)
let lastChatContext = ''

/**
 * Fetch chat history from API in ChatLab format, clean it, return structured data.
 * @param {object} opts - { apiUrl, talker, date, botSender }
 *   date: 'YYYYMMDD' string
 *   botSender: the bot's wxid to filter out
 */
export async function fetchChatHistory({ apiUrl, talker, date, botSender }) {
  const baseUrl = apiUrl.replace(/\/messages\/?$/, '/messages')
  const res = await axios.get(baseUrl, {
    params: { talker, chatlab: 1, start: date, end: date, limit: 10000 },
    timeout: 30000
  })

  const data = res.data
  if (!data.messages || !Array.isArray(data.messages)) {
    throw new Error('API 返回数据格式异常')
  }

  // Build member nickname map (platformId -> groupNickname or accountName)
  const memberMap = new Map()
  if (data.members) {
    for (const m of data.members) {
      memberMap.set(m.platformId, m.groupNickname || m.accountName || m.platformId)
    }
  }

  // Filter and clean messages
  const cleaned = data.messages
    .filter((m) => {
      // Filter out bot's own messages
      if (botSender && m.sender === botSender) return false
      // Only keep text messages (type 0)
      if (m.type !== 0) return false
      // Skip empty
      if (!m.content || !m.content.trim()) return false
      return true
    })
    .map((m) => {
      const nick = memberMap.get(m.sender) || m.accountName || '未知'
      return { nick, content: m.content.trim(), timestamp: m.timestamp }
    })

  return { messages: cleaned, totalRaw: data.messages.length, memberMap }
}

/**
 * Format cleaned messages into readable text for AI summarization.
 */
export function formatForSummary(messages) {
  return messages
    .map((m) => {
      const time = new Date(m.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      })
      return `[${time}] ${m.nick}: ${m.content}`
    })
    .join('\n')
}

/**
 * Get/set summary cache.
 */
export function getCachedSummary(talker, date) {
  return summaryCache.get(`${talker}|${date}`) || null
}

export function setCachedSummary(talker, date, summary) {
  summaryCache.set(`${talker}|${date}`, summary)
}

/**
 * Store the latest chat context for @reply context injection.
 */
export function setLastChatContext(text) {
  lastChatContext = text
}

export function getLastChatContext() {
  return lastChatContext
}
