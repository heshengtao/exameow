import type { Difficulty, MockExamConfig, Question, PracticeFilter, PracticeSession, QuestionType } from '@exameow/shared'

export const UNMARKED_DIFFICULTY = '__unmarked__' as const

export type PracticeDifficulty = Difficulty | typeof UNMARKED_DIFFICULTY

export type PracticeFilterComparison = Omit<PracticeFilter, 'difficulties'> & {
  difficulties?: PracticeDifficulty[]
}

export type AvailablePracticeType = { type: QuestionType; label: string; count: number }

export function getResumedPracticeSettings(session: PracticeSession): {
  bankId: string
  mode: PracticeSession['mode']
  filter: PracticeFilterComparison
  mockConfig: MockExamConfig
} {
  return {
    bankId: session.bankId,
    mode: session.mode,
    filter: session.filter ? { ...session.filter } : {},
    mockConfig: session.mockConfig
      ? { ...session.mockConfig, typeCounts: { ...session.mockConfig.typeCounts } }
      : { typeCounts: {} },
  }
}

export function normalizeMockQuestionCount(count: number): number | null {
  if (!Number.isFinite(count)) return null
  const normalized = Math.floor(count)
  return normalized > 0 ? normalized : null
}

export function getAvailablePracticeTypes(questions: Question[]): AvailablePracticeType[] {
  const counts = new Map<QuestionType, number>()
  for (const question of questions) {
    counts.set(question.type, (counts.get(question.type) ?? 0) + 1)
  }
  return [...counts.entries()].map(([type, count]) => ({ type, label: type, count }))
}

export function reconcileMockTypeCounts(
  config: MockExamConfig,
  availableTypes: AvailablePracticeType[],
): MockExamConfig {
  const availableCounts = new Map(availableTypes.map(({ type, count }) => [type, count]))
  const typeCounts: Record<string, number> = {}
  for (const [type, count] of Object.entries(config.typeCounts)) {
    const availableCount = availableCounts.get(type as QuestionType)
    const normalizedCount = normalizeMockQuestionCount(count)
    if (availableCount && normalizedCount !== null) {
      typeCounts[type] = Math.min(normalizedCount, availableCount)
    }
  }
  return { ...config, typeCounts }
}

export function reconcileMockConfig(config: MockExamConfig, questions: Question[]): MockExamConfig {
  return reconcileMockTypeCounts(config, getAvailablePracticeTypes(questions))
}

export function matchPracticeFilter(q: Question, filter?: PracticeFilterComparison): boolean {
  const subjects = filter?.subjects?.filter(Boolean) ?? []
  const chapters = filter?.chapters?.filter(Boolean) ?? []
  const difficulties = filter?.difficulties?.filter(Boolean)
  const types = filter?.types?.filter(Boolean)
  if (types && !types.includes(q.type)) return false
  if (subjects.length && (!q.subject || !subjects.includes(q.subject))) return false
  if (chapters.length && (!q.chapter || !chapters.includes(q.chapter))) return false
  if (difficulties !== undefined && difficulties.length === 0) return false
  if (difficulties?.length) {
    const difficulty = q.difficulty ?? UNMARKED_DIFFICULTY
    if (!difficulties.includes(difficulty)) return false
  }
  return true
}
