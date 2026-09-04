import { Difficulty, QuestionType } from './types'
import type { Question } from './types'
import { generateCsvContent, generateXlsxBuffer } from './export'

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

const csv = generateCsvContent(questions)
assertEqual(csvRow(csv, 0)[14], '难度', 'Worker CSV difficulty header position')
assertEqual(csvRow(csv, 1)[14], 'hard', 'Worker CSV populated difficulty position')
assertEqual(csvRow(csv, 2)[14], '', 'Worker CSV missing difficulty position')

function unzipStoredFile(zip: Uint8Array, wantedName: string): string {
  const decoder = new TextDecoder()
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  for (let offset = 0; offset + 30 <= zip.byteLength;) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const name = decoder.decode(zip.subarray(offset + 30, offset + 30 + nameLength))
    const dataStart = offset + 30 + nameLength + extraLength
    if (name === wantedName) return decoder.decode(zip.subarray(dataStart, dataStart + compressedSize))
    offset = dataStart + compressedSize
  }
  throw new Error(`missing ZIP entry ${wantedName}`)
}

const sheet = unzipStoredFile(generateXlsxBuffer(questions), 'xl/worksheets/sheet1.xml')
const shared = unzipStoredFile(generateXlsxBuffer(questions), 'xl/sharedStrings.xml')
assertEqual(sheet.includes('r="O1"'), true, 'Worker XLSX difficulty header column')
assertEqual(sheet.includes('r="O2"'), true, 'Worker XLSX populated difficulty column')
assertEqual(sheet.includes('r="O3"'), true, 'Worker XLSX missing difficulty column')
assertEqual(shared.includes('<t>难度</t>'), true, 'Worker XLSX difficulty header')
assertEqual(shared.includes('<t>hard</t>'), true, 'Worker XLSX populated difficulty')
