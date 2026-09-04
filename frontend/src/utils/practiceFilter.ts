import type { Difficulty, Question, PracticeFilter } from '@exameow/shared'

export const UNMARKED_DIFFICULTY = '__unmarked__' as const

export type PracticeDifficulty = Difficulty | typeof UNMARKED_DIFFICULTY

export type PracticeFilterComparison = Omit<PracticeFilter, 'difficulties'> & {
  difficulties?: PracticeDifficulty[]
}

export function matchPracticeFilter(q: Question, filter?: PracticeFilterComparison): boolean {
  const subjects = filter?.subjects?.filter(Boolean) ?? []
  const chapters = filter?.chapters?.filter(Boolean) ?? []
  const difficulties = filter?.difficulties?.filter(Boolean)
  const types = filter?.types?.filter(Boolean)
  if (types && !types.includes(q.type)) return false
  if (subjects.length && q.subject && !subjects.includes(q.subject)) return false
  if (chapters.length && (!q.chapter || !chapters.includes(q.chapter))) return false
  if (difficulties !== undefined && difficulties.length === 0) return false
  if (difficulties?.length) {
    const difficulty = q.difficulty ?? UNMARKED_DIFFICULTY
    if (!difficulties.includes(difficulty)) return false
  }
  return true
}
