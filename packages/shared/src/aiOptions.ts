export interface AIOptions {
  thinking: 'auto' | 'on' | 'off'
  reasoning_effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  max_tokens: number
  token_parameter: 'max_tokens' | 'max_completion_tokens'
  temperature: number | null
  prompt: string
  timeout_seconds: number
  retries: number
}

export const DEFAULT_AI_OPTIONS: AIOptions = {
  thinking: 'auto', reasoning_effort: 'medium', max_tokens: 16384,
  token_parameter: 'max_tokens', temperature: 0.7, prompt: '', timeout_seconds: 120, retries: 0,
}

export function resolveAIOptions(value?: Partial<AIOptions>): AIOptions {
  const o = { ...DEFAULT_AI_OPTIONS, ...value }
  if (!['auto', 'on', 'off'].includes(o.thinking)
    || !['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(o.reasoning_effort)
    || !['max_tokens', 'max_completion_tokens'].includes(o.token_parameter)
    || !Number.isInteger(o.max_tokens) || o.max_tokens < 1 || o.max_tokens > 1000000
    || (o.temperature !== null && (typeof o.temperature !== 'number' || !Number.isFinite(o.temperature) || o.temperature < 0 || o.temperature > 2))
    || !Number.isInteger(o.timeout_seconds) || o.timeout_seconds < 1 || o.timeout_seconds > 3600
    || !Number.isInteger(o.retries) || o.retries < 0 || o.retries > 5
    || typeof o.prompt !== 'string' || o.prompt.length > 20000) {
    throw new Error('Invalid AI options: check token limit, temperature (0–2), timeout (1–3600s), retries (0–5), and prompt (≤20000 characters).')
  }
  return o
}

export function aiRequestParameters(options?: Partial<AIOptions>): Record<string, unknown> {
  const o = resolveAIOptions(options)
  return {
    [o.token_parameter]: o.max_tokens,
    ...(o.temperature === null ? {} : { temperature: o.temperature }),
    ...(o.thinking === 'auto' ? {} : { reasoning_effort: o.thinking === 'off' ? 'none' : o.reasoning_effort }),
  }
}

export function withAdditionalPrompt(system: string, options?: Partial<AIOptions>): string {
  const prompt = options?.prompt?.trim()
  return prompt ? `${system}\n\n## Additional user instructions\n${prompt}\n\nFollow the required output format above.` : system
}
