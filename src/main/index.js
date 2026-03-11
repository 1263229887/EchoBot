import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadSettings, saveSettings } from './store'
import { Poller } from './poller'
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
