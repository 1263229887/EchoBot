import { execFile } from 'child_process'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import axios from 'axios'

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
