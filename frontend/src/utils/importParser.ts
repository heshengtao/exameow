import type { Question } from '@exameow/shared'
import { Difficulty, QuestionType as QT } from '@exameow/shared'
import * as XLSX from 'xlsx'

type QuestionType = typeof QT[keyof typeof QT]

const ST: QuestionType = 'single_choice' as QuestionType
const MT: QuestionType = 'multi_choice' as QuestionType
const TF: QuestionType = 'true_false' as QuestionType
const FB: QuestionType = 'fill_blank' as QuestionType
const SA: QuestionType = 'short_answer' as QuestionType

export interface ColumnMapping {
  stem: number | null
  type: number | null
  options: number[]
  combinedOptions: number | null
  optionsDelimiter: string
  answer: number | null
  analysis: number | null
  subject: number | null
  chapter: number | null
  difficulty: number | null
}

export type MissingField = 'stem' | 'answer' | 'options'

export interface ImportAnalysis {
  headers: string[]
  rows: string[][]
  hasHeader: boolean
  mapping: ColumnMapping
  missing: MissingField[]
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

export function normalizeDifficulty(value: string): Difficulty | undefined {
  switch (normalize(value)) {
    case '简单':
    case 'easy': return Difficulty.Easy
    case '中等':
    case 'medium': return Difficulty.Medium
    case '困难':
    case 'hard': return Difficulty.Hard
    default: return undefined
  }
}

function looksLikeHeader(cell: string): boolean {
  if (!cell || cell.trim().length === 0) return false
  const t = cell.trim()
  if (/^\d+$/.test(t)) return false
  if (t.length > 30) return false
  const keywords = [
    '题干', '题目', '题', 'stem', 'question', 'title',
    '题型', '类型', 'type',
    '选项', 'option', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    '答案', '正确答案', 'answer',
    '解析', '分析', 'analysis', '章节', '难度', '難度', '难易度', '難易度', 'difficulty',
    'dificultad', 'difficulté', 'schwierigkeit', 'сложность', 'مستوى الصعوبة', '난이도',
    'questiontype', 'singlechoice', 'multichoice', 'truefalse',
    '单选题', '多选题', '判断题', '填空题', '简答题', '判断',
    '对错', '正确', '正确选项',
  ]
  return keywords.some(k => normalize(t).includes(normalize(k)))
}

function isHeaderRow(row: unknown[]): boolean {
  if (!row || row.length === 0) return false
  const totalCells = row.length
  const headerCells = row.filter(c => {
    const s = String(c ?? '').trim()
    return s.length > 0 && looksLikeHeader(String(c ?? ''))
  }).length
  return headerCells >= 2 && headerCells / totalCells >= 0.4
}

function detectColumnType(val: string): QuestionType | null {
  const v = normalize(val)
  if (v.includes('单选') || (v.includes('single') && !v.includes('multi'))) return ST
  if (v.includes('多选') || v.includes('multi') || v.includes('多项')) return MT
  if (v.includes('判断') || v.includes('true') || v.includes('false') || v.includes('对错') || v === '是非' || v.includes('是非')) return TF
  if (v.includes('填空') || v.includes('fill') || v.includes('blank') || v.includes('blanks')) return FB
  if (v.includes('简答') || v.includes('问答') || v.includes('short') || v.includes('essay') || v.includes('主观')) return SA
  return null
}

function detectColumnTypeFromQA(stem: string, answer: string, hasOptions: boolean): QuestionType | null {
  if (hasOptions && answer.length <= 3) {
    if (answer.includes(',') || answer.includes(';') || answer.includes('、') || answer.length > 1) {
      return MT
    }
    return ST
  }
  const judgeKeys = ['对', '错', '√', '×', '正确', '错误', 'true', 'false', '是', '否']
  if (judgeKeys.some(k => answer.trim().replace(/[.。]/g, '') === k || answer.trim().toLowerCase() === k)) {
    return TF
  }
  if (hasOptions) return ST
  if (!stem.includes('_____') && !answer.includes('填空')) return SA
  return FB
}

function isCombinedOptionsHeader(n: string): boolean {
  return n === '选项' || n === 'options' || n === 'option' || n === '所有选项' || n === '全部选项'
    || n === '选项内容' || n === 'optionscontent' || n === 'choices' || n === 'choice'
}

function buildColumnMap(headers: string[]): ColumnMapping {
  const map: ColumnMapping = {
    stem: null, type: null, options: [], combinedOptions: null,
    optionsDelimiter: '', answer: null, analysis: null, subject: null, chapter: null, difficulty: null,
  }

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (!h) continue
    const n = normalize(h)

    if (map.stem === null && (
      n.includes('题干') || n.includes('题目') || n === '题' || n.includes('stem') || n.includes('question') || n === 'title' || n.includes('内容') || n === 'q'
    )) {
      map.stem = i
      continue
    }

    if (map.type === null && (
      n.includes('题型') || n.includes('类型') || n.includes('type') || n === 'qt' || n.includes('种类')
    )) {
      map.type = i
      continue
    }

    if (map.answer === null && (
      n.includes('答案') || n.includes('正确') || n.includes('answer') || n === 'ans' || n.includes('标准') || n.includes('key')
    )) {
      map.answer = i
      continue
    }

    if (map.analysis === null && (
      n.includes('解析') || n.includes('分析') || n.includes('analysis') || n.includes('explanation') || n.includes('详解') || n.includes('解释')
    )) {
      map.analysis = i
      continue
    }

    if (map.subject === null && (
      n.includes('学科') || n.includes('科目') || n.includes('课程') || n.includes('subject') || n.includes('course') || n.includes('discipline')
    )) {
      map.subject = i
      continue
    }

    if (map.chapter === null && (
      n.includes('章节') || n.includes('chapter') || n.includes('unit') || n.includes('模块')
    )) {
      map.chapter = i
      continue
    }

    if (map.difficulty === null && (
      n.includes('难度') || n.includes('難度') || n.includes('難易度') || n.includes('难易度') || n.includes('difficulty')
      || n.includes('dificultad') || n.includes('difficulté') || n.includes('schwierigkeit')
      || n.includes('сложность') || n.includes('مستوىالصعوبة') || n.includes('난이도')
    )) {
      map.difficulty = i
      continue
    }

    if (isCombinedOptionsHeader(n)) {
      if (map.combinedOptions === null) map.combinedOptions = i
      continue
    }

    if (/^[a-h]$/i.test(n) || n.includes('选项') || n.includes('option')) {
      map.options.push(i)
      continue
    }

    if (/^选项\s*[a-h]$/i.test(n) || /^option\s*[a-h]$/i.test(n)) {
      map.options.push(i)
    }
  }

  return map
}

function applyPositionalFallback(map: ColumnMapping, columnCount: number): void {
  if (columnCount >= 3) {
    map.stem = 0
    map.answer = columnCount - 2
    if (columnCount >= 4) map.analysis = columnCount - 1
    for (let i = 1; i < Math.min(columnCount - 2, 9); i++) {
      map.options.push(i)
    }
  }
}

function buildXlsxColumnMap(): ColumnMapping {
  return {
    stem: 0,
    type: 1,
    options: [2, 3, 4, 5, 6, 7, 8, 9],
    combinedOptions: null,
    optionsDelimiter: '',
    answer: 10,
    analysis: 11,
    subject: 12,
    chapter: 13,
    difficulty: 14,
  }
}

function typeLabelToEnum(label: string): QuestionType {
  const n = normalize(label)
  if (n.includes('单选') || n.includes('single')) return ST
  if (n.includes('多选') || n.includes('multi')) return MT
  if (n.includes('判断') || n.includes('true') || n.includes('false') || n.includes('对错')) return TF
  if (n.includes('填空') || n.includes('fill') || n.includes('blank')) return FB
  if (n.includes('简答') || n.includes('问答') || n.includes('short') || n.includes('essay')) return SA
  return SA
}

const OPTION_PREFIX_SPLIT = /\s*[A-Ha-h][.、．:：)）]\s*/
const OPTION_PREFIX_STRIP = /^\s*[A-Ha-h][.、．:：)）]\s*/

function stripOptionPrefix(s: string): string {
  return s.replace(OPTION_PREFIX_STRIP, '').replace(/[;；|、]\s*$/, '').trim()
}

function splitWithDelimiter(cell: string, delimiter: string): string[] {
  return cell
    .split(delimiter)
    .map(p => stripOptionPrefix(p))
    .filter(p => p.length > 0)
}

export function splitOptionsCell(cell: string, delimiter?: string): string[] {
  const text = (cell ?? '').trim()
  if (!text) return []

  if (delimiter === 'prefix') {
    const parts = text.split(OPTION_PREFIX_SPLIT).map(p => p.trim()).filter(p => p.length > 0)
    return parts.length > 0 ? parts : [text]
  }
  if (delimiter) {
    return splitWithDelimiter(text, delimiter === '\\n' ? '\n' : delimiter)
  }

  const candidates: Array<{ name: string; test: () => string[] | null }> = [
    {
      name: '\\n',
      test: () => {
        if (!/\r?\n/.test(text)) return null
        return splitWithDelimiter(text, '\n')
      },
    },
    { name: '；', test: () => (text.includes('；') ? splitWithDelimiter(text, '；') : null) },
    { name: ';', test: () => (text.includes(';') ? splitWithDelimiter(text, ';') : null) },
    { name: '|', test: () => (text.includes('|') ? splitWithDelimiter(text, '|') : null) },
    { name: '、', test: () => (text.includes('、') ? splitWithDelimiter(text, '、') : null) },
    {
      name: 'prefix',
      test: () => {
        if (!OPTION_PREFIX_STRIP.test(text)) return null
        const parts = text.split(OPTION_PREFIX_SPLIT).map(p => p.trim()).filter(p => p.length > 0)
        return parts.length >= 2 ? parts : null
      },
    },
  ]

  for (const c of candidates) {
    const parts = c.test()
    if (parts && parts.length >= 2) return parts
  }
  return [text]
}

export function detectOptionsDelimiter(cells: string[]): string {
  for (const cell of cells) {
    const text = (cell ?? '').trim()
    if (!text) continue
    if (/\r?\n/.test(text) && splitWithDelimiter(text, '\n').length >= 2) return '\\n'
    for (const d of ['；', ';', '|', '、']) {
      if (text.includes(d) && splitWithDelimiter(text, d).length >= 2) return d
    }
    if (OPTION_PREFIX_STRIP.test(text)) {
      const parts = text.split(OPTION_PREFIX_SPLIT).filter(p => p.trim().length > 0)
      if (parts.length >= 2) return 'prefix'
    }
  }
  return ''
}

function rowsHaveChoiceQuestions(rows: string[][], map: ColumnMapping): boolean {
  if (map.type !== null) {
    for (const row of rows.slice(0, 50)) {
      const t = (row[map.type] ?? '').trim()
      const qt = detectColumnType(t)
      if (qt === ST || qt === MT) return true
    }
    return false
  }
  if (map.answer !== null) {
    let letterAnswers = 0
    let total = 0
    for (const row of rows.slice(0, 50)) {
      const a = (row[map.answer] ?? '').trim()
      if (!a) continue
      total++
      if (/^[A-Ha-h]{1,4}$/.test(a)) letterAnswers++
    }
    return total > 0 && letterAnswers / total >= 0.3
  }
  return false
}

function computeMissing(rows: string[][], map: ColumnMapping, strict: boolean): MissingField[] {
  const missing: MissingField[] = []
  if (map.stem === null) missing.push('stem')
  if (map.answer === null) missing.push('answer')
  if (strict && map.options.length === 0 && map.combinedOptions === null) {
    if (rowsHaveChoiceQuestions(rows, map)) missing.push('options')
  }
  return missing
}

function analyzeRows(rawRows: string[][], forceNativeXlsx: boolean): ImportAnalysis | null {
  if (rawRows.length === 0) return null

  const firstRow = (rawRows[0] ?? []).map(c => String(c ?? ''))

  if (forceNativeXlsx) {
    return {
      headers: firstRow,
      rows: rawRows.slice(1),
      hasHeader: true,
      mapping: buildXlsxColumnMap(),
      missing: [],
    }
  }

  const hasHeader = isHeaderRow(firstRow)
  let headers: string[]
  let rows: string[][]
  let mapping: ColumnMapping

  if (hasHeader) {
    headers = firstRow
    rows = rawRows.slice(1)
    mapping = buildColumnMap(headers)
  } else {
    const columnCount = Math.max(...rawRows.map(r => r.length), 0)
    headers = Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`)
    rows = rawRows
    mapping = buildColumnMap([])
    applyPositionalFallback(mapping, columnCount)
  }

  if (mapping.combinedOptions !== null) {
    const ci = mapping.combinedOptions
    const samples = rows.slice(0, 20).map(r => r[ci] ?? '')
    mapping.optionsDelimiter = detectOptionsDelimiter(samples)
  }

  const missing = hasHeader ? computeMissing(rows, mapping, true) : []
  return { headers, rows, hasHeader, mapping, missing }
}

export function parseWithMapping(analysis: ImportAnalysis, mapping: ColumnMapping, source: string): Question[] {
  const questions: Question[] = []
  const rows = analysis.rows

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    const allBlank = row.every(c => !c || c.trim() === '')
    if (allBlank) continue

    const stem = mapping.stem !== null ? (row[mapping.stem] ?? '').trim() : ''
    if (!stem) continue

    let qtype: QuestionType = SA
    if (mapping.type !== null) {
      const t = (row[mapping.type] ?? '').trim()
      qtype = typeLabelToEnum(t)
    }

    const options: string[] = []
    if (mapping.combinedOptions !== null) {
      const cell = (row[mapping.combinedOptions] ?? '').trim()
      if (cell) {
        options.push(...splitOptionsCell(cell, mapping.optionsDelimiter || undefined))
      }
    } else {
      for (const oi of mapping.options) {
        const o = (row[oi] ?? '').trim()
        if (o) options.push(o)
      }
    }

    const answer = mapping.answer !== null ? (row[mapping.answer] ?? '').trim() : ''
    const analysis = mapping.analysis !== null ? (row[mapping.analysis] ?? '').trim() : ''
    const difficulty = mapping.difficulty !== null
      ? normalizeDifficulty(row[mapping.difficulty] ?? '')
      : undefined

    if (!qtype || qtype === SA) {
      const inferred = detectColumnTypeFromQA(stem, answer, options.length > 0)
      if (inferred) qtype = inferred
    }

    questions.push({
      id: `${source}-${i + 1}`,
      type: qtype,
      stem,
      options,
      answer,
      analysis,
      subject: mapping.subject !== null ? (row[mapping.subject] ?? '').trim() || undefined : undefined,
      chapter: mapping.chapter !== null ? (row[mapping.chapter] ?? '').trim() || undefined : undefined,
      difficulty,
    })
  }

  return questions
}

function detectXlsxFormat(headers: string[]): boolean {
  if (headers.length < 11) return false
  const checks = [
    normalize(headers[0] ?? '').includes('题干'),
    normalize(headers[1] ?? '').includes('题型'),
    normalize(headers[10] ?? '').includes('答案') || normalize(headers[10] ?? '').includes('正确'),
  ]
  return checks.filter(Boolean).length >= 2
}

export function analyzeCSV(text: string): ImportAnalysis | null {
  const rows = parseCSVText(text).filter(r => r.some(c => c.trim() !== ''))
  if (rows.length < 2) return null
  return analyzeRows(rows, false)
}

export function analyzeExcel(buffer: ArrayBuffer): ImportAnalysis | null {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return null

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return null

  const rawRows: (string[] | undefined)[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
  const rows = rawRows.filter((r): r is string[] => r !== undefined).map(r => r.map(c => String(c ?? '')))
  if (rows.length === 0) return null

  const headers = rows[0] ?? []
  return analyzeRows(rows, detectXlsxFormat(headers))
}

export function parseCSV(text: string): { questions: Question[]; source: string } {
  const analysis = analyzeCSV(text)
  if (!analysis) return { questions: [], source: 'csv' }
  return { questions: parseWithMapping(analysis, analysis.mapping, 'csv'), source: 'csv' }
}

export function parseExcel(buffer: ArrayBuffer, fileName: string): { questions: Question[]; source: string } {
  const analysis = analyzeExcel(buffer)
  if (!analysis) return { questions: [], source: 'excel' }
  const source = fileName.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'excel'
  return { questions: parseWithMapping(analysis, analysis.mapping, source), source }
}

function parseCSVText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(current.trim())
        current = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++
        row.push(current.trim())
        current = ''
        if (row.some(c => c !== '')) rows.push(row)
        row = []
      } else {
        current += ch
      }
    }
  }
  row.push(current.trim())
  if (row.some(c => c !== '')) rows.push(row)
  return rows
}
