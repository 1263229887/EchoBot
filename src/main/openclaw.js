import WebSocket from 'ws'
import { randomUUID } from 'crypto'

let ws = null
let connected = false
let pendingRpc = new Map() // id -> { resolve, reject, timer }
let eventHandlers = new Map() // runId -> { resolve, reject, timer }

function ensureConnected(settings) {
  if (ws && ws.readyState === WebSocket.OPEN && connected) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    if (ws) {
      try { ws.close() } catch {}
    }
    connected = false

    const { wsUrl, token } = settings.openclaw
    ws = new WebSocket(wsUrl)
    let settled = false

    const done = (err) => {
      if (settled) return
      settled = true
      if (err) { reject(err) } else { connected = true; resolve() }
    }

    ws.on('error', (err) => done(err))

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())

        // Handle challenge-response handshake
        if (!connected && msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = msg.payload?.nonce
          if (!nonce) return done(new Error('Missing challenge nonce'))

          const connectId = `connect-${Date.now()}`
          pendingRpc.set(connectId, {
            resolve: () => done(null),
            reject: (e) => done(e),
            timer: setTimeout(() => {
              pendingRpc.delete(connectId)
              done(new Error('Handshake timeout'))
            }, 10000)
          })

          ws.send(JSON.stringify({
            type: 'req',
            id: connectId,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'gateway-client',
                displayName: 'EchoBot',
                version: '0.1.0',
                platform: process.platform,
                mode: 'ui'
              },
              auth: { token },
              caps: [],
              role: 'operator',
              scopes: ['operator.admin']
            }
          }))
          return
        }

        handleMessage(msg)
      } catch {}
    })

    ws.on('close', () => {
      ws = null
      connected = false
      for (const [, p] of pendingRpc) {
        clearTimeout(p.timer)
        p.reject(new Error('WebSocket closed'))
      }
      pendingRpc.clear()
      // Also reject any pending event handlers
      for (const [, h] of eventHandlers) {
        clearTimeout(h.timer)
        h.reject(new Error('WebSocket closed'))
      }
      eventHandlers.clear()
    })

    // Timeout if no challenge received
    setTimeout(() => done(new Error('No challenge received from Gateway')), 10000)
  })
}

function handleMessage(msg) {
  // RPC response
  if (msg.type === 'res' && msg.id && pendingRpc.has(msg.id)) {
    const p = pendingRpc.get(msg.id)
    clearTimeout(p.timer)
    pendingRpc.delete(msg.id)
    if (msg.ok === false || msg.error) {
      p.reject(new Error(msg.error?.message || 'RPC error'))
    } else {
      p.resolve(msg.payload)
    }
    return
  }

  // Streaming event from agent
  if (msg.type === 'event' && msg.event === 'agent' && msg.payload) {
    const { runId, state, message } = msg.payload
    if (!runId || !eventHandlers.has(runId)) return

    const handler = eventHandlers.get(runId)

    if (state === 'final' && message?.role === 'assistant') {
      clearTimeout(handler.timer)
      eventHandlers.delete(runId)
      const text = extractText(message.content)
      handler.resolve(text)
    } else if (state === 'error') {
      clearTimeout(handler.timer)
      eventHandlers.delete(runId)
      handler.reject(new Error(msg.payload.error || 'Agent error'))
    } else if (state === 'aborted') {
      clearTimeout(handler.timer)
      eventHandlers.delete(runId)
      handler.reject(new Error('Agent aborted'))
    }
  }
}

function extractText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  }
  return String(content || '')
}

function rpc(method, params, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      pendingRpc.delete(id)
      reject(new Error(`RPC timeout: ${method}`))
    }, timeout)

    pendingRpc.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ type: 'req', id, method, params }))
  })
}

export async function askOpenClaw(question, settings) {
  await ensureConnected(settings)

  const sessionKey = settings.openclaw.sessionKey || 'agent:main:main'
  const idempotencyKey = randomUUID()

  const result = await rpc('chat.send', {
    sessionKey,
    message: question,
    deliver: false,
    idempotencyKey
  })

  const runId = result?.runId
  if (!runId) {
    throw new Error('No runId returned from chat.send')
  }

  // Wait for the final response event (90s timeout)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      eventHandlers.delete(runId)
      reject(new Error('OpenClaw response timeout (90s)'))
    }, 90000)

    eventHandlers.set(runId, { resolve, reject, timer })
  })
}

export function disconnectOpenClaw() {
  if (ws) {
    try { ws.close() } catch {}
    ws = null
    connected = false
  }
}
