import axios from 'axios'

export async function askGemini(question, settings, { systemOverride, maxTokens } = {}) {
  const { baseUrl, apiKey, modelId } = settings.gemini
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

  const body = { model: modelId, stream: false, messages }
  if (maxTokens) body.max_tokens = maxTokens

  try {
    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 180000
    })

    let content = response.data.choices[0].message.content
    // Strip <think>...</think> reasoning blocks if present
    content = content.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()
    return content
  } catch (err) {
    const detail = err.response?.data
    console.error('[Gemini] Request failed:', err.response?.status, JSON.stringify(detail, null, 2))
    throw new Error(detail?.error?.message || err.message)
  }
}
