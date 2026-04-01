import axios from 'axios'

export async function askAnthropic(question, settings, { systemOverride, maxTokens } = {}) {
  const { baseUrl, apiKey, modelId } = settings.anthropic
  const url = `${baseUrl}/v1/messages`

  let systemContent = systemOverride !== undefined ? systemOverride : settings.systemPrompt
  const apiUrl = settings.apiUrl || ''
  const talker = settings.talker || ''
  if (systemContent) {
    systemContent = systemContent.replace(/\{apiUrl\}/g, apiUrl).replace(/\{talker\}/g, talker)
  }
  const body = {
    model: modelId,
    max_tokens: maxTokens || 4096,
    messages: [{ role: 'user', content: question }]
  }
  if (systemContent) {
    body.system = systemContent
  }

  try {
    const response = await axios.post(url, body, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      timeout: 180000
    })

    const content = response.data.content
    if (Array.isArray(content)) {
      return content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
    }
    return String(content)
  } catch (err) {
    const detail = err.response?.data
    console.error('[Anthropic] Request failed:', err.response?.status, JSON.stringify(detail, null, 2))
    throw new Error(detail?.error?.message || err.message)
  }
}
