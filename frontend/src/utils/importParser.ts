import type { Question, QuestionMedia } from '@exameow/shared'
import { Difficulty, QuestionType as QT } from '@exameow/shared'
import * as XLSX from 'xlsx'
import { extractXlsxImages, groupImagesByRow, type XlsxImageEntry } from '@/utils/xlsxMediaParser'
import {
  MEDIA_COLUMNS,
  headerRole,
  imageTargetForColumn,
  imageTargetForHeader,
  type ImageColumnTarget,
} from '@/utils/questionMedia'
import { normalizeDifficultyLabel, normalizeQuestionTypeLabel } from '@/utils/questionLabels'

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
  /** Embedded XLSX images grouped by absolute zero-based sheet row. */
  imagesByRow?: Map<number, XlsxImageEntry[]>
  /** Absolute column index → field the image column belongs to. */
  imageColumns?: Map<number, ImageColumnTarget>
  /** Absolute sheet row of `rows[0]` (used to align drawing anchors). */
  rowOffset?: number
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

const INLINE_IMAGE_PATTERN = /(?:_xlfn\.)?DISPIMG\s*\(\s*"[^"]*"\s*(?:,\s*\d+\s*)?\)/gi

/** WPS in-cell images replace the text value with a DISPIMG formula. */
function stripInlineImageText(value: string): string {
  if (!value || !value.toUpperCase().includes('DISPIMG')) return value
  return value.replace(INLINE_IMAGE_PATTERN, '').replace(/^=+/, '').trim()
}

export const normalizeDifficulty = normalizeDifficultyLabel

function looksLikeHeader(cell: string): boolean {
  if (!cell || cell.trim().length === 0) return false
  const t = cell.trim()
  if (/^\d+$/.test(t)) return false
  if (t.length > 30) return false
  return headerRole(t) !== null || normalizeQuestionTypeLabel(t) !== null
}

function isHeaderRow(row: unknown[]): boolean {
  if (!row || row.length === 0) return false
  if (detectColumnType(String(row[1] ?? '')) !== null) return false
  const totalCells = row.length
  const headerCells = row.filter(c => {
    const s = String(c ?? '').trim()
    return s.length > 0 && looksLikeHeader(String(c ?? ''))
  }).length
  return headerCells >= 2 && headerCells / totalCells >= 0.4
}

function detectColumnType(val: string): QuestionType | null {
  return normalizeQuestionTypeLabel(val)
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

function buildColumnMap(headers: string[]): ColumnMapping {
  const map: ColumnMapping = {
    stem: null, type: null, options: [], combinedOptions: null,
    optionsDelimiter: '', answer: null, analysis: null, subject: null, chapter: null, difficulty: null,
  }

  for (let i = 0; i < headers.length; i++) {
    const role = headerRole(headers[i] ?? '')
    if (!role) continue
    switch (role) {
      case 'stem':
        if (map.stem === null) map.stem = i
        break
      case 'type':
        if (map.type === null) map.type = i
        break
      case 'answer':
        if (map.answer === null) map.answer = i
        break
      case 'analysis':
        if (map.analysis === null) map.analysis = i
        break
      case 'subject':
        if (map.subject === null) map.subject = i
        break
      case 'chapter':
        if (map.chapter === null) map.chapter = i
        break
      case 'difficulty':
        if (map.difficulty === null) map.difficulty = i
        break
      case 'combinedOptions':
        if (map.combinedOptions === null) map.combinedOptions = i
        break
      case 'option':
        map.options.push(i)
        break
      case 'stemImage':
        break
      default:
        break
    }
  }

  return map
}

function applyPositionalFallback(map: ColumnMapping, columnCount: number): void {
  if (columnCount === 2) {
    map.stem = 0
    map.answer = 1
    return
  }
  if (columnCount >= 3) {
    map.stem = 0
    map.answer = columnCount - 2
    if (columnCount >= 4) map.analysis = columnCount - 1
    for (let i = 1; i < Math.min(columnCount - 2, 9); i++) {
      map.options.push(i)
    }
  }
}

function isCanonicalHeaderlessRow(row: string[]): boolean {
  return row.length >= 15 && detectColumnType(row[1] ?? '') !== null
}

function applyCanonicalHeaderlessFallback(map: ColumnMapping): void {
  map.stem = 0
  map.type = 1
  map.options = [2, 3, 4, 5, 6, 7, 8, 9]
  map.answer = 10
  map.analysis = 11
  map.subject = 12
  map.chapter = 13
  map.difficulty = 14
}

function typeLabelToEnum(label: string): QuestionType {
  return normalizeQuestionTypeLabel(label) ?? SA
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
      mapping: buildColumnMap(firstRow),
      missing: [],
    }
  }

  const isCanonicalHeaderless = isCanonicalHeaderlessRow(firstRow)
  const hasHeader = !isCanonicalHeaderless && isHeaderRow(firstRow)
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
    if (isCanonicalHeaderless) {
      applyCanonicalHeaderlessFallback(mapping)
    } else {
      applyPositionalFallback(mapping, columnCount)
    }
  }

  if (mapping.combinedOptions !== null) {
    const ci = mapping.combinedOptions
    const samples = rows.slice(0, 20).map(r => r[ci] ?? '')
    mapping.optionsDelimiter = detectOptionsDelimiter(samples)
  }

  const missing = hasHeader ? computeMissing(rows, mapping, true) : []
  return { headers, rows, hasHeader, mapping, missing }
}

export interface StoredImportImage {
  id: string
  col: number
}

function buildImageColumnMap(headers: string[], forceNativeXlsx: boolean): Map<number, ImageColumnTarget> {
  const map = new Map<number, ImageColumnTarget>()
  headers.forEach((header, index) => {
    const target = imageTargetForHeader(header)
    if (target) map.set(index, target)
  })
  if (map.size > 0) return map

  if (forceNativeXlsx || headers.length > MEDIA_COLUMNS[0]!.index) {
    for (const column of MEDIA_COLUMNS) {
      map.set(column.index, imageTargetForColumn(column.index))
    }
  }
  return map
}

export function parseWithMapping(
  analysis: ImportAnalysis,
  mapping: ColumnMapping,
  source: string,
  storedImagesByRow?: Map<number, StoredImportImage[]>,
): Question[] {
  const questions: Question[] = []
  const rows = analysis.rows
  const sheetRowOffset = (analysis.hasHeader ? 1 : 0) + (analysis.rowOffset ?? 0)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const stored = storedImagesByRow?.get(i + sheetRowOffset) ?? []
    const allBlank = row.every(c => !c || c.trim() === '') && stored.length === 0
    if (allBlank) continue

    const stem = mapping.stem !== null ? (row[mapping.stem] ?? '').trim() : ''

    const media: QuestionMedia[] = []
    for (const image of stored) {
      const imageColumn = analysis.imageColumns?.get(image.col)
      if (imageColumn) {
        if (imageColumn.target === 'option') {
          const letter = imageColumn.optionIndex ?? 0
          const textColumn = 2 + letter
          const position = mapping.options.indexOf(textColumn)
          media.push({
            id: image.id,
            target: 'option',
            optionIndex: position >= 0 ? position : letter,
          })
        } else {
          media.push({ id: image.id, target: 'stem' })
        }
        continue
      }
      if (image.col === 0) {
        media.push({ id: image.id, target: 'stem' })
        continue
      }
      const position = mapping.options.indexOf(image.col)
      if (position >= 0) {
        media.push({ id: image.id, target: 'option', optionIndex: position })
      }
    }

    if (!stem && media.length === 0) continue

    let qtype: QuestionType = SA
    if (mapping.type !== null) {
      const t = (row[mapping.type] ?? '').trim()
      qtype = typeLabelToEnum(t)
    }

    const hasOptionMedia = media.some(item => item.target === 'option')
    const options: string[] = []
    if (mapping.combinedOptions !== null) {
      const cell = (row[mapping.combinedOptions] ?? '').trim()
      if (cell) {
        options.push(...splitOptionsCell(cell, mapping.optionsDelimiter || undefined))
      }
    } else {
      for (const oi of mapping.options) {
        const option = (row[oi] ?? '').trim()
        if (option || hasOptionMedia) options.push(option)
      }
      if (hasOptionMedia) {
        while (options.length > 0 && options[options.length - 1] === '') options.pop()
      }
    }

    let maxOptionIndex = -1
    for (const item of media) {
      if (item.target === 'option') {
        maxOptionIndex = Math.max(maxOptionIndex, item.optionIndex ?? 0)
      }
    }
    while (options.length <= maxOptionIndex) options.push('')

    const answer = mapping.answer !== null ? (row[mapping.answer] ?? '').trim() : ''
    const analysisText = mapping.analysis !== null ? (row[mapping.analysis] ?? '').trim() : ''
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
      analysis: analysisText,
      subject: mapping.subject !== null ? (row[mapping.subject] ?? '').trim() || undefined : undefined,
      chapter: mapping.chapter !== null ? (row[mapping.chapter] ?? '').trim() || undefined : undefined,
      difficulty,
      ...(media.length > 0 ? { media } : {}),
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
  if (rows.length === 0) return null
  if (rows.length < 2 && !isCanonicalHeaderlessRow(rows[0] ?? [])) return null
  return analyzeRows(rows, false)
}

export function analyzeExcel(buffer: ArrayBuffer): ImportAnalysis | null {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', bookFiles: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return null

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return null

  const rawRows: (string[] | undefined)[] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: true,
  })
  const rows = rawRows.filter((r): r is string[] => r !== undefined).map(r => r.map(c => stripInlineImageText(String(c ?? ''))))
  if (rows.length === 0) return null

  const headers = rows[0] ?? []
  const forceNativeXlsx = detectXlsxFormat(headers)
  const analysis = analyzeRows(rows, forceNativeXlsx)
  if (!analysis) return null

  analysis.imageColumns = buildImageColumnMap(headers, forceNativeXlsx)
  const rangeStartRow = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0
  analysis.rowOffset = rangeStartRow
  const files = (workbook as unknown as { files?: Record<string, unknown> }).files
  if (files) {
    analysis.imagesByRow = groupImagesByRow(
      extractXlsxImages(files as Parameters<typeof extractXlsxImages>[0]),
    )
  }
  return analysis
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
