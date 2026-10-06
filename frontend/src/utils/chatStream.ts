export interface ChatStreamHandlers {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (error: unknown) => void
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

/** Consume a raw OpenAI-compatible provider SSE stream (browser-direct path). */
export async function consumeOpenAiSse(
  body: ReadableStream<Uint8Array>,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let finished = false
  try {
    for await (const frame of sseFrames(body, signal)) {
      for (const data of dataLines(frame)) {
        if (data === '[DONE]') {
          handlers.onDone()
          finished = true
          break
        }
        let parsed: {
          error?: { message?: string }
          choices?: { delta?: { content?: string } }[]
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
