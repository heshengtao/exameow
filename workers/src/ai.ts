import { aiRequestParameters, withAdditionalPrompt, type AIOptions } from '../../packages/shared/src/aiOptions'
import { AIHttpError, runAIRequest } from '../../packages/shared/src/aiRequest'
import { Ai } from '@cloudflare/workers-types'
import { DEFAULT_MODEL } from './types'

interface AIChatInput {
  options?: AIOptions
  signal?: AbortSignal
  model?: string
  systemPrompt: string
  userPrompt: string
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

  return runAIRequest(async (signal) => {
    const response = await ai.run(model as any, {
      messages: [
        { role: 'system', content: withAdditionalPrompt(input.systemPrompt, input.options) },
        { role: 'user', content: input.userPrompt },
      ],
      ...aiRequestParameters(input.options),
      stream: false,
    }, { signal, returnRawResponse: true })
    if (!response.ok) throw new AIHttpError(response.status, await response.text())
    const result = response.headers.get('content-type')?.includes('text/event-stream')
      ? response.body : await response.json()
    return parseAIResult(result)
  }, input.options, input.signal)
}

async function parseAIResult(result: any): Promise<string> {
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
