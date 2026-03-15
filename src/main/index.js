import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadSettings, saveSettings } from './store'
import { Poller } from './poller'
import { fetchChatHistory, formatForSummary, getCachedSummary, setCachedSummary, setLastChatContext } from './chatHistory'
import { askAI, stripMarkdown } from './ai'
import { askOpenClaw } from './openclaw'
import { askAnthropic } from './anthropic'
import { askGemini } from './gemini'
import { generateHTML, generateHTMLWithAI, refineHTMLWithAI, pushToGitHub, waitForDeploy, getPagesUrl } from './publisher'
import { sendReply } from './autotype'
import { mouse } from '@nut-tree-fork/nut-js'

let mainWindow = null
let poller = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  poller = new Poller(mainWindow)
}

// IPC handlers
function registerIPC() {
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (_e, settings) => {
    saveSettings(settings)
    return true
  })
  ipcMain.handle('poller:start', () => {
    const settings = loadSettings()
    poller.start(settings)
    return true
  })
  ipcMain.handle('poller:stop', () => {
    poller.stop()
    return true
  })
  ipcMain.handle('poller:status', () => poller.status)
  ipcMain.handle('poller:clearLogs', () => {
    poller.clearLogs()
    return true
  })

  // Coordinate capture: countdown 3s then read mouse position
  ipcMain.handle('coordinate:capture', async () => {
    // Send countdown updates to renderer
    for (let i = 3; i > 0; i--) {
      mainWindow.webContents.send('capture:countdown', i)
      await new Promise((r) => setTimeout(r, 1000))
    }
    const pos = await mouse.getPosition()
    return { x: pos.x, y: pos.y }
  })

  // Chat history & summary
  ipcMain.handle('chat:fetchHistory', async (_e, opts) => {
    const settings = loadSettings()
    const { date } = opts
    const result = await fetchChatHistory({
      apiUrl: settings.apiUrl,
      talker: settings.talker,
      date,
      botSender: settings.botSender
    })
    // Cache the cleaned text for @reply context
    const text = formatForSummary(result.messages)
    setLastChatContext(text)
    return {
      messageCount: result.messages.length,
      totalRaw: result.totalRaw,
      text
    }
  })

  ipcMain.handle('chat:summarize', async (_e, chatText) => {
    const settings = loadSettings()
    const summaryPrompt =
      '你是一个群聊总结助手。请根据以下群聊记录生成一份简洁的总结。\n' +
      '要求：\n' +
      '1) 用纯文本，不要 Markdown 语法\n' +
      '2) 不要出现任何 wxid_ 开头的ID，用群昵称代替\n' +
      '3) 按话题分类总结，标注参与讨论的人\n' +
      '4) 突出重要信息、决定、待办事项\n' +
      '5) 保持简洁，控制在500字以内'
    const question = `以下是群聊记录：\n\n${chatText}\n\n请生成总结。`
    let reply
    if (settings.aiMode === 'openclaw') {
      reply = await askOpenClaw(question, settings, { systemOverride: summaryPrompt })
    } else if (settings.aiMode === 'anthropic') {
      reply = await askAnthropic(question, settings, { systemOverride: summaryPrompt })
    } else if (settings.aiMode === 'gemini') {
      reply = await askGemini(question, settings, { systemOverride: summaryPrompt })
    } else {
      reply = await askAI(question, settings, { systemOverride: summaryPrompt })
    }
    return stripMarkdown(reply)
  })

  // AI generates HTML page directly from chat records
  ipcMain.handle('chat:generateHTML', async (_e, { chatText, date }) => {
    const settings = loadSettings()
    if (!settings.useAIGeneratedHTML) {
      return { html: generateHTML(chatText, date) }
    }
    const html = await generateHTMLWithAI(chatText, date, settings)
    return { html }
  })

  // Save HTML to temp file and open in browser for preview
  ipcMain.handle('chat:previewHTML', async (_e, { html, date }) => {
    const { writeFileSync } = await import('fs')
    const tmpPath = join(app.getPath('temp'), `echobot-preview-${date}.html`)
    writeFileSync(tmpPath, html, 'utf-8')
    shell.openExternal(`file:///${tmpPath.replace(/\\/g, '/')}`)
    return { path: tmpPath }
  })

  // Refine HTML based on user feedback
  ipcMain.handle('chat:refineHTML', async (_e, { html, feedback }) => {
    const settings = loadSettings()
    const newHTML = await refineHTMLWithAI(html, feedback, settings)
    return { html: newHTML }
  })

  // Publish: push HTML to GitHub → poll Actions → send link
  ipcMain.handle('chat:publish', async (_e, { summary, date, html: preGeneratedHTML }) => {
    const settings = loadSettings()
    const send = (type, msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('publish:status', { type, message: msg })
      }
    }

    try {
      // 1. Use pre-generated HTML or fallback to template
      send('progress', '正在准备 HTML 页面...')
      const html = preGeneratedHTML || generateHTML(summary, date)

      // 2. Push to GitHub
      send('progress', '正在推送到 GitHub...')
      const filename = await pushToGitHub(html, date, settings)

      // 3. Poll GitHub Actions
      send('progress', '等待 GitHub Pages 部署...')
      const result = await waitForDeploy(settings, {
        onStatus: (s) => send('progress', `部署状态: ${s}`)
      })

      if (result !== 'success') {
        send('error', `GitHub Actions 部署失败: ${result}`)
        return { success: false, error: `部署失败: ${result}` }
      }

      // 4. Build URL and send to chat
      const url = getPagesUrl(filename, settings)
      send('progress', '部署成功，正在发送链接到群聊...')

      const message = `群聊日报 (${date})\n${url}`
      await sendReply(message, settings.coordinates)

      send('done', url)
      return { success: true, url }
    } catch (err) {
      send('error', err.message)
      return { success: false, error: err.message }
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIPC()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
