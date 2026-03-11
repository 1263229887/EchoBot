import axios from 'axios'

export async function askAI(question, settings) {
  const { baseUrl, apiKey, modelId } = settings.minimax
  const url = `${baseUrl}/chat/completions`

  const response = await axios.post(
    url,
    {
      model: modelId,
      messages: [{ role: 'user', content: question }]
    },
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
