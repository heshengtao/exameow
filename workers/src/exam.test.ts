import { Difficulty, QuestionType } from './types'
import { generateExam, normalizeQuestionDifficulty } from './exam'
import type { Ai } from '@cloudflare/workers-types'
import type { Question } from './types'

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function assertOk(value: boolean, message: string): void {
  if (!value) throw new Error(message)
}

const questions: Question[] = [
  {
    id: 'q1', type: QuestionType.SingleChoice, stem: 'One?', options: ['A'], answer: 'A', analysis: '',
  },
  {
    id: 'q2', type: QuestionType.TrueFalse, stem: 'Two?', options: ['True', 'False'], answer: 'True', analysis: '',
    difficulty: Difficulty.Easy,
  },
]

const normalized = normalizeQuestionDifficulty(questions, Difficulty.Hard)
assertOk(normalized.every((question) => question.difficulty === Difficulty.Hard), 'normalized questions should have the requested difficulty')

const aiResponse = [
  {
    id: 'q1', type: QuestionType.SingleChoice, stem: 'One?', options: ['A', 'B'], answer: 'A', analysis: '',
  },
  {
    id: 'q2', type: QuestionType.TrueFalse, stem: 'Two?', options: ['True', 'False'], answer: 'True', analysis: '', difficulty: Difficulty.Easy,
  },
]

const mockAi = {
  run: async () => ({ response: aiResponse }),
} as unknown as Ai

const generated = await generateExam(mockAi, 'Boundary test content', {
  question_types: [QuestionType.SingleChoice, QuestionType.TrueFalse],
  count: 2,
  difficulty: Difficulty.Hard,
  language: 'en-US',
}, 'mock-model')

assertEqual(generated.length, 2, 'generated question count')
assertOk(generated.every((question) => question.difficulty === Difficulty.Hard), 'generated questions should have the requested difficulty')
