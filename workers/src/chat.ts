import type { Ai } from '@cloudflare/workers-types'
import { aiChatOverrides, aiChatStream } from './ai'
import { MAX_CHAT_MESSAGES, MAX_PROMPT_CHARS, MAX_USER_PROMPT_CHARS, type AIRequestOptions } from './types'

const ROLES = new Set(['system', 'user', 'assistant'])

/** Keep only well-formed recent messages and clamp each one before forwarding. */
export function normalizeChatMessages(raw: unknown): { role: string; content: string }[] {
  if (!Array.isArray(raw)) return []
  const out: { role: string; content: string }[] = []
  for (const item of raw.slice(-MAX_CHAT_MESSAGES)) {
    if (!item || typeof item !== 'object') continue
    const role = (item as { role?: unknown }).role
    const content = (item as { content?: unknown }).content
    if (typeof role !== 'string' || !ROLES.has(role) || typeof content !== 'string') continue
    const max = role === 'system' ? MAX_PROMPT_CHARS : MAX_USER_PROMPT_CHARS
    const trimmed = content.slice(0, max)
    if (!trimmed.trim()) continue
    out.push({ role, content: trimmed })
  }
  return out
}

export function chatStream(
  ai: Ai,
  messages: { role: string; content: string }[],
  model?: string,
  options?: AIRequestOptions,
): Promise<ReadableStream<Uint8Array>> {
  return aiChatStream(ai, { model, messages, ...aiChatOverrides(options) })
}
