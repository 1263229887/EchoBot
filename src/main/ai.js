import axios from 'axios'

export async function askAI(question, settings, { systemOverride } = {}) {
  const { baseUrl, apiKey, modelId } = settings.minimax
  const url = `${baseUrl}/chat/completions`

  const systemContent = systemOverride !== undefined ? systemOverride : settings.systemPrompt
  const messages = []
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent })
  }
  messages.push({ role: 'user', content: question })

  const response = await axios.post(
    url,
    { model: modelId, messages },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  )

  return response.data.choices[0].message.content
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
