import type { Question, Difficulty } from '@exameow/shared'

function extractBatchFileLabel(text: string): string {
  const firstLine = text.trimStart().split('\n')[0] ?? ''
  if (firstLine.startsWith('## ')) return firstLine.slice(3).trim()
  return ''
}

export function tagQuestions(
  questions: Question[],
  batchText: string,
  sourceFileName: string,
  subject: string,
  topicFilter: string,
  requestedDifficulty: Difficulty,
): Question[] {
  const chapter = topicFilter.trim() || extractBatchFileLabel(batchText) || sourceFileName.trim() || undefined
  const normalizedSubject = subject.trim() || undefined
  return questions.map(question => ({
    ...question,
    subject: normalizedSubject,
    chapter,
    difficulty: requestedDifficulty,
  }))
}
