import type { Question, PracticeFilter } from '@exameow/shared'

export function matchPracticeFilter(q: Question, filter?: PracticeFilter): boolean {
  const subjects = filter?.subjects?.filter(Boolean) ?? []
  const chapters = filter?.chapters?.filter(Boolean) ?? []
  const types = filter?.types?.filter(Boolean) ?? []
  if (subjects.length === 0 && chapters.length === 0 && types.length === 0) return true
  if (types.length && !types.includes(q.type)) return false
  if (subjects.length && q.subject && !subjects.includes(q.subject)) return false
  if (chapters.length && (!q.chapter || !chapters.includes(q.chapter))) return false
  return true
}
