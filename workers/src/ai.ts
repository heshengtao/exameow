import { Ai } from '@cloudflare/workers-types'
import { DEFAULT_MODEL, MAX_OUTPUT_TOKENS, MAX_PROMPT_CHARS, MAX_USER_PROMPT_CHARS, type AIRequestOptions } from './types'

export interface AIChatOverrides {
  maxTokens?: number
  temperature?: number
  omitTemperature?: boolean
  extraPrompt?: string
}

/** Map cross-backend AIRequestOptions to the subset CF Workers AI understands. */
export function aiChatOverrides(options?: AIRequestOptions): AIChatOverrides {
  if (!options) return {}
  return {
    maxTokens: typeof options.max_tokens === 'number' ? options.max_tokens : undefined,
    temperature: typeof options.temperature === 'number' ? options.temperature : undefined,
    omitTemperature: options.omit_temperature === true,
    extraPrompt: typeof options.extra_prompt === 'string' ? options.extra_prompt : undefined,
  }
}

interface AIChatInput {
  model?: string
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  omitTemperature?: boolean
  extraPrompt?: string
}

function withExtraPrompt(system: string, extra?: string): string {
  const trimmed = extra?.trim().slice(0, MAX_PROMPT_CHARS)
  if (!trimmed) return system
  return `${system}\n\n## Additional Instructions (user-provided, highest priority)\n${trimmed}\n\n## Follow the required output format above.`
}

function isReadableStream(value: unknown): value is ReadableStream {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ReadableStream).getReader === 'function'
  )
}

function consumeSseLine(line: string, out: { text: string }): void {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return
  try {
    const parsed = JSON.parse(data)
    if (typeof parsed.response === 'string') {
      out.text += parsed.response
    } else if (typeof parsed.choices?.[0]?.delta?.content === 'string') {
      out.text += parsed.choices[0].delta.content
    } else if (typeof parsed.choices?.[0]?.message?.content === 'string') {
      out.text += parsed.choices[0].message.content
    }
  } catch {}
}

async function readStreamText(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const out = { text: '' }
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) consumeSseLine(line, out)
    }
    buffer += decoder.decode()
    if (buffer) consumeSseLine(buffer, out)
  } finally {
    reader.releaseLock()
  }
  return out.text
}

export async function aiChat(
  ai: Ai,
  input: AIChatInput
): Promise<string> {
  const model = input.model || DEFAULT_MODEL

  const options: Record<string, unknown> = {
    messages: [
      { role: 'system', content: withExtraPrompt(input.systemPrompt, input.extraPrompt) },
      { role: 'user', content: input.userPrompt.slice(0, MAX_USER_PROMPT_CHARS) },
    ],
    stream: false,
  }
  if (!input.omitTemperature) {
    options.temperature = typeof input.temperature === 'number' ? input.temperature : 0.7
  }
  const requestedTokens =
    typeof input.maxTokens === 'number' && Number.isFinite(input.maxTokens)
      ? Math.floor(input.maxTokens)
      : MAX_OUTPUT_TOKENS
  options.max_tokens = Math.min(Math.max(requestedTokens, 1), MAX_OUTPUT_TOKENS)

  const result: any = await ai.run(model as any, options)

  console.log('AI result type:', typeof result, 'keys:', result ? Object.keys(result) : 'null')

  // CF Workers AI returns { response: string } for text generation
  if (typeof result === 'string') {
    if (!result.trim()) throw new Error('AI returned empty response')
    return result
  }

  // Some models return a ReadableStream directly even with stream: false
  if (isReadableStream(result)) {
    const text = await readStreamText(result)
    if (!text.trim()) throw new Error('AI returned empty response')
    return text
  }

  if (result && typeof result === 'object') {
    // Handle { response: "..." }
    if (result.response && typeof result.response === 'string') {
      if (!result.response.trim()) throw new Error('AI returned empty response')
      return result.response
    }

    // Handle { response: ReadableStream } — some models ignore stream: false
    if (isReadableStream(result.response)) {
      const text = await readStreamText(result.response)
      if (!text.trim()) throw new Error('AI returned empty response')
      return text
    }

    // Handle { response: { text | content } }
    if (result.response && typeof result.response === 'object' && !Array.isArray(result.response)) {
      const inner = result.response as any
      const text =
        typeof inner.text === 'string'
          ? inner.text
          : typeof inner.content === 'string'
            ? inner.content
            : ''
      if (text.trim()) return text
    }

    // When the model outputs valid JSON, CF returns it PARSED (array or object).
    // Stringify it back — downstream parsers expect the JSON text.
    if (result.response !== null && typeof result.response === 'object') {
      const text = JSON.stringify(result.response)
      if (text && text !== '{}' && text !== '[]') return text
    }

    // Some models might return { choices: [{ message: { content: "..." } }] }
    if (result.choices?.[0]?.message?.content) {
      return result.choices[0].message.content
    }
  }

  const payload = (() => {
    try {
      return JSON.stringify(result)?.slice(0, 500) ?? 'null'
    } catch {
      return String(result)
    }
  })()
  throw new Error(`AI returned unexpected response: type=${typeof result} keys=${result ? Object.keys(result).join(',') : 'null'} payload=${payload}`)
}

export interface AIChatStreamInput {
  model?: string
  messages: { role: string; content: string }[]
  maxTokens?: number
  temperature?: number
  omitTemperature?: boolean
  extraPrompt?: string
}

function mapMessagesWithExtra(
  messages: { role: string; content: string }[],
  extra?: string,
): { role: string; content: string }[] {
  const out = messages.map((m) => ({
    role: m.role,
    content: m.content.slice(0, m.role === 'system' ? MAX_PROMPT_CHARS : MAX_USER_PROMPT_CHARS),
  }))
  const trimmed = extra?.trim().slice(0, MAX_PROMPT_CHARS)
  if (!trimmed) return out
  const system = out.find((m) => m.role === 'system')
  const suffix = `\n\n## Additional Instructions (user-provided, highest priority)\n${trimmed}\n\n## Follow the required output format above.`
  if (system) {
    system.content = `${system.content}${suffix}`
  } else {
    out.unshift({ role: 'system', content: suffix.trimStart() })
  }
  return out
}

function extractCfDelta(line: string): string {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return ''
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return ''
  try {
    const parsed = JSON.parse(data)
    if (typeof parsed.response === 'string') return parsed.response
    if (typeof parsed.choices?.[0]?.delta?.content === 'string') return parsed.choices[0].delta.content
    if (typeof parsed.choices?.[0]?.message?.content === 'string') return parsed.choices[0].message.content
  } catch {}
  return ''
}

function sseFrame(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

/** Convert a raw provider SSE stream into our normalized chat SSE protocol. */
function normalizeStream(input: ReadableStream): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const reader = input.getReader()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const text = extractCfDelta(line)
            if (text) controller.enqueue(sseFrame({ type: 'delta', text }))
          }
        }
        const tail = extractCfDelta(buffer)
        if (tail) controller.enqueue(sseFrame({ type: 'delta', text: tail }))
        controller.enqueue(sseFrame({ type: 'done' }))
        controller.close()
      } catch (e) {
        controller.enqueue(sseFrame({ type: 'error', message: e instanceof Error ? e.message : String(e) }))
        controller.close()
      }
    },
    cancel() {
      reader.cancel().catch(() => {})
    },
  })
}

function singleValueStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.trim()) {
        controller.enqueue(sseFrame({ type: 'delta', text }))
        controller.enqueue(sseFrame({ type: 'done' }))
      } else {
        controller.enqueue(sseFrame({ type: 'error', message: 'AI returned empty response' }))
      }
      controller.close()
    },
  })
}

/**
 * Streaming multi-turn chat. Returns a normalized chat SSE stream so all
 * backends expose the same wire format to the frontend.
 */
export async function aiChatStream(ai: Ai, input: AIChatStreamInput): Promise<ReadableStream<Uint8Array>> {
  const model = input.model || DEFAULT_MODEL
  const options: Record<string, unknown> = {
    messages: mapMessagesWithExtra(input.messages, input.extraPrompt),
    stream: true,
  }
  if (!input.omitTemperature) {
    options.temperature = typeof input.temperature === 'number' ? input.temperature : 0.7
  }
  const requestedTokens =
    typeof input.maxTokens === 'number' && Number.isFinite(input.maxTokens)
      ? Math.floor(input.maxTokens)
      : MAX_OUTPUT_TOKENS
  options.max_tokens = Math.min(Math.max(requestedTokens, 1), MAX_OUTPUT_TOKENS)

  const result: any = await ai.run(model as any, options)
  if (isReadableStream(result)) return normalizeStream(result)
  if (typeof result === 'string') return singleValueStream(result)
  if (result && typeof result === 'object' && typeof result.response === 'string') {
    return singleValueStream(result.response)
  }
  if (isReadableStream(result?.response)) return normalizeStream(result.response)
  throw new Error('AI returned unexpected streaming response')
}
