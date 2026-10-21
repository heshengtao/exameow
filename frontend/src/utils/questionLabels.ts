import { Difficulty, QuestionType } from '@exameow/shared'

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

const TYPE_HINTS: Record<QuestionType, string[]> = {
  [QuestionType.SingleChoice]: ['单选', '單選', 'single', '単一選択', '単一', '단일', 'única', 'unica', 'choixunique', 'einzelauswahl', 'одиночный', 'اختيارواحد'],
  [QuestionType.MultiChoice]: ['多选', '多選', '多项', 'multi', '複数', '복수', '다중', 'múltiple', 'multiple', 'mehrfach', 'множествен', 'متعدد'],
  [QuestionType.TrueFalse]: ['判断', '判斷', 'true', 'false', '对错', '對錯', '是非', '正誤', '참', '거짓', 'verdadero', 'falso', 'vrai', 'faux', 'wahr', 'falsch', 'верно', 'неверно', 'صح', 'خطأ'],
  [QuestionType.FillBlank]: ['填空', 'fill', 'blank', '穴埋め', '빈칸', 'completar', 'trous', 'lücke', 'пропуск', 'فراغ'],
  [QuestionType.ShortAnswer]: ['简答', '簡答', '问答', '問答', 'short', 'essay', '主观', '主觀', '記述', '서술', 'respuestacorta', 'réponsecourte', 'kurzantwort', 'краткий', 'إجابةقصيرة'],
}

const TYPE_ORDER: QuestionType[] = [
  QuestionType.TrueFalse,
  QuestionType.MultiChoice,
  QuestionType.SingleChoice,
  QuestionType.FillBlank,
  QuestionType.ShortAnswer,
]

/** Recognizes a question type label in any supported locale. */
export function normalizeQuestionTypeLabel(label: string): QuestionType | null {
  const value = normalizeLabel(label)
  if (!value) return null
  for (const type of TYPE_ORDER) {
    if (TYPE_HINTS[type].some((hint) => value.includes(hint))) return type
  }
  return null
}

/** Recognizes a difficulty label in any supported locale. */
export function normalizeDifficultyLabel(label: string): Difficulty | undefined {
  switch (normalizeLabel(label)) {
    case '简单':
    case '簡單':
    case 'easy':
    case '易':
    case '簡単':
    case '쉬움':
    case 'fácil':
    case 'facile':
    case 'leicht':
    case 'легко':
    case 'سهل':
      return Difficulty.Easy
    case '中等':
    case '适中':
    case '適中':
    case 'medium':
    case '中':
    case '普通':
    case '보통':
    case 'medio':
    case 'moyen':
    case 'mittel':
    case 'средне':
    case 'متوسط':
      return Difficulty.Medium
    case '困难':
    case '困難':
    case 'hard':
    case '难':
    case '難':
    case '難しい':
    case '어려움':
    case 'difícil':
    case 'difficile':
    case 'schwer':
    case 'сложно':
    case 'صعب':
      return Difficulty.Hard
    default:
      return undefined
  }
}
