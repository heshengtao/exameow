import type { AIOptions } from '../../packages/shared/src/aiOptions'
import type { Ai } from '@cloudflare/workers-types'
import { aiChat } from './ai'
import { JudgeResult } from './types'

export interface JudgeInput {
  stem: string
  referenceAnswer: string
  analysis: string
  userAnswer: string
  language: string
  options?: AIOptions
  signal?: AbortSignal
  model?: string
}

export async function judgeAnswer(ai: Ai, input: JudgeInput): Promise<JudgeResult> {
  const systemPrompt = buildJudgeSystemPrompt()
  const userPrompt = buildJudgeUserPrompt(
    input.stem,
    input.referenceAnswer,
    input.analysis,
    input.userAnswer,
    input.language
  )
  const response = await aiChat(ai, { model: input.model, options: input.options, signal: input.signal, systemPrompt, userPrompt })
  return parseJudge(response)
}

function buildJudgeSystemPrompt(): string {
  return `You are a strict but fair exam grader. You will be given an exam question, the reference answer, an optional reference analysis, and a student's answer. Decide whether the student's answer is correct.

## Grading Rules
1. Judge by meaning, not wording: if the student's answer is semantically equivalent to the reference answer, it is correct even if phrased differently.
2. A partial answer that misses key points required by the reference answer is incorrect.
3. Extra correct information does not make the answer wrong, unless it contradicts the reference answer.

## Output Rules
1. Respond ONLY with a valid JSON object — no explanation outside JSON, no markdown fences.
2. The JSON object MUST have exactly these fields:
   - "correct": true or false
   - "feedback": one or two sentences explaining why the answer is correct, or what is missing or wrong.
3. Write "feedback" in the requested language.`
}

function buildJudgeUserPrompt(
  stem: string,
  referenceAnswer: string,
  analysis: string,
  userAnswer: string,
  language: string
): string {
  const analysisBlock = analysis.trim() ? `\n\nREFERENCE ANALYSIS:\n${analysis}` : ''
  return `Language: ${language}\n\nQUESTION:\n${stem}\n\nREFERENCE ANSWER:\n${referenceAnswer}${analysisBlock}\n\nSTUDENT ANSWER:\n${userAnswer}`
}

export function parseJudge(raw: string): JudgeResult {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  cleaned = cleaned.replace(/\n?```\s*$/i, '')

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const json = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned

  const parsed = JSON.parse(json)
  if (typeof parsed?.correct !== 'boolean' || typeof parsed?.feedback !== 'string') {
    throw new Error('AI judge missing "correct"/"feedback" fields')
  }
  return { correct: parsed.correct, feedback: parsed.feedback }
}
