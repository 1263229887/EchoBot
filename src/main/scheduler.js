import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { loadSettings } from './store'
import { sendReply } from './autotype'
import axios from 'axios'

let mainWindow = null
let schedulerTimer = null
let tasks = []

const TASKS_FILE = 'wushuangbot-scheduled-tasks.json'

// 黄金价格缓存，10秒有效期
let goldPriceCache = { data: null, timestamp: 0 }
const GOLD_CACHE_TTL = 10000

async function fetchGoldPrice() {
  // 检查缓存
  if (goldPriceCache.data && Date.now() - goldPriceCache.timestamp < GOLD_CACHE_TTL) {
    return goldPriceCache.data
  }

  try {
    // 并行请求两个接口
    const [zheshangRes, au9999Res] = await Promise.all([
      axios.get('https://ms.jr.jd.com/gw2/generic/CreatorSer/pc/m/pcQueryGoldProduct', {
        params: { reqData: '{"goldType":"2"}' },
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json, text/plain, /',
          Referer: 'https://jdjr.jd.com/'
        },
        timeout: 10000
      }),
      axios.post(
        'https://ms.jr.jd.com/gw/generic/opdataapi/h5/m/getSimpleQuoteUseUniqueCodes',
        { ticket: 'jd-jr-pc', uniqueCodes: ['SGE-Au99.99'] },
        {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'application/json, text/plain, /',
            'Content-Type': 'application/json',
            Origin: 'https://show.jd.com',
            Referer: 'https://show.jd.com/',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 10000
        }
      )
    ])

    // 解析浙商积存金
    const zheshang = zheshangRes.data?.resultData?.data || {}
    const priceValue = zheshang.priceValue || '0'
    const raise = zheshang.raise || '0'
    const raisePercent = zheshang.raisePercent100 || '0%'

    // 解析黄金9999
    const au9999Data = au9999Res.data?.resultData?.data?.data?.[0] || {}
    const lastPrice = au9999Data.lastPrice || 0
    const au9999Raise = au9999Data.raise || 0
    const au9999RaisePercent = au9999Data.raisePercent || 0

    // 格式化涨跌幅
    const formatPercent = (val) => {
      if (typeof val === 'string') return val
      if (typeof val === 'number') {
        return val >= 0 ? `+${(val * 100).toFixed(2)}%` : `${(val * 100).toFixed(2)}%`
      }
      return '0%'
    }

    const now = new Date()
    // 时分秒
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    const result = {
      fetchedAt: timeStr,
      formattedMessage:
        `💰 黄金实时价格\n` +
        ` 1. 黄金9999      ${lastPrice}\n` +
        ` 2. 浙商积存金    ${priceValue}`
    }

    goldPriceCache = { data: result, timestamp: Date.now() }
    return result
  } catch (err) {
    console.error('获取黄金价格失败:', err.message)
    throw new Error(`获取黄金价格失败: ${err.message}`)
  }
}

function getTasksPath() {
  return join(app.getPath('userData'), TASKS_FILE)
}

function loadTasks() {
  try {
    const path = getTasksPath()
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'))
    }
  } catch {}
  return []
}

function saveTasks(tasksToSave) {
  const path = getTasksPath()
  writeFileSync(path, JSON.stringify(tasksToSave, null, 2), 'utf-8')
}

function shouldRunNow(task) {
  if (!task.enabled) return false
  const now = new Date()
  const minute = now.getMinutes()

  // "hourly" means at minute 0 of every hour
  if (task.scheduleType === 'hourly') {
    if (minute !== 0) return false
    // 防止同一小时内重复执行（tick每30秒运行一次）
    if (task.lastRunAt) {
      const lastRun = new Date(task.lastRunAt)
      if (lastRun.getHours() === now.getHours() && lastRun.getDate() === now.getDate()) {
        return false
      }
    }
    return true
  }

  // "daily" at specific time, e.g. "09:00"
  if (task.scheduleType === 'daily') {
    const [targetHour, targetMin] = task.time.split(':').map(Number)
    return now.getHours() === targetHour && now.getMinutes() === targetMin
  }

  // "interval" in minutes
  if (task.scheduleType === 'interval') {
    const lastRun = task.lastRunAt ? new Date(task.lastRunAt).getTime() : 0
    const intervalMs = task.intervalMinutes * 60 * 1000
    return Date.now() - lastRun >= intervalMs
  }

  return false
}

async function executeTask(task) {
  const settings = loadSettings()
  try {
    const result = await fetchGoldPrice()
    await sendReply(result.formattedMessage, settings.coordinates)
    return { success: true, reply: result.formattedMessage }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function tick() {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  for (const task of tasks) {
    if (shouldRunNow(task)) {
      task.lastRunAt = now.toISOString()
      task.runCount = (task.runCount || 0) + 1
      saveTasks(tasks)

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scheduler:event', {
          type: 'run',
          taskId: task.id,
          taskName: task.name,
          time: timeStr
        })
      }

      const result = await executeTask(task)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scheduler:event', {
          type: result.success ? 'success' : 'error',
          taskId: task.id,
          taskName: task.name,
          message: result.success ? result.reply?.slice(0, 50) : result.error,
          time: timeStr
        })
      }
    }
  }
}

export function initScheduler(window) {
  mainWindow = window
  tasks = loadTasks()

  if (schedulerTimer) clearInterval(schedulerTimer)
  schedulerTimer = setInterval(tick, 30000) // check every 30 seconds

  // Run once at startup
  setTimeout(tick, 2000)
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }
}

export function getTasks() {
  return tasks
}

export function getTask(id) {
  return tasks.find((t) => t.id === id)
}

export function addTask(task) {
  const newTask = {
    id: Date.now().toString(),
    name: task.name || '黄金价格',
    scheduleType: task.scheduleType || 'hourly', // 'hourly' | 'daily' | 'interval'
    time: task.time || '00:00',
    intervalMinutes: task.intervalMinutes || 60,
    enabled: true,
    lastRunAt: null,
    runCount: 0,
    createdAt: new Date().toISOString()
  }
  tasks.push(newTask)
  saveTasks(tasks)
  return newTask
}

export function updateTask(id, updates) {
  const index = tasks.findIndex((t) => t.id === id)
  if (index === -1) return null
  tasks[index] = { ...tasks[index], ...updates }
  saveTasks(tasks)
  return tasks[index]
}

export function deleteTask(id) {
  const index = tasks.findIndex((t) => t.id === id)
  if (index === -1) return false
  tasks.splice(index, 1)
  saveTasks(tasks)
  return true
}

export async function runTask(id) {
  const task = tasks.find((t) => t.id === id)
  if (!task) return { success: false, error: '任务不存在' }

  const settings = loadSettings()
  try {
    const result = await fetchGoldPrice()
    await sendReply(result.formattedMessage, settings.coordinates)
    return { success: true, reply: result.formattedMessage }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export function toggleTask(id) {
  const task = tasks.find((t) => t.id === id)
  if (!task) return null
  task.enabled = !task.enabled
  saveTasks(tasks)
  return task
}
