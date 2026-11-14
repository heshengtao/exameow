import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesFillBlank, normalizeFillBlank } from '../src/utils/fillBlankAnswer.ts'

// A blank is typed, so the same correct answer arrives with presentation noise.
// These cases must match `workers/src/relay.ts` and `packages/server/src/relay.rs`.

test('presentation noise does not change the answer', () => {
  assert.equal(matchesFillBlank('北京', '北京'), true)
  assert.equal(matchesFillBlank('北京。', '北京'), true)
  assert.equal(matchesFillBlank('北京．', '北京'), true)
  assert.equal(matchesFillBlank('ＡＢＣ', 'ABC'), true)
  assert.equal(matchesFillBlank('an  apple', 'an apple'), true)
  assert.equal(matchesFillBlank('  Beijing ', 'beijing'), true)
  assert.equal(matchesFillBlank('3.14。', '3.14'), true)
})

test('a genuinely different answer is still wrong', () => {
  assert.equal(matchesFillBlank('上海', '北京'), false)
  assert.equal(matchesFillBlank('beijin', 'beijing'), false)
  assert.equal(matchesFillBlank('3.15', '3.14'), false)
})

test('author alternatives are accepted, slashes inside an answer are not', () => {
  assert.equal(matchesFillBlank('北京', '北京/Beijing'), true)
  assert.equal(matchesFillBlank('beijing', '北京/Beijing'), true)
  assert.equal(matchesFillBlank('北京', '北京（或 Beijing）'), false) // not an alternative syntax we accept
  // "km/h", "2/3" and "TCP/IP" are single answers — the CJK guard keeps them whole.
  assert.equal(matchesFillBlank('km', 'km/h'), false)
  assert.equal(matchesFillBlank('km/h', 'km/h'), true)
  assert.equal(matchesFillBlank('2', '2/3'), false)
  assert.equal(matchesFillBlank('TCP', 'TCP/IP'), false)
})

test('an empty answer is never correct', () => {
  assert.equal(matchesFillBlank(null, '北京'), false)
  assert.equal(matchesFillBlank('', '北京'), false)
  assert.equal(matchesFillBlank('   ', '北京'), false)
  assert.equal(matchesFillBlank('。', '北京'), false)
})

test('normalisation is idempotent', () => {
  for (const value of ['北京。', 'ＡＢＣ', 'an  apple', 'beijing']) {
    const once = normalizeFillBlank(value)
    assert.equal(normalizeFillBlank(once), once, value)
  }
})
