import { Difficulty } from '@exameow/shared'
import { analyzeCSV, parseWithMapping } from './importParser.ts'

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
}

const labels: Array<[string, Difficulty | undefined]> = [
  ['简单', Difficulty.Easy],
  ['easy', Difficulty.Easy],
  ['中等', Difficulty.Medium],
  ['medium', Difficulty.Medium],
  ['困难', Difficulty.Hard],
  ['hard', Difficulty.Hard],
  ['', undefined],
  ['unknown', undefined],
]

for (const [label, expected] of labels) {
  const analysis = analyzeCSV(`题干,答案,难度\nQ,A,${label}`)
  if (!analysis) throw new Error('expected CSV analysis')
  assertEqual(parseWithMapping(analysis, analysis.mapping, 'test')[0]?.difficulty, expected, `difficulty ${label}`)
}

for (const header of ['難易度', '難易度']) {
  const analysis = analyzeCSV(`题干,答案,${header}\nQ,A,hard`)
  if (!analysis) throw new Error(`expected CSV analysis for ${header}`)
  assertEqual(parseWithMapping(analysis, analysis.mapping, 'test')[0]?.difficulty, Difficulty.Hard, `header ${header}`)
}

const headerlessCanonical = analyzeCSV('Q,single_choice,A,B,C,D,E,F,G,H,A,,Physics,Chapter 1,hard')
if (!headerlessCanonical) throw new Error('expected headerless canonical CSV analysis')
assertEqual(headerlessCanonical.hasHeader, false, 'headerless canonical format')
assertEqual(parseWithMapping(headerlessCanonical, headerlessCanonical.mapping, 'test')[0]?.difficulty, Difficulty.Hard, 'headerless canonical difficulty')

const multiRowCanonical = analyzeCSV([
  'First question,single_choice,A,B,C,D,E,F,G,H,A,,Physics,Chapter 1,hard',
  'Second question,multi_choice,A,B,C,D,E,F,G,H,A,B,Physics,Chapter 2,medium',
].join('\n'))
if (!multiRowCanonical) throw new Error('expected multi-row headerless canonical CSV analysis')
assertEqual(multiRowCanonical.hasHeader, false, 'multi-row headerless canonical format')
const multiRowQuestions = parseWithMapping(multiRowCanonical, multiRowCanonical.mapping, 'test')
assertEqual(multiRowQuestions.length, 2, 'multi-row headerless canonical retains first row')
assertEqual(multiRowQuestions[0]?.stem, 'First question', 'multi-row headerless canonical first stem')
assertEqual(multiRowQuestions[0]?.difficulty, Difficulty.Hard, 'multi-row headerless canonical difficulty')
assertEqual(multiRowQuestions[1]?.difficulty, Difficulty.Medium, 'multi-row headerless canonical second difficulty')

const singleRowCanonical = analyzeCSV('Only question,single_choice,A,B,C,D,E,F,G,H,A,,Physics,Chapter 3,easy')
if (!singleRowCanonical) throw new Error('expected single-row headerless canonical CSV analysis')
assertEqual(singleRowCanonical.hasHeader, false, 'single-row headerless canonical format')
const singleRowQuestions = parseWithMapping(singleRowCanonical, singleRowCanonical.mapping, 'test')
assertEqual(singleRowQuestions.length, 1, 'single-row headerless canonical retains row')
assertEqual(singleRowQuestions[0]?.difficulty, Difficulty.Easy, 'single-row headerless canonical difficulty')
