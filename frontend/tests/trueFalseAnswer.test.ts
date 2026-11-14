import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalTrueFalseAnswer,
  gradeTrueFalse,
  isTrueAnswer,
  trueFalseLetter,
} from '../src/utils/trueFalseAnswer.ts'

// Issue #17 (做不了判断题): the generator answers true/false questions with the
// literal words "True"/"False". `"FALSE".includes("A")` made every false answer
// read as true, so every 判断题 was graded as if the answer were 对.

test('the literal answers the prompt asks for round-trip', () => {
  assert.equal(isTrueAnswer('True'), true)
  assert.equal(isTrueAnswer('False'), false)
  assert.equal(isTrueAnswer('true'), true)
  assert.equal(isTrueAnswer('false'), false)
})

test('every producer spelling folds into the canonical state', () => {
  for (const answer of ['True', 'TRUE', 'true', '对', '正确', '√', '是', 'T', 'Y', 'A', '1', 'YES']) {
    assert.equal(canonicalTrueFalseAnswer(answer), 'True', answer)
  }
  for (const answer of ['False', 'FALSE', 'false', '错', '错误', '×', '否', 'F', 'N', 'B', '0', 'NO']) {
    assert.equal(canonicalTrueFalseAnswer(answer), 'False', answer)
  }
  assert.equal(canonicalTrueFalseAnswer(''), 'False')
})

test('canonicalisation is idempotent, so re-loading a bank never drifts', () => {
  for (const answer of ['True', 'False', '对', '错', '√', '×', '1', '0']) {
    const once = canonicalTrueFalseAnswer(answer)
    assert.equal(canonicalTrueFalseAnswer(once), once, answer)
  }
})

test('a user clicking 错 on a False question is graded correct', () => {
  // QuestionCard submits option letters: A = 对/True, B = 错/False.
  assert.equal(gradeTrueFalse('B', 'False'), true)
  assert.equal(gradeTrueFalse('A', 'False'), false)
  assert.equal(gradeTrueFalse('B', 'True'), false)
  assert.equal(gradeTrueFalse('A', 'True'), true)
})

test('grading ignores option text entirely', () => {
  // Same canonical answer must grade the same regardless of how the bank
  // phrased its options (or whether it stored none at all).
  for (const correct of ['True', 'False']) {
    assert.equal(gradeTrueFalse('A', correct), correct === 'True')
    assert.equal(gradeTrueFalse('B', correct), correct === 'False')
  }
})

test('legacy un-normalised answers still grade by meaning', () => {
  assert.equal(gradeTrueFalse('A', '对'), true)
  assert.equal(gradeTrueFalse('B', '错误'), true)
  assert.equal(gradeTrueFalse('B', '不正确'), true)
  assert.equal(gradeTrueFalse('A', '不正确'), false)
})

test('a blank answer is never graded as correct', () => {
  assert.equal(gradeTrueFalse(null, 'False'), null)
  assert.equal(gradeTrueFalse('', 'True'), null)
  assert.equal(gradeTrueFalse('   ', 'False'), null)
})

test('the rendered correct option matches the graded answer', () => {
  assert.equal(trueFalseLetter('False'), 'B')
  assert.equal(trueFalseLetter('错误'), 'B')
  assert.equal(trueFalseLetter('True'), 'A')
  assert.equal(trueFalseLetter('对'), 'A')
})
