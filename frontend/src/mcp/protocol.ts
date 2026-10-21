/** Wire frames exchanged with the Rust MCP host over WebSocket. */

export interface McpConnectedFrame {
  type: 'connected'
  server: string
  version: string
  protocol: string
}

export interface McpCallFrame {
  type: 'call'
  id: string
  tool: string
  args: Record<string, unknown>
}

export interface McpResultFrame {
  type: 'result'
  id: string
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}

export type McpServerFrame = McpConnectedFrame | McpCallFrame
