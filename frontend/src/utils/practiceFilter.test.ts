import { Difficulty, QuestionType } from '@exameow/shared'
import type { MockExamConfig, PracticeSession, Question } from '@exameow/shared'
import { getResumedPracticeSettings, matchPracticeFilter, normalizeMockQuestionCount, reconcileMockConfig, reconcileMockTypeCounts, UNMARKED_DIFFICULTY } from './practiceFilter.ts'

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

const resumedSettings = getResumedPracticeSettings({
  ...persistedFilteredSession,
  bankId: 'bank-2',
  mode: 'mock',
  mockConfig: { typeCounts: { single_choice: 3 } },
})
if (resumedSettings.bankId !== 'bank-2' || resumedSettings.mode !== 'mock'
  || resumedSettings.filter.difficulties?.[0] !== Difficulty.Hard
  || resumedSettings.mockConfig.typeCounts.single_choice !== 3) {
  throw new Error('Expected persisted practice settings to resume together')
}

const legacyResumedSettings = getResumedPracticeSettings({ ...persistedFilteredSession, filter: undefined })
if (Object.keys(legacyResumedSettings.filter).length !== 0) {
  throw new Error('Expected legacy sessions without filters to reset filter state')
}

const availableTypes = [
  { type: QuestionType.SingleChoice, label: 'Single choice', count: 2 },
]
const selectedAfterFilterChange: MockExamConfig = {
  typeCounts: {
    [QuestionType.SingleChoice]: 5,
    [QuestionType.ShortAnswer]: 2,
  },
}
const reconciled = reconcileMockTypeCounts(selectedAfterFilterChange, availableTypes)
if (JSON.stringify(reconciled.typeCounts) !== JSON.stringify({ [QuestionType.SingleChoice]: 2 })) {
  throw new Error('Expected filter changes to prune stale mock types and clamp available counts')
}

const staleOnly = reconcileMockTypeCounts(
  { typeCounts: { [QuestionType.ShortAnswer]: 1 } },
  availableTypes,
)
if (Object.keys(staleOnly.typeCounts).length !== 0) {
  throw new Error('Expected stale-only mock configuration to become empty')
}

const invalidCounts: MockExamConfig = {
  typeCounts: {
    [QuestionType.SingleChoice]: 2.9,
    [QuestionType.TrueFalse]: Number.NaN,
    [QuestionType.FillBlank]: Number.POSITIVE_INFINITY,
    [QuestionType.ShortAnswer]: 0,
    [QuestionType.MultiChoice]: -1,
  },
}
if (normalizeMockQuestionCount(2.9) !== 2) {
  throw new Error('Expected decimal mock counts to be normalized down to a positive integer')
}
for (const count of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
  if (normalizeMockQuestionCount(count) !== null) {
    throw new Error(`Expected invalid mock count ${count} to be discarded`)
  }
}

const mixedBoundaryConfig = reconcileMockConfig(invalidCounts, [
  { ...q, id: 'available-single' },
])
if (JSON.stringify(mixedBoundaryConfig.typeCounts) !== JSON.stringify({ [QuestionType.SingleChoice]: 1 })) {
  throw new Error('Expected the mock boundary to retain only normalized, available counts')
}
