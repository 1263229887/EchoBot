import http from 'http'
import https from 'https'

const SSE_TIMEOUT = 60 * 1000

/**
 * Minimal SSE client. Emits events via on(type, fn) / off(type, fn).
 * Types: 'ready', 'message', 'error', 'close'
 */
export class SSEClient {
  constructor() {
    this.req = null
    this.closed = false
    this.buffer = ''
    this.reconnectTimer = null
    this.reconnectDelay = 1000
    this._handlers = {}
  }

  on(type, fn) {
    if (!this._handlers[type]) this._handlers[type] = []
    this._handlers[type].push(fn)
    return this
  }

  off(type, fn) {
    if (!this._handlers[type]) return
    this._handlers[type] = this._handlers[type].filter((h) => h !== fn)
  }

  connect(url, params = {}) {
    this.url = url
    this.params = params
    this._doConnect()
  }

  _buildUrl() {
    const u = new URL(this.url)
    for (const [k, v] of Object.entries(this.params)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v))
    }
    return u.toString()
  }

  _doConnect() {
    if (this.closed) return

    const urlStr = this._buildUrl()
    const urlObj = new URL(urlStr)

    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    }

    const client = urlObj.protocol === 'https:' ? https : http
    this._destroyReq()
    this.req = client.get(opts, (res) => {
      if (res.statusCode !== 200) {
        this._emit('error', `HTTP ${res.statusCode}`)
        this._scheduleReconnect()
        return
      }

      this.reconnectDelay = 1000
      this.buffer = ''

      res.on('data', (chunk) => {
        this.buffer += chunk.toString()
        this._flushBuffer()
      })

      res.on('end', () => {
        if (!this.closed) {
          this._emit('error', 'SSE stream ended unexpectedly')
          this._scheduleReconnect()
        }
      })

      res.on('error', (err) => {
        if (!this.closed) {
          this._emit('error', err.message)
          this._scheduleReconnect()
        }
      })
    })

    this.req.on('error', (err) => {
      if (!this.closed) {
        this._emit('error', err.message)
        this._scheduleReconnect()
      }
    })

    this.req.setTimeout(SSE_TIMEOUT, () => {
      this._destroyReq()
      if (!this.closed) {
        this._emit('error', 'SSE timeout')
        this._scheduleReconnect()
      }
    })
  }

  _flushBuffer() {
    const lines = this.buffer.split('\n')
    this.buffer = ''

    let currentEvent = null
    let currentData = []

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i]
      // SSE format: "event: <type>" or "data: <payload>" or ": <comment>"
      const colonIdx = rawLine.indexOf(':')
      if (colonIdx === -1) {
        // Blank/incomplete line — carry to buffer
        if (rawLine !== '') this.buffer = rawLine
        // Dispatch if we have a complete event
        if ((currentEvent || currentData.length > 0) && rawLine === '') {
          const dataStr = currentData.join('\n').trim()
          if (currentEvent && dataStr) {
            this._dispatch(currentEvent, dataStr)
          }
          currentEvent = null
          currentData = []
        }
        continue
      }

      const field = rawLine.slice(0, colonIdx).trim()
      const value = rawLine.slice(colonIdx + 1).trim()

      if (field === 'event') {
        currentEvent = value
      } else if (field === 'data') {
        currentData.push(value)
      }
      // ignore comment lines (field is ':') and other fields
    }
  }

  _dispatch(eventType, dataStr) {
    let data = null
    try {
      if (dataStr) data = JSON.parse(dataStr)
    } catch {}
    this._emit(eventType, data)
  }

  _emit(type, data) {
    const handlers = this._handlers[type]
    if (handlers) handlers.forEach((fn) => fn(data))
  }

  _scheduleReconnect() {
    if (this.closed) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
      this._doConnect()
    }, this.reconnectDelay)
  }

  _destroyReq() {
    if (this.req) {
      try { this.req.destroy() } catch {}
      this.req = null
    }
  }

  close() {
    this.closed = true
    clearTimeout(this.reconnectTimer)
    this._destroyReq()
  }
}
