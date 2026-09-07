import type { Question } from '@exameow/shared'

/** Null represents unchaptered questions, without reserving a chapter name. */
export function groupChapters(questions: Question[]): { chapter: string | null; count: number }[] {
  const counts = new Map<string | null, number>()
  for (const question of questions) {
    const chapter = question.chapter?.trim() || null
    counts.set(chapter, (counts.get(chapter) ?? 0) + 1)
  }
  return [...counts].map(([chapter, count]) => ({ chapter, count }))
}
