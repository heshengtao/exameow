import assert from 'node:assert/strict'
import { Difficulty, QuestionType } from './types'
import { generateExam, normalizeQuestionDifficulty } from './exam'
import type { Ai } from '@cloudflare/workers-types'
import type { Question } from './types'

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
assert.ok(normalized.every((question) => question.difficulty === Difficulty.Hard))

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

assert.equal(generated.length, 2)
assert.ok(generated.every((question) => question.difficulty === Difficulty.Hard))
