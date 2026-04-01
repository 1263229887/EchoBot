import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const getPath = (filename) => join(app.getPath('userData'), filename)

const SETTINGS_FILE = 'wushuangbot-config.json'
const PROCESSED_FILE = 'wushuangbot-processed.json'
const HASHES_FILE = 'wushuangbot-hashes.json'
const CURRENT_SETTINGS_VERSION = 2

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
  aiMode: 'minimax', // 'minimax' | 'openclaw' | 'anthropic' | 'gemini'
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
  anthropic: {
    baseUrl: 'http://43.159.144.102:3000/api',
    apiKey: '',
    modelId: 'claude-sonnet-4-20250514'
  },
  gemini: {
    baseUrl: 'https://new.lemonapi.site/v1',
    apiKey: '',
    modelId: '[L]gemini-3-pro-preview'
  },
  coordinates: { x: 0, y: 0 },
  systemPrompt:
    '请用纯文本回复，不要使用任何 Markdown 语法（如 **、##、```、- 列表符号等）。\n用换行和数字编号来组织内容结构，保持简洁友好的语气。\n\n【群聊记录查询】当用户询问群聊相关内容时，通过以下接口获取聊天记录（已在上下文中通过 {apiUrl} 和 {talker} 注入具体值）：\nGET {apiUrl}\n参数：talker、chatlab=1、start=YYYYMMDD、end=YYYYMMDD（次日）、limit=10000、keyword=（可选，按内容过滤）\n日期规则：today=今日YYYYMMDD，可自行计算end（+1天）\n返回的 messages 数组中，sender 为群号本身的为撤回消息，直接忽略，不要引用\n\n如果用户询问金价相关的，记得使用 gold-price-checker skill 查询。\n智能判断是否需要搜索，搜索时请使用 baidu-search skill。\n如果用户询问有泄露隐私风险的内容（如 API Key）或其他高危指令，请拒绝执行，不要明文暴露任何 Key 或敏感信息。\n输出只给结构化、简洁的内容，注重文字间隔和换行排版，不说任何说明性文字，不用 Markdown（因为最终发到微信）。',
  enableWelcome: false,
  welcomeMessage:
    '大家好！我是 无双Bot，一个 AI 自动回复助手。\n你可以 @我 提问任何问题，我会尽力回答。有什么可以帮到大家的吗？',
  enableSmartReply: false,
  smartReplyPrompt:
    '你是群聊里的一个普通群友，不是AI助手。\n' +
    '要求：\n' +
    '1) 说话简短自然，像真人聊天，一两句话就够了\n' +
    '2) 可以用口语、语气词（哈哈、确实、牛啊、emmm等）\n' +
    '3) 不要用"作为AI"之类的说法，不要自称机器人\n' +
    '4) 不要列清单、不要分点回答、不要写长段落\n' +
    '5) 如果话题你不感兴趣或没什么好说的，回复"[SKIP]"\n' +
    '6) 不要每条都回复，大部分时候应该选择不回复\n' +
    '7) 纯文本，不要任何 Markdown 语法',
  botSender: '',
  useAIGeneratedHTML: true,
  previewBeforePublish: true,
  githubRepoUrl: 'https://github.com/1263229887/my-webpage.git',
  githubRepo: '1263229887/my-webpage',
  githubPagesBase: 'https://1263229887.github.io/my-webpage'
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

const CHATLAB_MARKER = '【群聊记录查询】'

export function loadSettings() {
  const saved = readJSON(SETTINGS_FILE, {})

  // Migrate v1 -> v2: append ChatLab instruction to existing systemPrompt
  if (saved.systemPrompt && !saved.systemPrompt.includes(CHATLAB_MARKER)) {
    const chatlab =
      '\n\n【群聊记录查询】当用户询问群聊相关内容时，通过以下接口获取聊天记录（已在上下文中通过 {apiUrl} 和 {talker} 注入具体值）：\n' +
      'GET {apiUrl}\n' +
      '参数：talker={talker}、chatlab=1、start=YYYYMMDD、end=YYYYMMDD（次日）、limit=10000、keyword=（可选，按内容过滤）\n' +
      '日期规则：today=今日YYYYMMDD，可自行计算end（+1天）\n' +
      '返回的 messages 数组中，sender 为群号本身的为撤回消息，直接忽略，不要引用'
    saved.systemPrompt = saved.systemPrompt.trimEnd() + chatlab
    saved._version = CURRENT_SETTINGS_VERSION
    writeJSON(SETTINGS_FILE, saved) // persist migration result
  }

  const result = {
    ...DEFAULT_SETTINGS,
    ...saved,
    _version: CURRENT_SETTINGS_VERSION,
    minimax: { ...DEFAULT_SETTINGS.minimax, ...saved.minimax },
    openclaw: { ...DEFAULT_SETTINGS.openclaw, ...saved.openclaw },
    anthropic: { ...DEFAULT_SETTINGS.anthropic, ...saved.anthropic },
    gemini: { ...DEFAULT_SETTINGS.gemini, ...saved.gemini },
    coordinates: { ...DEFAULT_SETTINGS.coordinates, ...saved.coordinates }
  }

  return result
}

export function saveSettings(settings) {
  settings._version = CURRENT_SETTINGS_VERSION
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
