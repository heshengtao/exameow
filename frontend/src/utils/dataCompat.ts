import { Difficulty, QuestionType } from '@exameow/shared'
import type { PracticeSession, Question, QuestionBank, QuestionMedia } from '@exameow/shared'
import { normalizeDifficultyLabel, normalizeQuestionTypeLabel } from '@/utils/questionLabels'

type Dict = Record<string, unknown>

function isDict(value: unknown): value is Dict {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

function optionalString(value: unknown): string | undefined {
  const text = asString(value).trim()
  return text || undefined
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return fallback
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

const VALID_TYPES = new Set<string>(Object.values(QuestionType))
const VALID_DIFFICULTIES = new Set<string>(Object.values(Difficulty))
const VALID_SOURCES = new Set<string>(['ai-generated', 'csv-import', 'xlsx-import'])
const VALID_MODES = new Set<string>(['sequential', 'random', 'mock', 'wrong'])

const JUDGE_ANSWERS = new Set(['对', '错', '√', '×', '是', '否', '正确', '错误', 'true', 'false'])

function inferType(stem: string, options: string[], answer: string): QuestionType {
  const trimmed = answer.trim()
  const upper = trimmed.toUpperCase()
  const letters = upper.replace(/[^A-H]/g, '')
  const onlyLetters = /^[A-H\s,，、;；|]+$/.test(upper) && letters.length > 0
  if (options.length > 0 && onlyLetters) {
    return letters.length > 1 ? QuestionType.MultiChoice : QuestionType.SingleChoice
  }
  if (JUDGE_ANSWERS.has(trimmed) || JUDGE_ANSWERS.has(trimmed.toLowerCase())) {
    return QuestionType.TrueFalse
  }
  if (options.length > 0) return QuestionType.SingleChoice
  if (/_{3,}|（\s*）|\(\s*\)/.test(stem)) return QuestionType.FillBlank
  return QuestionType.ShortAnswer
}

function normalizeType(value: unknown, stem: string, options: string[], answer: string): QuestionType {
  if (typeof value === 'string') {
    if (VALID_TYPES.has(value)) return value as QuestionType
    const label = normalizeQuestionTypeLabel(value)
    if (label) return label
  }
  return inferType(stem, options, answer)
}

function normalizeOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((option) => asString(option).trim())
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    return text
      .split(/\r?\n|;|；|\|/)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeChoiceAnswer(answer: string, type: QuestionType, optionCount: number): string {
  if (type !== QuestionType.SingleChoice && type !== QuestionType.MultiChoice) return answer
  const text = answer.trim()
  if (!text || optionCount === 0) return answer

  if (/^[A-Ha-h](?:[\s,，、;；|]*[A-Ha-h])*$/.test(text)) {
    return [...new Set(text.toUpperCase().replace(/[^A-H]/g, '').split(''))].join('')
  }
  if (!/^[1-8](?:[\s,，、;；|]*[1-8])*$/.test(text)) return answer

  const letters = [...new Set(text
    .replace(/[^1-8]/g, '')
    .split('')
    .map((digit) => String.fromCharCode(64 + Number(digit))))]
    .filter((letter) => letter.charCodeAt(0) - 65 < optionCount)
    .sort()
  return letters.length > 0 ? letters.join('') : answer
}

function normalizeDifficulty(value: unknown): Difficulty | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim().toLowerCase()
  if (VALID_DIFFICULTIES.has(text)) return text as Difficulty
  return normalizeDifficultyLabel(value)
}

function normalizeMedia(source: Dict): QuestionMedia[] {
  const media: QuestionMedia[] = []

  const push = (id: unknown, target: unknown, optionIndex: unknown) => {
    const imageId = asString(id).trim()
    if (!imageId) return
    if (target === 'option') {
      const index = Math.min(7, Math.max(0, Math.trunc(asNumber(optionIndex, 0))))
      media.push({ id: imageId, target: 'option', optionIndex: index })
    } else {
      media.push({ id: imageId, target: 'stem' })
    }
  }

  if (Array.isArray(source.media)) {
    for (const item of source.media) {
      if (isDict(item)) push(item.id, item.target, item.optionIndex)
      else if (typeof item === 'string') push(item, 'stem', 0)
    }
  }
  // Legacy builds stored a flat id list on `images`.
  if (Array.isArray(source.images)) {
    for (const item of source.images) {
      if (isDict(item)) push(item.id, item.target, item.optionIndex)
      else push(item, 'stem', 0)
    }
  }
  if (typeof source.image === 'string') push(source.image, 'stem', 0)

  const seen = new Set<string>()
  return media.filter((item) => {
    const key = `${item.target}:${item.optionIndex ?? ''}:${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Normalizes a stored question from any older version: fills missing fields,
 * accepts localized type/difficulty labels, and migrates the legacy flat
 * `images: string[]` field to `media` (stem-targeted).
 */
export function normalizeQuestion(raw: unknown, fallbackId: string): Question {
  const source = isDict(raw) ? raw : {}
  const stem = asString(source.stem)
  const options = normalizeOptions(source.options)
  const rawAnswer = asString(source.answer).trim()
  let type = normalizeType(source.type, stem, options, rawAnswer)
  let answer = normalizeChoiceAnswer(rawAnswer, type, options.length)
  if (type === QuestionType.SingleChoice && /^[A-H]{2,}$/.test(answer)) {
    type = QuestionType.MultiChoice
  }
  const analysis = asString(source.analysis)
  const subject = optionalString(source.subject)
  const chapter = optionalString(source.chapter)
  const difficulty = normalizeDifficulty(source.difficulty)
  const media = normalizeMedia(source)
  const aiAnalysis = typeof source.aiAnalysis === 'string' ? source.aiAnalysis : undefined
  const score = optionalNumber(source.score)

  return {
    id: optionalString(source.id) ?? fallbackId,
    type,
    stem,
    options,
    answer,
    analysis,
    ...(aiAnalysis !== undefined ? { aiAnalysis } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(subject !== undefined ? { subject } : {}),
    ...(chapter !== undefined ? { chapter } : {}),
    ...(difficulty !== undefined ? { difficulty } : {}),
    ...(media.length > 0 ? { media } : {}),
  }
}

export function normalizeBank(raw: unknown, index = 0): QuestionBank {
  const source = isDict(raw) ? raw : {}
  const id = optionalString(source.id) ?? `legacy-bank-${index + 1}`
  const rawQuestions = Array.isArray(source.questions)
    ? source.questions
    : isDict(source.questions)
      ? Object.values(source.questions)
      : []
  const seenIds = new Set<string>()

  const questions = rawQuestions.map((rawQuestion, questionIndex) => {
    const question = normalizeQuestion(rawQuestion, `${id}-q${questionIndex + 1}`)
    let uniqueId = question.id
    let suffix = 2
    while (seenIds.has(uniqueId)) {
      uniqueId = `${question.id}-${suffix++}`
    }
    seenIds.add(uniqueId)
    return uniqueId === question.id ? question : { ...question, id: uniqueId }
  })

  const sourceValue = asString(source.source)
  return {
    id,
    name: optionalString(source.name) ?? `Imported bank ${index + 1}`,
    questions,
    createdAt: asNumber(source.createdAt, 0),
    source: (VALID_SOURCES.has(sourceValue) ? sourceValue : 'ai-generated') as QuestionBank['source'],
  }
}

export function normalizeBanks(raw: unknown): QuestionBank[] {
  return Array.isArray(raw) ? raw.map((bank, index) => normalizeBank(bank, index)) : []
}

function normalizeFilter(value: unknown): PracticeSession['filter'] {
  if (!isDict(value)) return undefined
  const result: Record<string, unknown> = {}
  for (const key of ['subjects', 'chapters', 'difficulties', 'types'] as const) {
    const list = value[key]
    if (Array.isArray(list)) {
      result[key] = list.map((item) => asString(item)).filter(Boolean)
    }
  }
  if (typeof value.includeUnchaptered === 'boolean') {
    result.includeUnchaptered = value.includeUnchaptered
  }
  return Object.keys(result).length > 0 ? (result as PracticeSession['filter']) : undefined
}

/** Normalizes stored sessions, including the pre-wrapper format. */
export function normalizeSession(raw: unknown): PracticeSession | null {
  if (!isDict(raw)) return null

  const bankId = optionalString(raw.bankId) ?? ''
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : []
  const questions: PracticeSession['questions'] = []

  rawQuestions.forEach((entry, index) => {
    if (isDict(entry) && isDict(entry.question)) {
      questions.push({
        question: normalizeQuestion(entry.question, `${bankId || 'session'}-q${index + 1}`),
        userAnswer: entry.userAnswer == null ? null : asString(entry.userAnswer),
        isCorrect: typeof entry.isCorrect === 'boolean' ? entry.isCorrect : null,
        submitted: entry.submitted === true,
      })
      return
    }
    // Very old sessions stored the question directly.
    if (isDict(entry) && (entry.stem !== undefined || entry.type !== undefined)) {
      questions.push({
        question: normalizeQuestion(entry, `${bankId || 'session'}-q${index + 1}`),
        userAnswer: null,
        isCorrect: null,
        submitted: false,
      })
    }
  })

  const modeValue = asString(raw.mode)
  const mode = (VALID_MODES.has(modeValue) ? modeValue : 'sequential') as PracticeSession['mode']
  const currentIndex = questions.length === 0
    ? 0
    : Math.min(questions.length - 1, Math.max(0, Math.trunc(asNumber(raw.currentIndex, 0))))

  let mockConfig: PracticeSession['mockConfig']
  if (isDict(raw.mockConfig) && isDict(raw.mockConfig.typeCounts)) {
    const typeCounts: Record<string, number> = {}
    for (const [key, value] of Object.entries(raw.mockConfig.typeCounts)) {
      if (typeof value === 'number' && Number.isFinite(value)) typeCounts[key] = value
    }
    mockConfig = { typeCounts }
  }

  const filter = normalizeFilter(raw.filter)

  return {
    bankId,
    mode,
    questions,
    currentIndex,
    startedAt: asNumber(raw.startedAt, Date.now()),
    finishedAt: raw.finishedAt == null ? null : asNumber(raw.finishedAt, Date.now()),
    ...(mockConfig ? { mockConfig } : {}),
    ...(filter ? { filter } : {}),
  }
}
