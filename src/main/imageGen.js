import axios from 'axios'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const IMAGE_MODEL = '[L]gemini-3.1-flash-image-preview'

/**
 * Generate an image from a text prompt using Gemini image API.
 * Returns the local file path of the saved image.
 */
export async function generateImage(prompt, settings) {
  const { baseUrl, apiKey } = settings.gemini
  const url = `${baseUrl}/chat/completions`

  const body = {
    model: IMAGE_MODEL,
    stream: false,
    messages: [{ role: 'user', content: `Generate an image: ${prompt}` }]
  }

  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  })

  const content = response.data.choices[0].message.content

  // Extract base64 image data from markdown image syntax
  const match = content.match(/data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)/)
  if (!match) {
    throw new Error('AI 未返回图片数据')
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  const base64Data = match[2]
  const buffer = Buffer.from(base64Data, 'base64')

  // Save to temp directory
  const imgDir = join(app.getPath('temp'), 'wushuangbot-images')
  if (!existsSync(imgDir)) {
    mkdirSync(imgDir, { recursive: true })
  }
  const filename = `img-${Date.now()}.${ext}`
  const filepath = join(imgDir, filename)
  writeFileSync(filepath, buffer)

  console.log(`[ImageGen] Saved image: ${filepath} (${buffer.length} bytes)`)
  return filepath
}
