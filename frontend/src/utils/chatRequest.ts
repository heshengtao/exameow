import { applyExtraPrompt, type AIConfig, type AIRequestOptions, type ChatMessage } from '@exameow/shared'
import { normalizeEndpoint } from './endpoint'
import { consumeOpenAiSse, type ChatStreamHandlers } from './chatStream'

const FALLBACK_MAX_TOKENS = 16384

export class AIHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AIHttpError'
    this.status = status
  }
}

export function isRetryableAIError(error: unknown): boolean {
  if (error instanceof AIHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'TimeoutError') {
    return true
  }
  // Network-level failures surface as TypeError from fetch.
  return error instanceof TypeError
}

function abortError(): DOMException {
  return new DOMException('Cancelled', 'AbortError')
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Run an AI request with per-attempt timeout and transient-only retries.
 * Mirrors the Rust AIClient policy so browser-direct and native backends behave
 * the same: timeout / network / 408 / 429 / 5xx are retried, other errors are not.
 */
export async function runAIRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: AIRequestOptions,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError()
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = options.timeout_seconds
      ? setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), options.timeout_seconds * 1000)
      : undefined
    try {
      const result = await request(controller.signal)
      if (signal?.aborted) throw abortError()
      return result
    } catch (error) {
      if (signal?.aborted) throw abortError()
      if (attempt >= options.retries || !isRetryableAIError(error)) throw error
      await delay(1000 * (attempt + 1), signal)
    } finally {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

/**
 * Send a chat-completions request through the browser-direct (custom provider)
 * path, applying temperature / token field / reasoning effort / extra prompt.
 */
export async function chatRequest(
  system: string,
  user: string,
  config: AIConfig,
  options: AIRequestOptions,
  signal?: AbortSignal,
  fallbackMaxTokens?: number,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: applyExtraPrompt(system, options.extra_prompt) },
      { role: 'user', content: user },
    ],
  }
  if (options.max_tokens !== undefined) {
    body[options.token_parameter] = options.max_tokens
  } else if (fallbackMaxTokens !== undefined) {
    body.max_tokens = fallbackMaxTokens
  }
  if (!options.omit_temperature && options.temperature !== undefined) {
    body.temperature = options.temperature
  }
  if (options.reasoning_effort) {
    body.reasoning_effort = options.reasoning_effort
  }

  return runAIRequest(async (attemptSignal) => {
    const res = await fetch(`${normalizeEndpoint(config.endpoint)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify(body),
      signal: attemptSignal,
    })
    if (!res.ok) {
      throw new AIHttpError(res.status, `HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('AI returned empty response')
    }
    return content
  }, options, signal)
}

/**
 * Streaming chat through the browser-direct (custom provider) path. Mirrors
 * `chatRequest`'s option handling but pushes deltas to the handlers as they
 * arrive instead of returning the full string.
 */
export async function chatStreamDirect(
  messages: ChatMessage[],
  config: AIConfig,
  options: AIRequestOptions,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const outgoing = messages.map((m) => ({
    role: m.role,
    content: m.role === 'system' ? applyExtraPrompt(m.content, options.extra_prompt) : m.content,
  }))

  const body: Record<string, unknown> = {
    model: config.model,
    messages: outgoing,
    stream: true,
  }
  if (options.max_tokens !== undefined) {
    body[options.token_parameter] = options.max_tokens
  } else {
    body.max_tokens = FALLBACK_MAX_TOKENS
  }
  if (!options.omit_temperature && options.temperature !== undefined) {
    body.temperature = options.temperature
  }
  if (options.reasoning_effort) {
    body.reasoning_effort = options.reasoning_effort
  }

  let res: Response
  try {
    res = await fetch(`${normalizeEndpoint(config.endpoint)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error
    handlers.onError(error)
    return
  }

  if (!res.ok) {
    handlers.onError(
      new AIHttpError(res.status, `HTTP ${res.status}: ${await res.text().catch(() => '')}`),
    )
    return
  }
  if (!res.body) {
    handlers.onError(new Error('AI returned no response body'))
    return
  }
  await consumeOpenAiSse(res.body, handlers, signal)
}
