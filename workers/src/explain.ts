import type { AIOptions } from '../../packages/shared/src/aiOptions'
import type { Ai } from '@cloudflare/workers-types'
import { aiChat } from './ai'
import { ExplainResult } from './types'

export interface ExplainInput {
  stem: string
  referenceAnswer: string
  analysis: string
  language: string
  options?: AIOptions
  signal?: AbortSignal
  model?: string
}

export async function explainQuestion(ai: Ai, input: ExplainInput): Promise<ExplainResult> {
  const systemPrompt = buildExplainSystemPrompt()
  const userPrompt = buildExplainUserPrompt(
    input.stem,
    input.referenceAnswer,
    input.analysis,
    input.language
  )
  const response = await aiChat(ai, { model: input.model, options: input.options, signal: input.signal, systemPrompt, userPrompt })
  return parseExplain(response)
}

function buildExplainSystemPrompt(): string {
  return `You are an expert tutor helping a student learn from an exam question. You will be given an exam question (it may include options), its reference answer, and an optional reference analysis. The reference answer is authoritative — treat it as correct.

## Rules
1. Explain why the reference answer is correct: the key knowledge points, the reasoning steps, and why the other options (if any) are wrong.
2. If a reference analysis is provided, you may enrich and expand it, but never contradict it.
3. If the reference answer appears wrong, still explain the most likely intended reasoning, and briefly note the ambiguity at the end.
4. Be concise and pedagogical: aim for a short structured explanation a student can learn from in under a minute.

## Output Rules
1. Respond ONLY with a valid JSON object — no explanation outside JSON, no markdown fences.
2. The JSON object MUST have exactly this field:
   - "explanation": the explanation text (plain text, may use newlines for structure).
3. Write "explanation" in the requested language.`
}

function buildExplainUserPrompt(
  stem: string,
  referenceAnswer: string,
  analysis: string,
  language: string
): string {
  const analysisBlock = analysis.trim() ? `\n\nREFERENCE ANALYSIS:\n${analysis}` : ''
  return `Language: ${language}\n\nQUESTION:\n${stem}\n\nREFERENCE ANSWER:\n${referenceAnswer}${analysisBlock}`
}

export function parseExplain(raw: string): ExplainResult {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  cleaned = cleaned.replace(/\n?```\s*$/i, '')

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const json = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned

  const parsed = JSON.parse(json)
  if (typeof parsed?.explanation !== 'string') {
    throw new Error('AI explain missing "explanation" field')
  }
  return { explanation: parsed.explanation }
}
