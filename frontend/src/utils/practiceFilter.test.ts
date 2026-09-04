import { Difficulty, QuestionType } from '@exameow/shared'
import type { PracticeSession, Question } from '@exameow/shared'
import { matchPracticeFilter, UNMARKED_DIFFICULTY } from './practiceFilter.ts'

function assertEqual(actual: boolean, expected: boolean) {
  if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`)
}

const q: Question = {
  id: 'q1',
  type: QuestionType.SingleChoice,
  stem: 'Question',
  options: [],
  answer: 'A',
  analysis: '',
}

assertEqual(matchPracticeFilter({ ...q, difficulty: Difficulty.Easy }, { difficulties: [Difficulty.Easy] }), true)
assertEqual(matchPracticeFilter({ ...q, difficulty: Difficulty.Easy }, { difficulties: [Difficulty.Hard] }), false)
assertEqual(matchPracticeFilter({ ...q, difficulty: undefined }, { difficulties: [Difficulty.Medium] }), false)
assertEqual(matchPracticeFilter({ ...q, difficulty: undefined }, { difficulties: [UNMARKED_DIFFICULTY] }), true)
assertEqual(matchPracticeFilter({ ...q, subject: undefined }, { subjects: ['Physics'] }), false)
assertEqual(
  matchPracticeFilter(
    { ...q, chapter: 'A', difficulty: Difficulty.Hard },
    { chapters: ['A'], difficulties: [Difficulty.Hard] },
  ),
  true,
)
assertEqual(
  matchPracticeFilter(
    { ...q, chapter: 'A', difficulty: Difficulty.Easy },
    { chapters: ['A'], difficulties: [Difficulty.Hard] },
  ),
  false,
)
assertEqual(matchPracticeFilter(q, { types: [] }), false)
assertEqual(matchPracticeFilter(q, { difficulties: [] }), false)
assertEqual(matchPracticeFilter(q, { difficulties: undefined }), true)

const persistedFilteredSession: PracticeSession = {
  bankId: 'bank-1',
  mode: 'sequential',
  questions: [],
  currentIndex: 0,
  startedAt: 0,
  finishedAt: null,
  filter: { difficulties: [Difficulty.Hard] },
}

if (persistedFilteredSession.filter?.difficulties?.[0] !== Difficulty.Hard) {
  throw new Error('Expected PracticeSession to preserve its filter')
}
