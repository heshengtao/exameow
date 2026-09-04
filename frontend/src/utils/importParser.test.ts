import { Difficulty } from '@exameow/shared'
import { analyzeCSV, parseWithMapping } from './importParser'

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
