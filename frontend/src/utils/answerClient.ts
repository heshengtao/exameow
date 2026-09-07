import { chatRequest } from './chatRequest'
import type { AIConfig, AnswerResult, ExplainParams, ExplainResult, JudgeParams, JudgeResult } from '@exameow/shared'

const SYSTEM_PROMPT = `You are an expert exam-solving assistant. The user will give you an exam question (it may include options). Solve it.

## Output Rules
1. Respond ONLY with a valid JSON object — no explanation outside JSON, no markdown fences.
2. The JSON object MUST have exactly these fields:
   - "answer": the concise answer. For choice questions give the option letter(s) plus the option content; for true/false questions answer "True" or "False" (or the equivalent in the requested language); otherwise give the answer text directly.
   - "analysis": a clear step-by-step explanation of why this answer is correct.
3. Use the requested language for both fields.
4. If the question is ambiguous or unanswerable, still fill "answer" with your best attempt and explain the uncertainty in "analysis".`

export async function answerViaCustomAI(
  question: string,
  language: string,
  config: AIConfig,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const content = await chatRequest(SYSTEM_PROMPT, `Language: ${language}\n\nQUESTION:\n${question}`, config, signal)
  return parseAnswer(content)
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

const JUDGE_SYSTEM_PROMPT = `You are a strict but fair exam grader. You will be given an exam question, the reference answer, an optional reference analysis, and a student's answer. Decide whether the student's answer is correct.

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

function buildJudgeUserPrompt(params: JudgeParams, language: string): string {
  const analysis = params.analysis ?? ''
  const analysisBlock = analysis.trim() ? `\n\nREFERENCE ANALYSIS:\n${analysis}` : ''
  return `Language: ${language}\n\nQUESTION:\n${params.stem}\n\nREFERENCE ANSWER:\n${params.reference_answer}${analysisBlock}\n\nSTUDENT ANSWER:\n${params.user_answer}`
}

export async function judgeViaCustomAI(
  params: JudgeParams,
  language: string,
  config: AIConfig,
  signal?: AbortSignal,
): Promise<JudgeResult> {
  const content = await chatRequest(JUDGE_SYSTEM_PROMPT, buildJudgeUserPrompt(params, language), config, signal)
  return parseJudge(content)
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

const EXPLAIN_SYSTEM_PROMPT = `You are an expert tutor helping a student learn from an exam question. You will be given an exam question (it may include options), its reference answer, and an optional reference analysis. The reference answer is authoritative — treat it as correct.

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

function buildExplainUserPrompt(params: ExplainParams, language: string): string {
  const analysis = params.analysis ?? ''
  const analysisBlock = analysis.trim() ? `\n\nREFERENCE ANALYSIS:\n${analysis}` : ''
  return `Language: ${language}\n\nQUESTION:\n${params.stem}\n\nREFERENCE ANSWER:\n${params.reference_answer}${analysisBlock}`
}

export async function explainViaCustomAI(
  params: ExplainParams,
  language: string,
  config: AIConfig,
  signal?: AbortSignal,
): Promise<ExplainResult> {
  const content = await chatRequest(EXPLAIN_SYSTEM_PROMPT, buildExplainUserPrompt(params, language), config, signal)
  return parseExplain(content)
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
