import { execFile } from 'child_process'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import axios from 'axios'
import { askAI } from './ai'
import { askOpenClaw } from './openclaw'
import { askAnthropic } from './anthropic'
import { askGemini } from './gemini'

const REPO = '1263229887/my-webpage'
const PAGES_BASE = `https://1263229887.github.io/my-webpage`

/**
 * Generate a clean HTML page from summary text.
 */
export function generateHTML(summary, date) {
  const title = `群聊总结 - ${date}`
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f7; color: #1d1d1f;
  padding: 40px 20px; line-height: 1.8;
}
.container {
  max-width: 680px; margin: 0 auto;
  background: #fff; border-radius: 16px;
  padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
.meta { font-size: 13px; color: #86868b; margin-bottom: 24px; }
.content {
  font-size: 15px; white-space: pre-wrap;
  word-break: break-word; color: #333;
}
.footer {
  margin-top: 32px; padding-top: 16px;
  border-top: 1px solid #e5e5e7;
  font-size: 12px; color: #86868b; text-align: center;
}
</style>
</head>
<body>
<div class="container">
<h1>${title}</h1>
<div class="meta">生成时间: ${new Date().toLocaleString('zh-CN')}</div>
<div class="content">${escapeHTML(summary)}</div>
<div class="footer">由 无双Bot 自动生成</div>
</div>
</body>
</html>`
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Extract pure HTML from AI response (strip markdown code fences).
 */
function extractHTML(text) {
  const match = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/i)
  if (match) return match[0]
  // Try stripping code fences
  const stripped = text.replace(/^```\w*\n?/gm, '').replace(/```$/gm, '').trim()
  const match2 = stripped.match(/<!DOCTYPE html>[\s\S]*<\/html>/i)
  return match2 ? match2[0] : stripped
}

/**
 * Route AI call based on aiMode setting.
 */
async function callAIForHTML(question, settings, systemPrompt) {
  const opts = { systemOverride: systemPrompt, maxTokens: 16384 }
  if (settings.aiMode === 'openclaw') {
    return askOpenClaw(question, settings, opts)
  } else if (settings.aiMode === 'anthropic') {
    return askAnthropic(question, settings, opts)
  } else if (settings.aiMode === 'gemini') {
    return askGemini(question, settings, opts)
  }
  return askAI(question, settings, opts)
}

const HTML_SYSTEM_PROMPT =
  '你是一个网页设计师。请根据群聊记录直接分析并生成一个完整的、自包含的 HTML 群聊日报页面。\n' +
  '你需要自己阅读聊天记录，提取话题、统计发言、分析人物特点，然后生成网页。\n\n' +
  '## 内容结构要求（参照模板）\n' +
  '页面必须包含以下区块，按顺序排列：\n' +
  '1. 顶部总评卡片：群名+日期标题、英文副标题、整体概述段落（生动有趣的文风）\n' +
  '2. 话题网格：每个话题一张独立卡片，包含：\n' +
  '   - 编号+emoji标题（有趣、接地气的中文标题）+ 英文副标题\n' +
  '   - 参与者（圆角胶囊标签样式）\n' +
  '   - 时间段\n' +
  '   - 过程描述（详细生动的叙述，保留群友原话亮点，所有 @xx 提及必须用 <span style="color:#007AFF;font-weight:600">@xx</span> 高亮显示）\n' +
  '   - 评价（带左侧彩色边框的引用样式，点评要有洞察力）\n' +
  '   - 重要/激烈的话题卡片应跨列展示（更宽）\n' +
  '3. 其他提及话题：emoji+文字列表，简短有趣\n' +
  '4. 热门词云：从聊天记录中提取高频关键词，标签云样式，大小不一\n' +
  '5. 活跃发言者 TOP 排行：统计每人发言条数，带进度条的排行榜\n' +
  '6. 个性化趣味卡片（每个都是独立的大卡片，风格各异）：\n' +
  '   - 👑 群聊发言王：居中大字显示昵称 + 发言数 + 一段生动的颁奖词描述TA当天的表现\n' +
  '   - 💃 大胆发言 NO.1：选出当天最"放飞自我"的人，展示TA的经典语录节选（引用原话，标注时间），配上幽默点评\n' +
  '   - 🦉 熬夜冠军 TOP 3：列出最晚发言的3人，显示昵称+最后发言时间，用卡片列表样式\n' +
  '   - 如果聊天内容有其他有趣的维度，可以自由发挥增加榜单（如：最爱发图片、话题终结者、捧哏王等）\n' +
  '   注意：每个趣味榜单都要有自己的个性，不要只是干巴巴列名字，要有血有肉有故事！\n\n' +
  '## UI 设计要求（macOS 风格）\n' +
  '- macOS 设计语言：简洁、优雅、大量留白、圆角卡片、毛玻璃质感\n' +
  '- 字体：-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif\n' +
  '- 配色：浅灰背景 (#f5f5f7)，半透明白色卡片，蓝色主题色 (#007AFF)\n' +
  '- 毛玻璃效果：卡片使用 background: rgba(255,255,255,0.72); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); 实现 macOS 风格的磨砂玻璃质感\n' +
  '- 页面背景可加一层淡淡的渐变色（如从浅蓝到浅紫），让毛玻璃效果更明显\n' +
  '- 卡片：半透明白色背景、16px 圆角、1px rgba(255,255,255,0.5) 边框、柔和阴影 (0 8px 32px rgba(0,0,0,0.08))\n' +
  '- macOS 窗口风格：顶部总评卡片可模拟 macOS 窗口标题栏，左上角加红黄绿三个小圆点装饰\n' +
  '- 参与者标签：圆角胶囊样式，半透明浅蓝底色 (rgba(0,122,255,0.1))，backdrop-filter: blur(8px)\n' +
  '- 评价区块：左侧 3px 蓝色边框 + 半透明浅蓝背景\n' +
  '- 所有 @xx 群成员提及统一用主题色 #007AFF 加粗高亮\n' +
  '- 响应式网格布局，移动端友好\n' +
  '- 趣味卡片可以用不同的强调色区分（金色、粉色、紫色等），让每张卡片有辨识度\n\n' +
  '## 动画要求（Apple 风格）\n' +
  '- 卡片滚动进入视口时淡入上移（CSS @keyframes + IntersectionObserver）\n' +
  '- 卡片 hover 时轻微上浮 + 阴影加深\n' +
  '- 进度条加载动画\n' +
  '- 所有动画使用 CSS 实现，不依赖外部库\n\n' +
  '## 技术要求\n' +
  '- 完整自包含的 HTML 文件，所有 CSS 内联在 <style> 标签中\n' +
  '- 不使用任何外部 CDN（不用 Tailwind、不用 Font Awesome）\n' +
  '- 用 Unicode emoji 代替图标库\n' +
  '- 底部标注 "由 无双Bot 自动生成"\n' +
  '- 只返回完整的 HTML 代码，不要任何解释文字\n' +
  '- 不要使用 Markdown 代码块包裹，直接返回 HTML'

/**
 * Use AI to generate a styled HTML page directly from chat records.
 */
export async function generateHTMLWithAI(chatText, date, settings) {
  const question =
    `日期: ${date}\n生成时间: ${new Date().toLocaleString('zh-CN')}\n\n` +
    `以下是今日群聊记录原文，请分析并生成网页日报：\n\n${chatText}`
  const reply = await callAIForHTML(question, settings, HTML_SYSTEM_PROMPT)
  return extractHTML(reply)
}

/**
 * Use AI to refine an existing HTML page based on user feedback.
 */
export async function refineHTMLWithAI(currentHTML, feedback, settings) {
  const systemPrompt =
    '你之前生成了一个 HTML 页面，用户对效果不满意。\n' +
    '请根据用户的修改意见调整 HTML。只返回完整的修改后 HTML 代码，不要解释。'
  const question =
    `当前 HTML：\n\n${currentHTML}\n\n用户修改意见：${feedback}`
  const reply = await callAIForHTML(question, settings, systemPrompt)
  return extractHTML(reply)
}

/**
 * Run a git command in the given cwd, return stdout.
 */
function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout.trim())
    })
  })
}

/**
 * Clone repo (shallow), write HTML, commit & push, return the filename.
 */
export async function pushToGitHub(html, date, settings) {
  const tmpDir = join(app.getPath('temp'), 'echobot-publish')
  const repoUrl = settings.githubRepoUrl || `https://github.com/${REPO}.git`

  // Clean and clone
  if (existsSync(tmpDir)) {
    await git(['rm', '-rf', tmpDir], app.getPath('temp')).catch(() => {})
    const { rmSync } = await import('fs')
    rmSync(tmpDir, { recursive: true, force: true })
  }
  mkdirSync(tmpDir, { recursive: true })

  await git(['clone', '--depth', '1', repoUrl, '.'], tmpDir)

  // Write HTML file
  const filename = `summary-${date}.html`
  writeFileSync(join(tmpDir, filename), html, 'utf-8')

  // Git add, commit, push
  await git(['add', filename], tmpDir)
  await git(['commit', '-m', `Add chat summary for ${date}`], tmpDir)
  await git(['push'], tmpDir)

  return filename
}

/**
 * Poll GitHub Actions for the latest workflow run triggered by push.
 * Returns 'success', 'failure', or throws on timeout.
 */
export async function waitForDeploy(settings, { onStatus } = {}) {
  const repo = settings.githubRepo || REPO
  const apiUrl = `https://api.github.com/repos/${repo}/actions/runs?per_page=1&event=push`
  const maxAttempts = 30 // 30 * 10s = 5 min max
  let lastStatus = ''

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 10000))
    try {
      const res = await axios.get(apiUrl, { timeout: 10000 })
      const run = res.data.workflow_runs?.[0]
      if (!run) continue

      const status = `${run.status}${run.conclusion ? `:${run.conclusion}` : ''}`
      if (status !== lastStatus) {
        lastStatus = status
        onStatus?.(status)
      }

      if (run.status === 'completed') {
        return run.conclusion // 'success' or 'failure'
      }
    } catch {
      // Network hiccup, keep polling
    }
  }
  throw new Error('GitHub Actions 部署超时 (5分钟)')
}

/**
 * Get the full Pages URL for a summary file.
 */
export function getPagesUrl(filename, settings) {
  const base = settings.githubPagesBase || PAGES_BASE
  return `${base}/${filename}`
}
