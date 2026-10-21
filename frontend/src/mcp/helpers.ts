import type { Question } from '@exameow/shared'
import { McpToolError } from './registry'
import { normalizeQuestion } from '@/utils/dataCompat'

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function argString(
  args: Record<string, any>,
  key: string,
  required = false,
): string | undefined {
  const value = args[key]
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (required) throw new McpToolError('invalid_args', `\`${key}\` is required`)
  return undefined
}

export function argNumber(
  args: Record<string, any>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = args[key]
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function normalizeQuestions(input: unknown, prefix = 'mcp'): Question[] {
  if (!Array.isArray(input)) {
    throw new McpToolError('invalid_args', '`questions` must be an array')
  }
  const stamp = Date.now().toString(36)
  return input.map((raw, index) => normalizeQuestion(raw, `${prefix}-${stamp}-${index}`))
}

/** Strips the answer so an agent can be quizzed without seeing the solution. */
export function publicQuestion(question: Question) {
  return {
    id: question.id,
    type: question.type,
    stem: question.stem,
    options: question.options,
    media: question.media ?? [],
  }
}

export function bankSummary(bank: any) {
  return {
    id: bank.id,
    name: bank.name,
    count: bank.questions.length,
    createdAt: bank.createdAt,
    source: bank.source,
  }
}
