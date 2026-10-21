import type { Ai } from '@cloudflare/workers-types'
import { aiChatOverrides, aiChatRound, aiChatStream } from './ai'
import { runTool, toolDefinitions } from './tools'
import {
  MAX_CHAT_MESSAGES,
  MAX_PROMPT_CHARS,
  MAX_USER_PROMPT_CHARS,
  MAX_TOOL_ROUNDS,
  MAX_TOOL_CALLS_PER_ROUND,
  MAX_TOOL_CALLS_TOTAL,
  type AIRequestOptions,
  type ChatMessage,
  type ChatToolConfig,
  type ChatToolName,
  type ToolCall,
} from './types'

const ROLES = new Set(['system', 'user', 'assistant', 'tool'])
const encoder = new TextEncoder()

function frame(event: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

/** Keep only well-formed recent messages and clamp each one before forwarding. */
export function normalizeChatMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  const out: ChatMessage[] = []
  for (const item of raw.slice(-MAX_CHAT_MESSAGES)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const role = record.role
    if (typeof role !== 'string' || !ROLES.has(role)) continue
    const content = typeof record.content === 'string' ? record.content : ''
    const toolCalls = Array.isArray(record.tool_calls)
      ? (record.tool_calls as ToolCall[]).slice(0, 8)
      : undefined
    if (!content.trim() && !toolCalls) continue
    const max = role === 'system' ? MAX_PROMPT_CHARS : MAX_USER_PROMPT_CHARS
    out.push({
      role: role as ChatMessage['role'],
      content: content.slice(0, max),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
      ...(typeof record.tool_call_id === 'string'
        ? { tool_call_id: record.tool_call_id }
        : {}),
    })
  }
  return out
}

export function chatStream(
  ai: Ai,
  messages: ChatMessage[],
  model?: string,
  options?: AIRequestOptions,
): Promise<ReadableStream<Uint8Array>> {
  return aiChatStream(ai, { model, messages, ...aiChatOverrides(options) })
}

function toolDetail(call: ToolCall): string | undefined {
  try {
    const args = JSON.parse(call.function.arguments)
    if (typeof args?.query === 'string') return args.query
    if (typeof args?.url === 'string') return args.url
  } catch {}
  return undefined
}

function isToolsUnsupported(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return ['tool', 'function', 'unsupported', 'not supported'].some((part) =>
    message.includes(part),
  )
}

/**
 * One `/api/chat` invocation may run several model rounds with web tools.
 * The whole loop stays inside this request to keep Worker calls minimal.
 */
export async function chatStreamWithTools(
  ai: Ai,
  messages: ChatMessage[],
  model: string | undefined,
  options: AIRequestOptions | undefined,
  toolNames: ChatToolName[],
  toolConfig: ChatToolConfig,
): Promise<ReadableStream<Uint8Array>> {
  const definitions = toolDefinitions(toolNames, toolConfig)
  if (!definitions.length) {
    return chatStream(ai, messages, model, options)
  }

  const overrides = aiChatOverrides(options)
  const maxRounds = Math.min(
    MAX_TOOL_ROUNDS,
    Math.max(1, Math.round(toolConfig.max_rounds || 3)),
  )

  let controller!: ReadableStreamDefaultController<Uint8Array>
  const out = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  const enqueue = (event: Record<string, unknown>) => {
    try {
      controller.enqueue(frame(event))
    } catch {}
  }

  void (async () => {
    const working: ChatMessage[] = messages.slice()
    const executed = new Set<string>()
    let totalCalls = 0

    try {
      for (let round = 0; round < maxRounds; round++) {
        let roundResult
        try {
          roundResult = await aiChatRound(ai, {
            model,
            messages: working,
            ...overrides,
            tools: definitions,
            toolChoice: 'auto',
          })
        } catch (error) {
          if (round === 0 && isToolsUnsupported(error)) {
            enqueue({ type: 'tool', id: 'fallback', phase: 'end', name: 'fallback', ok: false })
            const fallback = await chatStream(ai, messages, model, options)
            const fallbackReader = fallback.getReader()
            while (true) {
              const { done, value } = await fallbackReader.read()
              if (done) break
              if (value) controller.enqueue(value)
            }
            controller.close()
            return
          }
          throw error
        }

        const { stream, toolCalls } = roundResult
        const reader = stream.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) controller.enqueue(value)
        }

        const calls = await toolCalls
        if (!calls.length) {
          enqueue({ type: 'done' })
          controller.close()
          return
        }

        working.push({ role: 'assistant', content: '', tool_calls: calls })

        for (const [index, call] of calls.entries()) {
          if (index >= MAX_TOOL_CALLS_PER_ROUND || totalCalls >= MAX_TOOL_CALLS_TOTAL) {
            working.push({
              role: 'tool',
              content:
                'Tool call limit reached; answer with the information already gathered.',
              tool_call_id: call.id,
            })
            continue
          }
          totalCalls += 1

          const signature = `${call.function.name}|${call.function.arguments}`
          enqueue({
            type: 'tool',
            id: call.id,
            phase: 'start',
            name: call.function.name,
            detail: toolDetail(call),
          })

          let content = ''
          let count: number | undefined
          let ok = true
          if (executed.has(signature)) {
            content = 'Duplicate tool call skipped; use the previous result.'
          } else {
            executed.add(signature)
            try {
              const result = await runTool(
                call.function.name,
                call.function.arguments,
                toolConfig,
              )
              content = result.content
              count = result.count
            } catch (error) {
              ok = false
              content = JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }

          enqueue({
            type: 'tool',
            id: call.id,
            phase: 'end',
            name: call.function.name,
            ok,
            count,
          })
          working.push({ role: 'tool', content, tool_call_id: call.id })
        }
      }

      // Round cap reached: one final answer without tools.
      const { stream } = await aiChatRound(ai, {
        model,
        messages: working,
        ...overrides,
      })
      const reader = stream.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) controller.enqueue(value)
      }
      enqueue({ type: 'done' })
      controller.close()
    } catch (error) {
      enqueue({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      controller.close()
    }
  })()

  return out
}
