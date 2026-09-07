import { aiRequestParameters, withAdditionalPrompt, type AIConfig } from '@exameow/shared'
import { AIHttpError, runAIRequest } from '../../../packages/shared/src/aiRequest'
import { normalizeEndpoint } from './endpoint'

export async function chatRequest(system: string, user: string, config: AIConfig, signal?: AbortSignal): Promise<string> {
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: withAdditionalPrompt(system, config.options) },
      { role: 'user', content: user },
    ],
    ...aiRequestParameters(config.options),
  }
  return runAIRequest(async (attemptSignal) => {
    const res = await fetch(`${normalizeEndpoint(config.endpoint)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify(body), signal: attemptSignal,
    })
    if (!res.ok) throw new AIHttpError(res.status, await res.text())
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw new Error('AI returned empty response')
    return content
  }, config.options, signal)
}
