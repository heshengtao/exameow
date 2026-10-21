import { QuestionType, type Question } from '@exameow/shared'
import { McpToolError } from './registry'

const QUESTION_TYPES: QuestionType[] = [
  QuestionType.SingleChoice,
  QuestionType.MultiChoice,
  QuestionType.TrueFalse,
  QuestionType.FillBlank,
  QuestionType.ShortAnswer,
]

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
  return input.map((raw, index) => {
    const source = (raw ?? {}) as Record<string, any>
    const type = QUESTION_TYPES.includes(source.type) ? (source.type as QuestionType) : QuestionType.SingleChoice
    const id =
      typeof source.id === 'string' && source.id.trim() !== ''
        ? source.id.trim()
        : `${prefix}-${Date.now().toString(36)}-${index}`
    return {
      id,
      type,
      stem: String(source.stem ?? ''),
      options: Array.isArray(source.options) ? source.options.map((item: unknown) => String(item)) : [],
      answer: String(source.answer ?? ''),
      analysis: String(source.analysis ?? ''),
      ...(typeof source.aiAnalysis === 'string' ? { aiAnalysis: source.aiAnalysis } : {}),
      ...(typeof source.score === 'number' ? { score: source.score } : {}),
      ...(typeof source.subject === 'string' ? { subject: source.subject } : {}),
      ...(typeof source.chapter === 'string' ? { chapter: source.chapter } : {}),
      ...(source.difficulty === 'easy' || source.difficulty === 'medium' || source.difficulty === 'hard'
        ? { difficulty: source.difficulty }
        : {}),
      ...(Array.isArray(source.images) ? { images: source.images.map((item: unknown) => String(item)) } : {}),
    } as Question
  })
}

/** Strips the answer so an agent can be quizzed without seeing the solution. */
export function publicQuestion(question: Question) {
  return {
    id: question.id,
    type: question.type,
    stem: question.stem,
    options: question.options,
    images: question.images ?? [],
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
