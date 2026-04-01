import axios from 'axios'

export async function askAI(question, settings, { systemOverride, maxTokens } = {}) {
  const { baseUrl, apiKey, modelId } = settings.minimax
  const url = `${baseUrl}/chat/completions`

  let systemContent = systemOverride !== undefined ? systemOverride : settings.systemPrompt
  const apiUrl = settings.apiUrl || ''
  const talker = settings.talker || ''
  if (systemContent) {
    systemContent = systemContent.replace(/\{apiUrl\}/g, apiUrl).replace(/\{talker\}/g, talker)
  }
  const messages = []
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent })
  }
  messages.push({ role: 'user', content: question })

  const body = { model: modelId, messages }
  if (maxTokens) body.max_tokens = maxTokens

  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 180000
  })

  let content = response.data.choices[0].message.content
  // Strip <think>...</think> reasoning blocks from response
  content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()
  return content
}

export function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim())
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}
