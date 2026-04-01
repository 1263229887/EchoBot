import axios from 'axios'

// In-memory cache for chat summaries (keyed by "talker|date")
const summaryCache = new Map()
// In-memory cache for cleaned chat text (for @reply context injection)
let lastChatContext = ''

/**
 * Fetch chat history from API in ChatLab format, clean it, return structured data.
 * @param {object} opts - { apiUrl, talker, date, botSender, groupId, keyword }
 *   date: 'YYYYMMDD' string
 *   botSender: the bot's wxid to filter out
 *   groupId: the chatroom's platformId, used to filter out group-as-speaker messages (withdrawn/recalled messages)
 *   keyword: optional text filter on message content
 */
export async function fetchChatHistory({ apiUrl, talker, date, botSender, groupId, keyword }) {
  const baseUrl = apiUrl.replace(/\/messages\/?$/, '/messages')
  // date is 'YYYYMMDD', compute next day for end range (exclusive)
  const y = parseInt(date.slice(0, 4), 10)
  const m = parseInt(date.slice(4, 6), 10) - 1
  const d = parseInt(date.slice(6, 8), 10)
  const next = new Date(y, m, d + 1)
  const endDate = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`

  const res = await axios.get(baseUrl, {
    params: { talker, chatlab: 1, start: date, end: endDate, limit: 10000, keyword: keyword || undefined },
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

  // Compute target day boundaries (local time, in ms) for filtering
  const dayStartMs = new Date(y, m, d).getTime()
  const dayEndMs = next.getTime()

  // Filter and clean messages
  const cleaned = data.messages
    .filter((m) => {
      // Normalize timestamp to ms (API may return seconds or milliseconds)
      const ts = m.timestamp < 1e12 ? m.timestamp * 1000 : m.timestamp
      // Only keep messages within the target date
      if (ts < dayStartMs || ts >= dayEndMs) return false
      // Filter out bot's own messages
      if (botSender && m.sender === botSender) return false
      // Filter out group-as-speaker messages (withdrawn/recalled messages, sender = groupId)
      if (groupId && m.sender === groupId) return false
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
 * Check if a message is low-value noise (pure emoji, ultra-short filler, etc.)
 */
function isNoiseMessage(content) {
  const trimmed = content.trim()
  // Pure emoji (no CJK/latin chars)
  if (/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Component}\s]+$/u.test(trimmed) && trimmed.length <= 10) return true
  // Ultra-short filler words
  const fillers = new Set(['嗯', '哦', '好', '好的', '好吧', '行', '行吧', '是', '对', '啊', '呢', '吧', '了', '哈', '嗯嗯', '哦哦', '好好', '收到', '1', '111', '+1', '?', '？', '。', '...', '……', '哈哈', '哈哈哈', '哈哈哈哈', '呵呵', '嘿嘿', '666', '牛', '牛逼', 'nb', 'ok', 'OK', 'Ok'])
  if (fillers.has(trimmed)) return true
  return false
}

/**
 * Format cleaned messages into readable text for AI summarization.
 * Applies compression: removes noise, deduplicates spam, strips quote prefixes.
 */
export function formatForSummary(messages) {
  const lines = []
  let lastContent = ''
  let repeatCount = 0

  for (const m of messages) {
    // Skip noise messages
    if (isNoiseMessage(m.content)) continue

    // Strip WeChat quote/reply prefix (「xxx：\nyyy」\n- - - - - - - - -\n)
    let content = m.content.replace(/「[^」]*」[\s]*-{2,}[\s-]*/g, '').trim()
    if (!content) continue

    // Deduplicate consecutive identical messages (spam)
    if (content === lastContent) {
      repeatCount++
      continue
    }
    if (repeatCount > 0) {
      lines[lines.length - 1] += ` (x${repeatCount + 1})`
      repeatCount = 0
    }
    lastContent = content

    const ts = m.timestamp < 1e12 ? m.timestamp * 1000 : m.timestamp
    const time = new Date(ts).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
    lines.push(`[${time}] ${m.nick}: ${content}`)
  }

  // Handle trailing repeats
  if (repeatCount > 0 && lines.length > 0) {
    lines[lines.length - 1] += ` (x${repeatCount + 1})`
  }

  return lines.join('\n')
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
