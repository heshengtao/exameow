import { Difficulty, QuestionType } from './types'
import { normalizeQuestionDifficulty } from './exam'
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
if (!normalized.every((question) => question.difficulty === Difficulty.Hard)) {
  throw new Error('Worker generation normalization must apply requested difficulty to every question')
}
