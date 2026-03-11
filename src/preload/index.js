import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  startPolling: () => ipcRenderer.invoke('poller:start'),
  stopPolling: () => ipcRenderer.invoke('poller:stop'),
  getStatus: () => ipcRenderer.invoke('poller:status'),
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
