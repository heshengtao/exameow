import { QuestionType } from '@exameow/shared'
import type { Question } from '@exameow/shared'
import { normalizeQuestion } from './dataCompat.ts'

// Run with:
//   JITI_ALIAS='{"@":"<repo>/frontend/src"}' npx jiti src/utils/dataCompat.test.ts
// (plain asserts, like practiceFilter.test.ts — the node:test runner cannot
// resolve the extensionless imports inside @exameow/shared.)

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`)
}

function tf(answer: string): Question {
  return normalizeQuestion(
    { id: 'q', type: 'true_false', stem: 'Stem', options: ['True', 'False'], answer, analysis: '' },
    'fallback',
  )
}

// Every producer spelling is folded once, on the way in.
assertEqual(tf('对').answer, 'True', '对')
assertEqual(tf('√').answer, 'True', '√')
assertEqual(tf('正确').answer, 'True', '正确')
assertEqual(tf('True').answer, 'True', 'True')
assertEqual(tf('T').answer, 'True', 'T')
assertEqual(tf('A').answer, 'True', 'A')
assertEqual(tf('1').answer, 'True', '1')
assertEqual(tf('不正确').answer, 'False', '不正确')

// Regression for issue #17: "False" must never be read as "True".
assertEqual(tf('False').answer, 'False', 'False')
assertEqual(tf('错').answer, 'False', '错')
assertEqual(tf('×').answer, 'False', '×')
assertEqual(tf('错误').answer, 'False', '错误')
assertEqual(tf('B').answer, 'False', 'B')
assertEqual(tf('0').answer, 'False', '0')

// Idempotent: a bank that is saved and reloaded again must not drift.
assertEqual(normalizeQuestion(tf('对'), 'again').answer, 'True', 'reload True')
assertEqual(normalizeQuestion(tf('错'), 'again').answer, 'False', 'reload False')

// Type is preserved and other types are untouched.
assertEqual(tf('对').type, QuestionType.TrueFalse, 'type preserved')
assertEqual(
  normalizeQuestion({ id: 's', type: 'single_choice', stem: 'S', options: ['A', 'B'], answer: 'B', analysis: '' }, 'x').answer,
  'B',
  'single_choice untouched',
)
assertEqual(
  normalizeQuestion({ id: 'f', type: 'fill_blank', stem: 'S ___', options: [], answer: '对', analysis: '' }, 'x').answer,
  '对',
  'fill_blank untouched',
)

// A question that only *looks* true/false is inferred and then canonicalised.
assertEqual(
  normalizeQuestion({ stem: 'Earth is round.', options: [], answer: '√', analysis: '' }, 'inferred').type,
  QuestionType.TrueFalse,
  'inferred type',
)

// ---- choice types: the same class of bug as #17 ----
// An answer written as option text used to reduce to "" and be graded wrong on
// every click. It is folded to a letter once, on the way in.

function choice(answer: string, options: string[], type = 'single_choice'): Question {
  return normalizeQuestion({ id: 'c', type, stem: 'S', options, answer, analysis: '' }, 'fallback')
}

const OPTS = ['北京', '上海', '广州', '深圳']
assertEqual(choice('A', OPTS).answer, 'A', 'letter stays a letter')
assertEqual(choice('1', OPTS).answer, 'A', 'digit becomes a letter')
assertEqual(choice('北京', OPTS).answer, 'A', 'option text becomes a letter')
assertEqual(choice('上海', OPTS).answer, 'B', 'option text becomes a letter (B)')
assertEqual(choice('A. 北京', OPTS).answer, 'A', 'prefixed option text')
assertEqual(choice('北京。', OPTS).answer, 'A', 'trailing punctuation')
assertEqual(choice('北京、上海', OPTS, 'multi_choice').answer, 'AB', 'multi option text')
assertEqual(choice('亚运会', OPTS).answer, '亚运会', 'unknown text is left alone')
assertEqual(choice('北京', ['北京', '北京']).answer, '北京', 'ambiguous duplicate options are not guessed')

// Grading then only ever sees letters, so clicks grade correctly.
assertEqual(choice('北京', OPTS).answer, 'A', 'regraded after normalisation')

console.log('dataCompat: normalisation ok')
