import { ref } from 'vue'
import type { McpInfo } from '@exameow/shared'
import { isCloudflare, isTauri } from '@/utils/platform'
import { dispatchMcpTool } from './registry'
import type { McpServerFrame } from './protocol'

export const mcpBridgeConnected = ref(false)
export const mcpBridgeInfo = ref<McpInfo | null>(null)

let socket: WebSocket | null = null
let stopped = true
let attempt = 0
let reconnectTimer: number | undefined
let heartbeatTimer: number | undefined
let listening = false

function toWebSocketUrl(url: string): string {
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${window.location.host}${url.startsWith('/') ? url : `/${url}`}`
}

async function resolveInfo(): Promise<McpInfo | null> {
  if (isCloudflare()) return null
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const info = await invoke<McpInfo>('mcp_info')
      return info.enabled ? info : null
    } catch {
      return null
    }
  }
  try {
    const response = await fetch('/api/mcp/info', { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    const info = (await response.json()) as McpInfo
    return info.enabled ? info : null
  } catch {
    return null
  }
}

function schedule(delay?: number): void {
  if (stopped) return
  if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
  const backoff = delay ?? Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))
  attempt++
  reconnectTimer = window.setTimeout(() => {
    void connect()
  }, backoff)
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== undefined) {
    window.clearInterval(heartbeatTimer)
    heartbeatTimer = undefined
  }
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

async function handleMessage(ws: WebSocket, event: MessageEvent): Promise<void> {
  if (typeof event.data !== 'string') return
  let frame: McpServerFrame
  try {
    frame = JSON.parse(event.data) as McpServerFrame
  } catch {
    return
  }

  if (frame.type === 'call') {
    try {
      const result = await dispatchMcpTool(frame.tool, frame.args ?? {})
      send(ws, { type: 'result', id: frame.id, ok: true, result: result ?? null })
    } catch (error: any) {
      send(ws, {
        type: 'result',
        id: frame.id,
        ok: false,
        error: {
          code: typeof error?.code === 'string' ? error.code : 'tool_failed',
          message: String(error?.message ?? error),
        },
      })
    }
    return
  }
}

async function connect(): Promise<void> {
  if (stopped || socket) return
  const info = await resolveInfo()
  mcpBridgeInfo.value = info
  if (!info) {
    // MCP is disabled (or the server is not reachable yet). Poll slowly; the
    // settings page refreshes the bridge immediately when it is enabled.
    schedule(60_000)
    return
  }

  const base = toWebSocketUrl(info.ws_url)
  const separator = base.includes('?') ? '&' : '?'
  const url = `${base}${separator}token=${encodeURIComponent(info.token)}`

  let ws: WebSocket
  try {
    ws = new WebSocket(url)
  } catch {
    schedule()
    return
  }
  socket = ws

  ws.onopen = () => {
    attempt = 0
    mcpBridgeConnected.value = true
    stopHeartbeat()
    heartbeatTimer = window.setInterval(() => {
      send(ws, { type: 'ping' })
    }, 20_000)
  }
  ws.onmessage = (event) => {
    void handleMessage(ws, event)
  }
  ws.onerror = () => {
    try {
      ws.close()
    } catch {}
  }
  ws.onclose = () => {
    if (socket === ws) {
      socket = null
      mcpBridgeConnected.value = false
    }
    stopHeartbeat()
    schedule()
  }
}

function watchVisibility(): void {
  if (listening) return
  listening = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket && !stopped) {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
      attempt = 0
      void connect()
    }
  })
}

export function startMcpBridge(): void {
  if (!stopped) return
  stopped = false
  attempt = 0
  watchVisibility()
  void connect()
}

export function stopMcpBridge(): void {
  stopped = true
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }
  stopHeartbeat()
  mcpBridgeConnected.value = false
  try {
    socket?.close()
  } catch {}
  socket = null
}

export function refreshMcpBridge(): void {
  stopMcpBridge()
  attempt = 0
  startMcpBridge()
}
