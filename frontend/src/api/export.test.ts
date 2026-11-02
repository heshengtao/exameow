import { Difficulty, QuestionType } from '@exameow/shared'
import type { Question } from '@exameow/shared'
import { generateCsvContent as generateHttpCsvContent } from './http'
import { generateCsvContent as generateCfCsvContent } from './cf'

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function csvRow(content: string, rowIndex: number): string[] {
  const rows = content.replace(/^\uFEFF/, '').split('\n')
  return rows[rowIndex]!.split(',').map((cell) => cell.slice(1, -1).replace(/""/g, '"'))
}

const questions: Question[] = [
  {
    id: 'q1', type: QuestionType.SingleChoice, stem: 'Populated', options: ['A'], answer: 'A', analysis: '',
    subject: 'Subject', chapter: 'Chapter', difficulty: Difficulty.Hard,
  },
  {
    id: 'q2', type: QuestionType.ShortAnswer, stem: 'Missing', options: [], answer: 'Answer', analysis: '',
  },
]

for (const [name, generate] of [
  ['HTTP', generateHttpCsvContent],
  ['Cloudflare', generateCfCsvContent],
] as const) {
  // 默认中文
  const header = csvRow(generate(questions), 0)
  const populated = csvRow(generate(questions), 1)
  const missing = csvRow(generate(questions), 2)
  assertEqual(header[14], '难度', `${name} difficulty header position`)
  assertEqual(populated[14], '困难', `${name} populated difficulty position`)
  assertEqual(missing[14], '', `${name} missing difficulty position`)

  // 法语:表头与题型/难度都应跟随 locale
  const frHeader = csvRow(generate(questions, 'fr'), 0)
  const frRow = csvRow(generate(questions, 'fr'), 1)
  assertEqual(frHeader[0], 'Énoncé', `${name} fr stem header`)
  assertEqual(frHeader[14], 'Difficulté', `${name} fr difficulty header`)
  assertEqual(frRow[1], 'Choix unique', `${name} fr type label`)
  assertEqual(frRow[14], 'Difficile', `${name} fr difficulty label`)
}
