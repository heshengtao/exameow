import { grade } from './relay'
import { QuestionType } from './types'
import type { Question } from './types'

// Run with: npx jiti src/relay.test.ts
//
// Mirrors `frontend/tests/fillBlankAnswer.test.ts` and
// `packages/server/src/relay.rs` (relay::answer_matching_tests): a question must
// grade identically on the app, the Worker and the Axum server.

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
}

function q(type: QuestionType, answer: string): Question {
  return { id: 'q', type, stem: 'S', options: [], answer, analysis: '' }
}

// fill_blank: presentation noise is folded away.
assertEqual(grade(q(QuestionType.FillBlank, '北京'), '北京。'), true, 'trailing punctuation')
assertEqual(grade(q(QuestionType.FillBlank, 'ABC'), 'ＡＢＣ'), true, 'full width')
assertEqual(grade(q(QuestionType.FillBlank, 'an apple'), 'an  apple'), true, 'double space')
assertEqual(grade(q(QuestionType.FillBlank, '北京/Beijing'), '北京'), true, 'author alternative')
assertEqual(grade(q(QuestionType.FillBlank, 'km/h'), 'km'), false, 'slash inside one answer is not an alternative')
assertEqual(grade(q(QuestionType.FillBlank, '北京'), '上海'), false, 'different answer')
assertEqual(grade(q(QuestionType.FillBlank, '北京'), ''), false, 'empty answer')

// true_false: canonical values win, legacy exams still grade.
assertEqual(grade(q(QuestionType.TrueFalse, 'True'), 'A'), true, 'canonical true + A')
assertEqual(grade(q(QuestionType.TrueFalse, 'False'), 'A'), false, 'canonical false + A')
assertEqual(grade(q(QuestionType.TrueFalse, 'False'), 'B'), true, 'canonical false + B')
assertEqual(grade(q(QuestionType.TrueFalse, 'FALSE'), 'B'), true, 'legacy FALSE is false')
assertEqual(grade(q(QuestionType.TrueFalse, '对'), 'A'), true, 'legacy 对')
assertEqual(grade(q(QuestionType.TrueFalse, '不正确'), 'B'), true, 'negated legacy')

// choice types unchanged.
assertEqual(grade(q(QuestionType.SingleChoice, 'B'), 'B'), true, 'single choice')
assertEqual(grade(q(QuestionType.MultiChoice, 'A,C'), 'CA'), true, 'multi choice order insensitive')

console.log('workers relay: answer matching ok')
