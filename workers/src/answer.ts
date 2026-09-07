import type { AIOptions } from '../../packages/shared/src/aiOptions'
import { Ai } from '@cloudflare/workers-types'
import { aiChat } from './ai'
import { AnswerResult } from './types'

export async function answerQuestion(
  ai: Ai,
  question: string,
  language: string,
  model?: string,
  options?: AIOptions,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const systemPrompt = buildAnswerSystemPrompt()
  const userPrompt = buildAnswerUserPrompt(question, language)
  const response = await aiChat(ai, { model, options, signal, systemPrompt, userPrompt })
  return parseAnswer(response)
}

function buildAnswerSystemPrompt(): string {
  return `You are an expert exam-solving assistant. The user will give you an exam question (it may include options). Solve it.

## Output Rules
1. Respond ONLY with a valid JSON object — no explanation outside JSON, no markdown fences.
2. The JSON object MUST have exactly these fields:
   - "answer": the concise answer. For choice questions give the option letter(s) plus the option content; for true/false questions answer "True" or "False" (or the equivalent in the requested language); otherwise give the answer text directly.
   - "analysis": a clear step-by-step explanation of why this answer is correct.
3. Use the requested language for both fields.
4. If the question is ambiguous or unanswerable, still fill "answer" with your best attempt and explain the uncertainty in "analysis".`
}

function buildAnswerUserPrompt(question: string, language: string): string {
  return `Language: ${language}\n\nQUESTION:\n${question}`
}

export function parseAnswer(raw: string): AnswerResult {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  cleaned = cleaned.replace(/\n?```\s*$/i, '')

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const json = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned

  const parsed = JSON.parse(json)
  if (typeof parsed?.answer !== 'string' || typeof parsed?.analysis !== 'string') {
    throw new Error('AI answer missing "answer"/"analysis" fields')
  }
  return { answer: parsed.answer, analysis: parsed.analysis }
}
