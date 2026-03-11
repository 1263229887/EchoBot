import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const getPath = (filename) => join(app.getPath('userData'), filename)

const SETTINGS_FILE = 'echobot-config.json'
const PROCESSED_FILE = 'echobot-processed.json'
const HASHES_FILE = 'echobot-hashes.json'

// Try to read OpenClaw token from ~/.openclaw/openclaw.json
function readOpenClawToken() {
  try {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      return config?.gateway?.auth?.token || ''
    }
  } catch {}
  return ''
}

const DEFAULT_SETTINGS = {
  apiUrl: 'http://127.0.0.1:5031/api/v1/messages',
  talker: '20038138259@chatroom',
  limit: 30,
  triggerKeyword: '@双',
  pollingInterval: 3000,
  aiMode: 'minimax', // 'minimax' or 'openclaw'
  minimax: {
    baseUrl: 'https://api.minimaxi.com/v1',
    apiKey: '',
    modelId: 'MiniMax-M2.5-highspeed'
  },
  openclaw: {
    wsUrl: 'ws://localhost:18789/ws',
    token: readOpenClawToken(),
    sessionKey: 'agent:main:main'
  },
  coordinates: { x: 0, y: 0 }
}

function readJSON(filename, fallback) {
  const filepath = getPath(filename)
  try {
    if (existsSync(filepath)) {
      return JSON.parse(readFileSync(filepath, 'utf-8'))
    }
  } catch {
    // corrupted file, use fallback
  }
  return fallback
}

function writeJSON(filename, data) {
  writeFileSync(getPath(filename), JSON.stringify(data, null, 2), 'utf-8')
}

export function loadSettings() {
  const saved = readJSON(SETTINGS_FILE, {})
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    minimax: { ...DEFAULT_SETTINGS.minimax, ...saved.minimax },
    openclaw: { ...DEFAULT_SETTINGS.openclaw, ...saved.openclaw },
    coordinates: { ...DEFAULT_SETTINGS.coordinates, ...saved.coordinates }
  }
}

export function saveSettings(settings) {
  writeJSON(SETTINGS_FILE, settings)
}

export function loadProcessedIds() {
  return new Set(readJSON(PROCESSED_FILE, []))
}

export function saveProcessedIds(idSet) {
  writeJSON(PROCESSED_FILE, [...idSet])
}

export function loadContentHashes() {
  return new Set(readJSON(HASHES_FILE, []))
}

export function saveContentHashes(hashSet) {
  writeJSON(HASHES_FILE, [...hashSet])
}
