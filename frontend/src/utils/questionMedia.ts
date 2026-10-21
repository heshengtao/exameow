import type { QuestionMedia } from '@exameow/shared'
import { TEMPLATE_COPY, normalizeHeaderKey } from '@/utils/templateSchema'

export interface MediaColumn {
  index: number
  target: 'stem' | 'option'
  optionIndex?: number
  header: string
}

/** Image columns follow the 15 text columns: stem, then options A–H. */
export const MEDIA_COLUMNS: MediaColumn[] = [
  { index: 15, target: 'stem', header: '题干图' },
  ...Array.from({ length: 8 }, (_, i) => ({
    index: 16 + i,
    target: 'option' as const,
    optionIndex: i,
    header: `选项${String.fromCharCode(65 + i)}图`,
  })),
]

export const FIRST_MEDIA_COLUMN = MEDIA_COLUMNS[0]!.index
export const LAST_MEDIA_COLUMN = MEDIA_COLUMNS[MEDIA_COLUMNS.length - 1]!.index

export function mediaColumnIndex(media: QuestionMedia): number {
  if (media.target === 'stem') return FIRST_MEDIA_COLUMN
  const optionIndex = Math.min(7, Math.max(0, media.optionIndex ?? 0))
  return FIRST_MEDIA_COLUMN + 1 + optionIndex
}

export function mediaIds(
  media: QuestionMedia[] | undefined,
  target: 'stem' | 'option',
  optionIndex?: number,
): string[] {
  if (!media) return []
  return media
    .filter((item) =>
      target === 'stem'
        ? item.target === 'stem'
        : item.target === 'option' && (item.optionIndex ?? 0) === (optionIndex ?? 0),
    )
    .map((item) => item.id)
}

export function allMediaIds(media: QuestionMedia[] | undefined): string[] {
  return media?.map((item) => item.id) ?? []
}

export function countMedia(questions: { media?: QuestionMedia[] }[]): number {
  return questions.reduce((sum, q) => sum + (q.media?.length ?? 0), 0)
}

export interface ImageColumnTarget {
  target: 'stem' | 'option'
  optionIndex?: number
}

type HeaderRole =
  | 'stem'
  | 'type'
  | 'answer'
  | 'analysis'
  | 'subject'
  | 'chapter'
  | 'difficulty'
  | 'option'
  | 'combinedOptions'
  | 'stemImage'
  | `optionImage:${number}`

const COPIES = Object.values(TEMPLATE_COPY)

const STEM_KEYS = new Set<string>(['题目', '题', 'stem', 'question', 'title', '内容', 'q'])
const TYPE_KEYS = new Set<string>(['类型', 'type', 'qt', '种类'])
const ANSWER_KEYS = new Set<string>(['答案', '正确', 'answer', 'ans', '标准', 'key'])
const ANALYSIS_KEYS = new Set<string>(['解析', '分析', 'analysis', 'explanation', '详解', '解释'])
const SUBJECT_KEYS = new Set<string>(['学科', '科目', '课程', 'subject', 'course', 'discipline'])
const CHAPTER_KEYS = new Set<string>(['章节', 'chapter', 'unit', '模块'])
const DIFFICULTY_KEYS = new Set<string>([
  '难度', '難度', '難易度', '难易度', 'difficulty', 'dificultad', 'difficulté',
  'schwierigkeit', 'сложность', 'مستوىالصعوبة', '난이도',
])
const COMBINED_OPTION_KEYS = new Set<string>([
  '选项', '選項', '所有选项', '全部选项', '选项内容', 'options', 'option',
  'optionscontent', 'choices', 'choice', '선택', '선택지', 'opciones', 'optionen',
  'варианты', 'الخيارات',
])
const STEM_IMAGE_KEYS = new Set<string>(['图片', '配图', 'image', 'images'])
const OPTION_KEYS = new Map<string, number>()
const OPTION_IMAGE_KEYS = new Map<string, number>()

for (const copy of COPIES) {
  const { headers } = copy
  STEM_KEYS.add(normalizeHeaderKey(headers.stem))
  TYPE_KEYS.add(normalizeHeaderKey(headers.type))
  ANSWER_KEYS.add(normalizeHeaderKey(headers.answer))
  ANALYSIS_KEYS.add(normalizeHeaderKey(headers.analysis))
  SUBJECT_KEYS.add(normalizeHeaderKey(headers.subject))
  CHAPTER_KEYS.add(normalizeHeaderKey(headers.chapter))
  DIFFICULTY_KEYS.add(normalizeHeaderKey(headers.difficulty))
  STEM_IMAGE_KEYS.add(normalizeHeaderKey(headers.stemImage))
  headers.options.forEach((header, index) => OPTION_KEYS.set(normalizeHeaderKey(header), index))
  headers.optionImages.forEach((header, index) => OPTION_IMAGE_KEYS.set(normalizeHeaderKey(header), index))
}

const OPTION_PATTERN = /(?:选项|選項|選択肢|보기|선택지|opción|option|variante|вариант|الخيار)([a-h])$/

/** Classifies an XLSX header (in any supported locale) to a column role. */
export function headerRole(header: string): HeaderRole | null {
  const key = normalizeHeaderKey(header).replace(/[（(][^）)]*[）)]/g, '')
  if (!key) return null

  if (STEM_IMAGE_KEYS.has(key)) return 'stemImage'
  const optionImage = OPTION_IMAGE_KEYS.get(key)
  if (optionImage !== undefined) return `optionImage:${optionImage}`

  if (STEM_KEYS.has(key)) return 'stem'
  if (TYPE_KEYS.has(key)) return 'type'
  if (ANSWER_KEYS.has(key)) return 'answer'
  if (ANALYSIS_KEYS.has(key)) return 'analysis'
  if (SUBJECT_KEYS.has(key)) return 'subject'
  if (CHAPTER_KEYS.has(key)) return 'chapter'
  if (DIFFICULTY_KEYS.has(key)) return 'difficulty'
  if (COMBINED_OPTION_KEYS.has(key)) return 'combinedOptions'

  if (/^[a-h]$/.test(key)) return 'option'
  if (OPTION_KEYS.has(key)) return 'option'
  if (OPTION_PATTERN.test(key)) return 'option'
  if (key.includes('选项') || key.includes('選項') || key.includes('option')) return 'option'
  return null
}

/**
 * Maps an XLSX image-column header to a field. Supports the canonical headers
 * written by the exporter in every supported locale.
 */
export function imageTargetForHeader(header: string): ImageColumnTarget | null {
  const role = headerRole(header)
  if (role === 'stemImage') return { target: 'stem' }
  if (typeof role === 'string' && role.startsWith('optionImage:')) {
    return { target: 'option', optionIndex: Number(role.split(':')[1]) }
  }
  return null
}

export function imageTargetForColumn(columnIndex: number): ImageColumnTarget {
  const column = MEDIA_COLUMNS.find((item) => item.index === columnIndex)
  if (!column) return { target: 'stem' }
  return column.target === 'stem'
    ? { target: 'stem' }
    : { target: 'option', optionIndex: column.optionIndex }
}
