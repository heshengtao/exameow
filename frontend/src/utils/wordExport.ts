import type { Question } from '@exameow/shared'
import type { Locale } from '@/i18n/locales'
import { createZip } from '@/utils/zip'
import { EXPORT_LABELS, type ExportLabels } from '@/utils/exportLabels'
import { OPTION_LETTERS, stripOptionLabel } from '@/utils/optionText'

/**
 * Word 导出:按正式试卷模板生成两份 .docx 文档
 *  - 《题库名》试题卷.docx   (无答案,含姓名/部门/得分栏)
 *  - 《题库名》答案卷.docx   (含参考答案与解析,供批改/自学)
 *
 * 生成的是合规 OOXML(.docx = ZIP + word/document.xml 等部件),
 * 复用 utils/zip 的手写 ZIP 写入器,零运行时依赖。
 * 文案跟随用户选定的界面语言(WORD_COPY),阿拉伯语按 RTL 排版。
 */

/** 复数形态:按 Intl.PluralRules 的类别取,缺省回落到 other */
export interface PluralText {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

export interface WordCopy {
  /** 试题卷 / 答案卷 */
  paperSuffix: string
  keySuffix: string
  info: { name: string; department: string; date: string; score: string }
  answer: string
  analysis: string
  /** 大题序号:一、二、三 / 1. 2. 3. */
  sectionIndex: string[]
  sectionSep: string
  /** '(共 {n} 题)' */
  sectionCount: PluralText
  /** '(每题 {n} 分)' */
  perScore: PluralText
  /** 副标题里的题量:'共 {n} 题' */
  totalCount: PluralText
  /** 题型摘要片段:'{type} {n} 题' */
  typeCount: string
  dateLocale: string
  fontLatin: string
  fontEastAsia: string
  rtl: boolean
}

const LATIN = 'Times New Roman'
const LATIN_HEAD = 'Arial'

/** 中日韩没有单复数变化,两个形态填一样的即可 */
const same = (s: string): PluralText => ({ one: s, other: s })

export const WORD_COPY: Record<Locale, WordCopy> = {
  zh: {
    paperSuffix: '试题卷',
    keySuffix: '答案卷',
    info: { name: '姓名', department: '部门', date: '日期', score: '得分' },
    answer: '参考答案：',
    analysis: '解析：',
    sectionIndex: ['一', '二', '三', '四', '五', '六'],
    sectionSep: '、',
    sectionCount: same('(共 {n} 题)'),
    perScore: same('(每题 {n} 分)'),
    totalCount: same('共 {n} 题'),
    typeCount: '{type} {n} 题',
    dateLocale: 'zh-CN',
    fontLatin: LATIN,
    fontEastAsia: '宋体',
    rtl: false,
  },
  'zh-TW': {
    paperSuffix: '試題卷',
    keySuffix: '答案卷',
    info: { name: '姓名', department: '部門', date: '日期', score: '得分' },
    answer: '參考答案：',
    analysis: '解析：',
    sectionIndex: ['一', '二', '三', '四', '五', '六'],
    sectionSep: '、',
    sectionCount: same('(共 {n} 題)'),
    perScore: same('(每題 {n} 分)'),
    totalCount: same('共 {n} 題'),
    typeCount: '{type} {n} 題',
    dateLocale: 'zh-TW',
    fontLatin: LATIN,
    fontEastAsia: '新細明體',
    rtl: false,
  },
  en: {
    paperSuffix: 'Question Paper',
    keySuffix: 'Answer Key',
    info: { name: 'Name', department: 'Department', date: 'Date', score: 'Score' },
    answer: 'Answer: ',
    analysis: 'Explanation: ',
    sectionIndex: ['1', '2', '3', '4', '5', '6'],
    sectionSep: '. ',
    sectionCount: { one: ' ({n} question)', other: ' ({n} questions)' },
    perScore: { one: ' ({n} pt each)', other: ' ({n} pts each)' },
    totalCount: { one: '{n} question', other: '{n} questions' },
    typeCount: '{type} ×{n}',
    dateLocale: 'en-US',
    fontLatin: LATIN,
    fontEastAsia: 'SimSun',
    rtl: false,
  },
  ja: {
    paperSuffix: '問題用紙',
    keySuffix: '解答',
    info: { name: '氏名', department: '部署', date: '日付', score: '得点' },
    answer: '解答：',
    analysis: '解説：',
    sectionIndex: ['1', '2', '3', '4', '5', '6'],
    sectionSep: '. ',
    sectionCount: same('（全 {n} 問）'),
    perScore: same('（各 {n} 点）'),
    totalCount: same('全 {n} 問'),
    typeCount: '{type} {n} 問',
    dateLocale: 'ja-JP',
    fontLatin: LATIN,
    fontEastAsia: 'ＭＳ 明朝',
    rtl: false,
  },
  ko: {
    paperSuffix: '시험지',
    keySuffix: '정답',
    info: { name: '이름', department: '부서', date: '날짜', score: '점수' },
    answer: '정답: ',
    analysis: '해설: ',
    sectionIndex: ['1', '2', '3', '4', '5', '6'],
    sectionSep: '. ',
    sectionCount: same(' (총 {n}문항)'),
    perScore: same(' (문항당 {n}점)'),
    totalCount: same('총 {n}문항'),
    typeCount: '{type} {n}문항',
    dateLocale: 'ko-KR',
    fontLatin: LATIN,
    fontEastAsia: '맑은 고딕',
    rtl: false,
  },
  es: {
    paperSuffix: 'Examen',
    keySuffix: 'Clave de respuestas',
    info: { name: 'Nombre', department: 'Departamento', date: 'Fecha', score: 'Puntuación' },
    answer: 'Respuesta: ',
    analysis: 'Explicación: ',
    sectionIndex: ['1', '2', '3', '4', '5', '6'],
    sectionSep: '. ',
    sectionCount: { one: ' ({n} pregunta)', other: ' ({n} preguntas)' },
    perScore: { one: ' ({n} pto cada una)', other: ' ({n} pts cada una)' },
    totalCount: { one: '{n} pregunta', other: '{n} preguntas' },
    typeCount: '{type} ×{n}',
    dateLocale: 'es-ES',
    fontLatin: LATIN,
    fontEastAsia: 'SimSun',
    rtl: false,
  },
  fr: {
    paperSuffix: 'Sujet',
    keySuffix: 'Corrigé',
    info: { name: 'Nom', department: 'Service', date: 'Date', score: 'Note' },
    answer: 'Réponse : ',
    analysis: 'Explication : ',
    sectionIndex: ['1', '2', '3', '4', '5', '6'],
    sectionSep: '. ',
    sectionCount: { one: ' ({n} question)', other: ' ({n} questions)' },
    perScore: { one: ' ({n} pt chacune)', other: ' ({n} pts chacune)' },
    totalCount: { one: '{n} question', other: '{n} questions' },
    typeCount: '{type} ×{n}',
    dateLocale: 'fr-FR',
    fontLatin: LATIN,
    fontEastAsia: 'SimSun',
    rtl: false,
  },
  de: {
    paperSuffix: 'Klausur',
    keySuffix: 'Lösung',
    info: { name: 'Name', department: 'Abteilung', date: 'Datum', score: 'Punkte' },
    answer: 'Antwort: ',
    analysis: 'Erklärung: ',
    sectionIndex: ['1', '2', '3', '4', '5', '6'],
    sectionSep: '. ',
    sectionCount: { one: ' ({n} Frage)', other: ' ({n} Fragen)' },
    perScore: { one: ' (je {n} Punkt)', other: ' (je {n} Punkte)' },
    totalCount: { one: '{n} Frage', other: '{n} Fragen' },
    typeCount: '{type} ×{n}',
    dateLocale: 'de-DE',
    fontLatin: LATIN,
    fontEastAsia: 'SimSun',
    rtl: false,
  },
  ru: {
    paperSuffix: 'Экзаменационный бланк',
    keySuffix: 'Ключ к ответам',
    info: { name: 'Имя', department: 'Отдел', date: 'Дата', score: 'Баллы' },
    answer: 'Ответ: ',
    analysis: 'Пояснение: ',
    sectionIndex: ['1', '2', '3', '4', '5', '6'],
    sectionSep: '. ',
    sectionCount: {
      one: ' ({n} вопрос)',
      few: ' ({n} вопроса)',
      many: ' ({n} вопросов)',
      other: ' ({n} вопроса)',
    },
    perScore: {
      one: ' (по {n} баллу)',
      few: ' (по {n} балла)',
      many: ' (по {n} баллов)',
      other: ' (по {n} балла)',
    },
    totalCount: { one: '{n} вопрос', few: '{n} вопроса', many: '{n} вопросов', other: '{n} вопроса' },
    typeCount: '{type} ×{n}',
    dateLocale: 'ru-RU',
    fontLatin: LATIN,
    fontEastAsia: 'SimSun',
    rtl: false,
  },
  ar: {
    paperSuffix: 'ورقة الأسئلة',
    keySuffix: 'مفتاح الإجابة',
    info: { name: 'الاسم', department: 'القسم', date: 'التاريخ', score: 'الدرجة' },
    answer: 'الإجابة: ',
    analysis: 'التفسير: ',
    sectionIndex: ['1', '2', '3', '4', '5', '6'],
    sectionSep: '. ',
    sectionCount: {
      one: ' ({n} سؤال)',
      two: ' (سؤالان)',
      few: ' ({n} أسئلة)',
      many: ' ({n} سؤالاً)',
      other: ' ({n} سؤال)',
    },
    perScore: {
      one: ' ({n} درجة لكل سؤال)',
      two: ' (درجتان لكل سؤال)',
      few: ' ({n} درجات لكل سؤال)',
      many: ' ({n} درجة لكل سؤال)',
      other: ' ({n} درجة لكل سؤال)',
    },
    totalCount: {
      one: '{n} سؤال',
      two: 'سؤالان',
      few: '{n} أسئلة',
      many: '{n} سؤالاً',
      other: '{n} سؤال',
    },
    typeCount: '{type} ×{n}',
    dateLocale: 'ar-EG',
    fontLatin: LATIN,
    fontEastAsia: 'SimSun',
    rtl: true,
  },
}

const SECTION_ORDER = ['single_choice', 'multi_choice', 'fill_blank', 'true_false', 'short_answer']

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => String(vars[key] ?? ''))
}

function fillPlural(
  text: PluralText,
  n: number,
  dateLocale: string,
  vars: Record<string, string | number> = {},
): string {
  let category = 'other'
  try {
    category = new Intl.PluralRules(dateLocale).select(n)
  } catch {
    // 老 WebView 不支持时回落 other
  }
  const byCategory: Record<string, string | undefined> = {
    zero: text.zero,
    one: text.one,
    two: text.two,
    few: text.few,
    many: text.many,
    other: text.other,
  }
  const template = byCategory[category] ?? text.other
  return fill(template, { ...vars, n })
}

/** XML 文本转义,并剔除 XML 1.0 不允许的控制字符 */
function escXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || 'exameow_paper'
}

interface RunOpts {
  bold?: boolean
  color?: string
  /** 半磅值(half-points):24 = 12pt */
  size?: number
}

function run(text: string, opts: RunOpts = {}, rtl = false): string {
  const rPr: string[] = []
  if (opts.bold) rPr.push('<w:b/>')
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`)
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`)
  if (rtl) rPr.push('<w:rtl/>')
  const rPrXml = rPr.length > 0 ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''
  // 换行在 OOXML 里是 run 内部的 <w:br/>,不能直接放 \n
  const inner = text
    .split(/\r?\n/)
    .map((line, i) => `${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escXml(line)}</w:t>`)
    .join('')
  return `<w:r>${rPrXml}${inner}</w:r>`
}

interface ParaOpts {
  style?: string
  align?: 'center' | 'left' | 'right' | 'both'
  /** 左缩进(twips):1em(12pt) = 240 */
  indent?: number
  spacingBefore?: number
  spacingAfter?: number
  rtl?: boolean
}

function para(inner: string, opts: ParaOpts = {}): string {
  // pPr 子元素顺序受 OOXML schema 约束:pStyle → bidi → spacing → ind → jc
  const pPr: string[] = []
  if (opts.style) pPr.push(`<w:pStyle w:val="${opts.style}"/>`)
  if (opts.rtl) pPr.push('<w:bidi/>')
  if (opts.spacingBefore !== undefined || opts.spacingAfter !== undefined) {
    const before = opts.spacingBefore !== undefined ? ` w:before="${opts.spacingBefore}"` : ''
    const after = opts.spacingAfter !== undefined ? ` w:after="${opts.spacingAfter}"` : ''
    pPr.push(`<w:spacing${before}${after}/>`)
  }
  if (opts.indent) pPr.push(`<w:ind w:left="${opts.indent}"/>`)
  if (opts.align) pPr.push(`<w:jc w:val="${opts.align}"/>`)
  const pPrXml = pPr.length > 0 ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''
  return `<w:p>${pPrXml}${inner}</w:p>`
}

function buildStylesXml(copy: WordCopy): string {
  const eastAsia = escXml(copy.fontEastAsia)
  const latin = escXml(copy.fontLatin)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="${latin}" w:hAnsi="${latin}" w:eastAsia="${eastAsia}" w:cs="${latin}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="DocTitle"><w:name w:val="Document Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:rPr><w:rFonts w:ascii="${LATIN_HEAD}" w:hAnsi="${LATIN_HEAD}" w:eastAsia="${eastAsia}"/><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="DocSubtitle"><w:name w:val="Document Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="280" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="333333"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="SectionHead"><w:name w:val="Section Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="280" w:after="120"/><w:keepNext/></w:pPr><w:rPr><w:rFonts w:ascii="${LATIN_HEAD}" w:hAnsi="${LATIN_HEAD}" w:eastAsia="${eastAsia}"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Analysis"><w:name w:val="Analysis"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="333333"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
</w:styles>`
}

function buildInfoTableXml(copy: WordCopy, rtl: boolean): string {
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`
  const cell = (text: string, width: number) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${para(run(text, {}, rtl))}</w:tc>`
  const blank = (width: number) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${para(run('', {}, rtl))}</w:tc>`

  const grid = [1000, 1182, 1000, 1182, 1000, 1182, 1000, 1182]
  const cells = [
    cell(copy.info.name, grid[0]!),
    blank(grid[1]!),
    cell(copy.info.department, grid[2]!),
    blank(grid[3]!),
    cell(copy.info.date, grid[4]!),
    blank(grid[5]!),
    cell(copy.info.score, grid[6]!),
    blank(grid[7]!),
  ].join('')

  const sides = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${sides.map(border).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr>${cells}</w:tr></w:tbl>`
}

function formatDate(copy: WordCopy): string {
  try {
    return new Intl.DateTimeFormat(copy.dateLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function typeSummary(questions: Question[], copy: WordCopy, labels: ExportLabels): string {
  const counts: Record<string, number> = {}
  for (const q of questions) counts[q.type] = (counts[q.type] ?? 0) + 1
  return SECTION_ORDER.filter((t) => counts[t])
    .map((t) => fill(copy.typeCount, { type: labels.types[t] ?? t, n: counts[t]! }))
    .join(' · ')
}

function buildBodyXml(
  questions: Question[],
  copy: WordCopy,
  labels: ExportLabels,
  withAnswers: boolean,
): string {
  const rtl = copy.rtl
  const groups = new Map<string, Question[]>()
  for (const t of SECTION_ORDER) groups.set(t, [])
  for (const q of questions) {
    if (!groups.has(q.type)) groups.set(q.type, [])
    groups.get(q.type)!.push(q)
  }

  const blocks: string[] = []
  let num = 0

  for (let si = 0; si < SECTION_ORDER.length; si++) {
    const t = SECTION_ORDER[si]!
    const qs = groups.get(t) ?? []
    if (qs.length === 0) continue

    const scores = new Set(qs.map((q) => q.score).filter((s): s is number => typeof s === 'number' && s > 0))
    const scoreNote =
      scores.size === 1 ? fillPlural(copy.perScore, [...scores][0]!, copy.dateLocale) : ''
    const index = copy.sectionIndex[si] ?? String(si + 1)
    const countNote = fillPlural(copy.sectionCount, qs.length, copy.dateLocale)
    const heading = `${index}${copy.sectionSep}${labels.types[t] ?? t}${scoreNote}${countNote}`
    blocks.push(para(run(heading, { bold: true }, rtl), { style: 'SectionHead', rtl }))

    for (const q of qs) {
      num += 1
      blocks.push(
        para(run(`${num}. `, { bold: true }, rtl) + run(q.stem, {}, rtl), {
          spacingBefore: 160,
          spacingAfter: 40,
          rtl,
        }),
      )
      if (q.options && q.options.length > 0) {
        for (let i = 0; i < q.options.length; i++) {
          const letter = OPTION_LETTERS[i] ?? String(i + 1)
          blocks.push(
            para(run(`${letter}. ${stripOptionLabel(q.options[i] ?? '')}`, {}, rtl), {
              indent: 384,
              spacingAfter: 20,
              rtl,
            }),
          )
        }
      }
      if (withAnswers) {
        blocks.push(
          para(run(copy.answer, { bold: true }, rtl) + run(q.answer, {}, rtl), {
            indent: 288,
            spacingBefore: 40,
            rtl,
          }),
        )
        if (q.analysis) {
          blocks.push(
            para(run(copy.analysis, { bold: true }, rtl) + run(q.analysis, {}, rtl), {
              style: 'Analysis',
              indent: 288,
              rtl,
            }),
          )
        }
      }
    }
  }

  return blocks.join('')
}

function buildDocumentXml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${inner}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1361" w:right="1588" w:bottom="1361" w:left="1588" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

export interface WordFile {
  filename: string
  bytes: Uint8Array
}

function buildDocx(inner: string, copy: WordCopy): Uint8Array {
  const encoder = new TextEncoder()
  return createZip([
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(DOCUMENT_RELS_XML) },
    { name: 'word/document.xml', data: encoder.encode(buildDocumentXml(inner)) },
    { name: 'word/styles.xml', data: encoder.encode(buildStylesXml(copy)) },
  ])
}

/**
 * 构建两份 Word 文档(不落盘),便于各平台自行决定保存方式
 */
export function buildWordFiles(title: string, questions: Question[], locale: Locale = 'zh'): WordFile[] {
  const copy = WORD_COPY[locale] ?? WORD_COPY.en
  const labels = EXPORT_LABELS[locale] ?? EXPORT_LABELS.en
  const rtl = copy.rtl
  const base = sanitizeFilename(title) || 'exameow_paper'
  const summary = typeSummary(questions, copy, labels)
  const date = formatDate(copy)

  const heading = (suffix: string) =>
    para(run(title, {}, rtl), { style: 'DocTitle', rtl }) +
    para(
      run(
        `(${suffix})  ${fillPlural(copy.totalCount, questions.length, copy.dateLocale)}  ·  ${summary}  ·  ${date}`,
        {},
        rtl,
      ),
      { style: 'DocSubtitle', rtl },
    )

  const paperInner =
    heading(copy.paperSuffix) +
    buildInfoTableXml(copy, rtl) +
    para('', { spacingAfter: 120 }) +
    buildBodyXml(questions, copy, labels, false)

  const keyInner = heading(copy.keySuffix) + buildBodyXml(questions, copy, labels, true)

  return [
    { filename: `${base}_${copy.paperSuffix}.docx`, bytes: buildDocx(paperInner, copy) },
    { filename: `${base}_${copy.keySuffix}.docx`, bytes: buildDocx(keyInner, copy) },
  ]
}
