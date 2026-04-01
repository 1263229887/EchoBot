import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { generateKeyPairSync, createHash, sign, createPrivateKey } from 'node:crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

let ws = null
let connected = false
let connecting = null  // shared promise for concurrent ensureConnected calls
let handshakeDone = false
let pendingRpc = new Map() // id -> { resolve, reject, timer }
let eventHandlers = new Map() // runId -> { resolve, reject, timer }

// Cached identity/token for reuse across calls
let _cachedIdentity = null
let _cachedToken = null

// ── Device identity + token storage ──────────────────────────────────────────

const IDENTITY_DIR = path.join(os.homedir(), '.openclaw', 'identity')
const DEVICE_JSON = path.join(IDENTITY_DIR, 'device.json')
const DEVICE_AUTH_JSON = path.join(IDENTITY_DIR, 'device-auth.json')

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function loadDeviceIdentity() {
  try {
    const raw = fs.readFileSync(DEVICE_JSON, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveDeviceIdentity(identity) {
  ensureDir(IDENTITY_DIR)
  fs.writeFileSync(DEVICE_JSON, JSON.stringify(identity, null, 2) + '\n', 'utf8')
}

function loadStoredToken() {
  try {
    const raw = fs.readFileSync(DEVICE_AUTH_JSON, 'utf8')
    const store = JSON.parse(raw)
    return store.tokens?.operator?.token ?? null
  } catch {
    return null
  }
}

function saveStoredToken(deviceId, token, scopes) {
  ensureDir(IDENTITY_DIR)
  const existing = (() => {
    try { return JSON.parse(fs.readFileSync(DEVICE_AUTH_JSON, 'utf8')) } catch { return { version: 1, deviceId, tokens: {} } }
  })()
  existing.deviceId = deviceId
  existing.tokens = existing.tokens || {}
  existing.tokens.operator = { token, role: 'operator', scopes, updatedAtMs: Date.now() }
  fs.writeFileSync(DEVICE_AUTH_JSON, JSON.stringify(existing, null, 2) + '\n', 'utf8')
}

function fingerprintPublicKey(publicKeyPem) {
  // Strip ASN.1 SPKI prefix for Ed25519
  const pemBody = publicKeyPem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '')
  const der = Buffer.from(pemBody, 'base64')
  const PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
  const raw = (der.length === PREFIX.length + 32 &&
    der.subarray(0, PREFIX.length).equals(PREFIX))
    ? der.subarray(PREFIX.length)
    : der
  return createHash('sha256').update(raw).digest('hex')
}

function getPublicKeyBase64Url(publicKeyPem) {
  const pemBody = publicKeyPem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '')
  const der = Buffer.from(pemBody, 'base64')
  const PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
  const raw = (der.length === PREFIX.length + 32 &&
    der.subarray(0, PREFIX.length).equals(PREFIX))
    ? der.subarray(PREFIX.length)
    : der
  return Buffer.from(raw).toString('base64url')
}

function getOrCreateDeviceIdentity() {
  const existing = loadDeviceIdentity()
  if (existing && existing.privateKeyPem && existing.publicKeyPem) {
    // Ensure deviceId is set
    if (!existing.deviceId) {
      existing.deviceId = fingerprintPublicKey(existing.publicKeyPem)
    }
    return existing
  }

  // Generate fresh Ed25519 keypair (same as openclaw SDK)
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const deviceId = fingerprintPublicKey(publicKeyPem)

  const identity = {
    version: 1,
    deviceId,
    publicKeyPem,
    privateKeyPem,
    createdAtMs: Date.now()
  }
  saveDeviceIdentity(identity)
  return identity
}

function buildDeviceAuthPayloadV3(deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce, platform) {
  return [
    'v3',
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token || '',
    nonce,
    platform || '',
    ''
  ].join('|')
}

function buildDeviceSignature(deviceId, clientId, clientMode, role, scopes, signedAt, token, nonce, platform, privateKeyPem) {
  const payload = buildDeviceAuthPayloadV3(deviceId, clientId, clientMode, role, scopes, signedAt, token, nonce, platform)
  const pk = createPrivateKey(privateKeyPem)
  const sig = sign(null, Buffer.from(payload), pk)
  return sig.toString('base64url')
}

// ── WebSocket connection ───────────────────────────────────────────────────────

function doConnect(settings, deviceIdentity, authToken) {
  // If already connected, reuse — prevents duplicate WebSocket connections
  if (connected && handshakeDone && ws && ws.readyState === WebSocket.OPEN) {
    return Promise.resolve(null) // already connected, don't re-handshake
  }

  // Serialize concurrent connection attempts
  if (connecting) {
    return connecting.then(() => Promise.resolve(null))
  }

  connecting = new Promise((resolve, reject) => {
    if (ws) {
      try { ws.close() } catch {}
    }
    connected = false
    handshakeDone = false

    const wsUrl = settings.openclaw.wsUrl
    ws = new WebSocket(wsUrl)
    let settled = false

    const done = (err, token) => {
      if (settled) return
      settled = true
      connecting = null
      if (err) { reject(err) } else { connected = true; resolve(token) }
    }

    ws.on('error', (err) => done(err, null))

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())

        // Challenge-response handshake
        if (!handshakeDone && msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = msg.payload?.nonce
          if (!nonce) return done(new Error('Missing challenge nonce'), null)

          const signedAt = Date.now()
          const scopes = ['operator.admin', 'operator.read', 'operator.write']
          const signature = buildDeviceSignature(
            deviceIdentity.deviceId,
            'cli',
            'cli',
            'operator',
            scopes,
            signedAt,
            authToken || '',
            nonce,
            process.platform,
            deviceIdentity.privateKeyPem
          )

          const reqId = `connect-${Date.now()}`
          pendingRpc.set(reqId, {
            resolve: (payload) => {
              handshakeDone = true
              // Check for device token in response
              const deviceToken = payload?.auth?.deviceToken
              done(null, deviceToken || null)
            },
            reject: (e) => done(e, null),
            timer: setTimeout(() => {
              pendingRpc.delete(reqId)
              done(new Error('Handshake timeout (30s)'), null)
            }, 30000)
          })

          ws.send(JSON.stringify({
            type: 'req',
            id: reqId,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'cli',
                version: '1.0.0',
                platform: process.platform,
                mode: 'cli'
              },
              auth: authToken ? { token: authToken } : {},
              role: 'operator',
              scopes: ['operator.admin', 'operator.read', 'operator.write'],
              caps: [],
              device: {
                id: deviceIdentity.deviceId,
                publicKey: getPublicKeyBase64Url(deviceIdentity.publicKeyPem),
                signature,
                signedAt,
                nonce
              }
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
      handshakeDone = false
      connecting = null
      for (const [, p] of pendingRpc) {
        clearTimeout(p.timer)
        p.reject(new Error('WebSocket closed'))
      }
      pendingRpc.clear()
      for (const [, h] of eventHandlers) {
        clearTimeout(h.timer)
        h.reject(new Error('WebSocket closed'))
      }
      eventHandlers.clear()
    })

    ws.on('open', () => {
      // Waiting for challenge...
    })

    // Timeout if no challenge received
    setTimeout(() => {
      if (!handshakeDone) done(new Error('No challenge received from Gateway (30s timeout)'), null)
    }, 30000)
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

  // Streaming event from agent or chat
  if (msg.type === 'event' && (msg.event === 'agent' || msg.event === 'chat') && msg.payload) {
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

function rpc(method, params, timeout = 90000) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not open'))
      return
    }
    if (!handshakeDone) {
      reject(new Error('Handshake not complete'))
      return
    }

    const id = randomUUID()
    const timer = setTimeout(() => {
      pendingRpc.delete(id)
      reject(new Error(`RPC timeout (${timeout/1000}s): ${method}`))
    }, timeout)

    pendingRpc.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ type: 'req', id, method, params }))
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

async function ensureConnected(settings) {
  // If already connected and handshake done, reuse existing connection
  if (connected && handshakeDone && ws && ws.readyState === WebSocket.OPEN) {
    return
  }

  // If a connection is already in progress, wait for it
  if (connecting) {
    await connecting
    return
  }

  // Load/create identity once and cache it
  if (!_cachedIdentity) {
    _cachedIdentity = getOrCreateDeviceIdentity()
  }

  // Load stored token once and cache it
  if (!_cachedToken) {
    _cachedToken = loadStoredToken()
  }

  const { token: setupToken } = settings.openclaw
  let activeToken = null

  // Step 1: Try cached/stored device token
  if (_cachedToken) {
    try {
      const result = await doConnect(settings, _cachedIdentity, _cachedToken)
      if (result !== null) {
        activeToken = _cachedToken
        if (typeof result === 'string') {
          saveStoredToken(_cachedIdentity.deviceId, result, ['operator.admin', 'operator.read', 'operator.write'])
          _cachedToken = result
          activeToken = result
        }
      }
    } catch (e) {
      console.warn('Stored device token failed, trying setup token:', e.message)
      _cachedToken = null
    }
  }

  // Step 2: Fall back to setup token + device pairing
  if (!activeToken && setupToken) {
    try {
      const result = await doConnect(settings, _cachedIdentity, setupToken)
      if (result !== null) {
        activeToken = result
        saveStoredToken(_cachedIdentity.deviceId, result, ['operator.admin', 'operator.read', 'operator.write'])
        _cachedToken = result
      } else {
        throw new Error('missing scope: operator.write — device not paired. Please approve in DanaClaw: run `openclaw gateway call device.pair.list` and `openclaw gateway call device.pair.approve <requestId>`')
      }
    } catch (e) {
      if (e.message.includes('missing scope') || e.message.includes('device not paired')) {
        throw e
      }
      throw e
    }
  }

  if (!activeToken) {
    throw new Error('No valid token available for OpenClaw gateway')
  }
}

export async function askOpenClaw(question, settings, { systemOverride } = {}) {
  await ensureConnected(settings)

  const sessionKey = settings.openclaw?.sessionKey || 'agent:main:main'
  const idempotencyKey = randomUUID()

  let systemContent = systemOverride !== undefined ? systemOverride : settings.systemPrompt
  // Inject actual apiUrl and talker into placeholder tokens
  const apiUrl = settings.apiUrl || ''
  const talker = settings.talker || ''
  if (systemContent) {
    systemContent = systemContent
      .replace(/\{apiUrl\}/g, apiUrl)
      .replace(/\{talker\}/g, talker)
  }

  let message = question
  if (systemContent) {
    message = `[系统指令]\n${systemContent}\n\n[用户提问]\n${question}`
  }

  const result = await rpc('chat.send', {
    sessionKey,
    message,
    deliver: false,
    idempotencyKey
  })

  const runId = result?.runId
  if (!runId) {
    throw new Error('No runId returned from chat.send')
  }

  // Wait for the final response event (360s for multi-tool-call scenarios)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      eventHandlers.delete(runId)
      reject(new Error('OpenClaw response timeout (360s)'))
    }, 360000)

    eventHandlers.set(runId, { resolve, reject, timer })
  })
}

export function disconnectOpenClaw() {
  if (ws) {
    try { ws.close() } catch {}
    ws = null
    connected = false
    handshakeDone = false
    connecting = null
    _cachedIdentity = null
    _cachedToken = null
  }
}
