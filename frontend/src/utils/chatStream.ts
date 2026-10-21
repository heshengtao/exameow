import type { ToolCall } from '@exameow/shared'

export interface ChatToolEvent {
  id: string
  phase: 'start' | 'end'
  name: string
  detail?: string
  ok?: boolean
  count?: number
}

export interface ChatStreamHandlers {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (error: unknown) => void
  onTool?: (event: ChatToolEvent) => void
}

/**
 * Yield SSE frames (`data:` blocks separated by a blank line) from a stream.
 * Uses getReader() rather than for-await on the stream itself: older WKWebView
 * builds do not implement the ReadableStream async iterator.
 */
async function* sseFrames(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index: number
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        yield frame
      }
    }
    if (buffer.trim()) yield buffer
  } finally {
    reader.releaseLock()
  }
}

function dataLines(frame: string): string[] {
  const out: string[] = []
  for (const line of frame.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const data = trimmed.slice(5).trim()
    if (data) out.push(data)
  }
  return out
}

interface NormalizedChatEvent {
  type?: string
  text?: string
  message?: string
  id?: string
  phase?: string
  name?: string
  detail?: string
  ok?: boolean
  count?: number
}

/** Consume our normalized chat SSE protocol (Tauri/Axum/Worker backends). */
export async function consumeChatSse(
  body: ReadableStream<Uint8Array>,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let finished = false
  try {
    for await (const frame of sseFrames(body, signal)) {
      for (const data of dataLines(frame)) {
        let event: NormalizedChatEvent
        try {
          event = JSON.parse(data)
        } catch {
          continue
        }
        if (event.type === 'delta' && typeof event.text === 'string') {
          handlers.onDelta(event.text)
        } else if (event.type === 'tool') {
          handlers.onTool?.({
            id: typeof event.id === 'string' ? event.id : '',
            phase: event.phase === 'start' ? 'start' : 'end',
            name: typeof event.name === 'string' ? event.name : '',
            detail: typeof event.detail === 'string' ? event.detail : undefined,
            ok: typeof event.ok === 'boolean' ? event.ok : undefined,
            count: typeof event.count === 'number' ? event.count : undefined,
          })
        } else if (event.type === 'error') {
          handlers.onError(new Error(event.message || 'AI error'))
          finished = true
          break
        } else if (event.type === 'done') {
          handlers.onDone()
          finished = true
          break
        }
      }
      if (finished) break
    }
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error
    handlers.onError(error)
    return
  }
  if (!finished) handlers.onDone()
}

interface OpenAiStreamOptions {
  /** Tool rounds must not finish the conversation until the loop decides. */
  deferDone?: boolean
}

/** Merge a streamed `tool_calls` fragment into the accumulated list. */
function mergeToolCall(
  calls: Map<number, ToolCall>,
  raw: Record<string, unknown>,
  fallbackIndex: number,
): void {
  const index = typeof raw.index === 'number' ? raw.index : fallbackIndex
  const existing = calls.get(index) ?? {
    id: '',
    type: 'function' as const,
    function: { name: '', arguments: '' },
  }
  if (typeof raw.id === 'string' && raw.id) existing.id = raw.id
  if (typeof raw.type === 'string' && raw.type) existing.type = raw.type as 'function'
  const fn = raw.function as Record<string, unknown> | undefined
  if (fn && typeof fn.name === 'string' && fn.name) existing.function.name = fn.name
  if (fn && typeof fn.arguments === 'string') existing.function.arguments += fn.arguments
  else if (fn && fn.arguments && typeof fn.arguments === 'object') {
    existing.function.arguments = JSON.stringify(fn.arguments)
  }
  calls.set(index, existing)
}

/**
 * Consume a raw OpenAI-compatible provider SSE stream (browser-direct path).
 * Returns any tool calls accumulated during the round; `deferDone` keeps the
 * caller in control of when the conversation is marked complete.
 */
export async function consumeOpenAiSse(
  body: ReadableStream<Uint8Array>,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
  options: OpenAiStreamOptions = {},
): Promise<ToolCall[]> {
  const calls = new Map<number, ToolCall>()
  let finished = false
  try {
    for await (const frame of sseFrames(body, signal)) {
      for (const data of dataLines(frame)) {
        if (data === '[DONE]') {
          if (!options.deferDone) handlers.onDone()
          finished = true
          break
        }
        let parsed: {
          error?: { message?: string }
          tool_calls?: Record<string, unknown>[]
          choices?: {
            delta?: { content?: string; tool_calls?: Record<string, unknown>[] }
            message?: { content?: string; tool_calls?: Record<string, unknown>[] }
          }[]
        }
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        const message = parsed.error?.message
        if (typeof message === 'string' && message) {
          handlers.onError(new Error(message))
          finished = true
          break
        }
        const delta = parsed.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) handlers.onDelta(delta)
        const messageContent = parsed.choices?.[0]?.message?.content
        if (typeof messageContent === 'string' && messageContent) {
          handlers.onDelta(messageContent)
        }
        const fragments = [
          ...(Array.isArray(parsed.tool_calls) ? parsed.tool_calls : []),
          ...(Array.isArray(parsed.choices?.[0]?.delta?.tool_calls)
            ? parsed.choices[0].delta.tool_calls
            : []),
          ...(Array.isArray(parsed.choices?.[0]?.message?.tool_calls)
            ? parsed.choices[0].message.tool_calls
            : []),
        ]
        fragments.forEach((fragment, index) => mergeToolCall(calls, fragment, index))
      }
      if (finished) break
    }
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error
    handlers.onError(error)
    return Array.from(calls.values())
  }
  if (!finished && !options.deferDone) handlers.onDone()
  return Array.from(calls.values())
}
