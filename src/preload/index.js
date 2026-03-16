import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  startPolling: () => ipcRenderer.invoke('poller:start'),
  stopPolling: () => ipcRenderer.invoke('poller:stop'),
  getStatus: () => ipcRenderer.invoke('poller:status'),
  clearLogs: () => ipcRenderer.invoke('poller:clearLogs'),
  fetchChatHistory: (opts) => ipcRenderer.invoke('chat:fetchHistory', opts),
  summarizeChat: (text) => ipcRenderer.invoke('chat:summarize', text),
  publishSummary: (opts) => ipcRenderer.invoke('chat:publish', opts),
  generateHTML: (opts) => ipcRenderer.invoke('chat:generateHTML', opts),
  previewHTML: (opts) => ipcRenderer.invoke('chat:previewHTML', opts),
  refineHTML: (opts) => ipcRenderer.invoke('chat:refineHTML', opts),
  getHTMLPrompt: () => ipcRenderer.invoke('chat:getHTMLPrompt'),
  aiSendMessage: (text) => ipcRenderer.invoke('ai:sendMessage', text),
  onPublishStatus: (callback) => {
    ipcRenderer.on('publish:status', (_event, data) => callback(data))
  },
  removePublishListener: () => {
    ipcRenderer.removeAllListeners('publish:status')
  },
  captureCoordinate: () => ipcRenderer.invoke('coordinate:capture'),
  onStatusUpdate: (callback) => {
    ipcRenderer.on('poller:status', (_event, data) => callback(data))
  },
  removeStatusListener: () => {
    ipcRenderer.removeAllListeners('poller:status')
  },
  onCaptureCountdown: (callback) => {
    ipcRenderer.on('capture:countdown', (_event, seconds) => callback(seconds))
  },
  removeCaptureListener: () => {
    ipcRenderer.removeAllListeners('capture:countdown')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
