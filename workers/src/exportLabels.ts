import type { Question } from './types'
export type Locale = 'zh' | 'zh-TW' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'ru' | 'ar'

/**
 * CSV / XLSX / Word 导出用词表(单一事实来源)。
 * headers 与「下载题库模板」的表头逐字一致 —— 导出的文件一定能被导入端识别。
 * 题型与难度用词必须命中 questionLabels.ts 的 TYPE_HINTS / normalizeDifficultyLabel,
 * 否则导出的表格无法回读。
 */

export interface ExportLabels {
  headers: {
    stem: string
    type: string
    /** '选项' / 'Option ' —— 拼上 A–H 得到选项列名 */
    optionPrefix: string
    answer: string
    analysis: string
    subject: string
    chapter: string
    difficulty: string
  }
  /** XLSX 表头后缀提示 */
  required: string
  keep: string
  types: Record<string, string>
  difficulties: Record<string, string>
}

export const EXPORT_LABELS: Record<Locale, ExportLabels> = {
  'zh': {
    headers: {
      stem: '题干',
      type: '题型',
      optionPrefix: '选项',
      answer: '正确答案',
      analysis: '解析',
      subject: '学科',
      chapter: '章节',
      difficulty: '难度',
    },
    required: '（必填）',
    keep: '（勿删）',
    types: {
      single_choice: '单选题',
      multi_choice: '多选题',
      true_false: '判断题',
      fill_blank: '填空题',
      short_answer: '简答题',
    },
    difficulties: {
      easy: '简单',
      medium: '中等',
      hard: '困难',
    },
  },
  'zh-TW': {
    headers: {
      stem: '題幹',
      type: '題型',
      optionPrefix: '選項',
      answer: '正確答案',
      analysis: '解析',
      subject: '學科',
      chapter: '章節',
      difficulty: '難度',
    },
    required: '（必填）',
    keep: '（勿刪）',
    types: {
      single_choice: '單選題',
      multi_choice: '多選題',
      true_false: '判斷題',
      fill_blank: '填空題',
      short_answer: '簡答題',
    },
    difficulties: {
      easy: '簡單',
      medium: '中等',
      hard: '困難',
    },
  },
  'en': {
    headers: {
      stem: 'Question',
      type: 'Type',
      optionPrefix: 'Option ',
      answer: 'Answer',
      analysis: 'Analysis',
      subject: 'Subject',
      chapter: 'Chapter',
      difficulty: 'Difficulty',
    },
    required: ' (required)',
    keep: ' (keep)',
    types: {
      single_choice: 'Single Choice',
      multi_choice: 'Multiple Choice',
      true_false: 'True or False',
      fill_blank: 'Fill in the Blank',
      short_answer: 'Short Answer',
    },
    difficulties: {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
    },
  },
  'ja': {
    headers: {
      stem: '問題文',
      type: '問題形式',
      optionPrefix: '選択肢',
      answer: '正解',
      analysis: '解説',
      subject: '科目',
      chapter: '章',
      difficulty: '難易度',
    },
    required: '（必須）',
    keep: '（削除不可）',
    types: {
      single_choice: '単一選択',
      multi_choice: '複数選択',
      true_false: '正誤問題',
      fill_blank: '穴埋め',
      short_answer: '記述問題',
    },
    difficulties: {
      easy: '簡単',
      medium: '普通',
      hard: '難しい',
    },
  },
  'ko': {
    headers: {
      stem: '문제',
      type: '유형',
      optionPrefix: '보기 ',
      answer: '정답',
      analysis: '해설',
      subject: '과목',
      chapter: '단원',
      difficulty: '난이도',
    },
    required: ' (필수)',
    keep: ' (삭제 금지)',
    types: {
      single_choice: '단일 선택',
      multi_choice: '복수 선택',
      true_false: '참·거짓',
      fill_blank: '빈칸 채우기',
      short_answer: '서술형',
    },
    difficulties: {
      easy: '쉬움',
      medium: '보통',
      hard: '어려움',
    },
  },
  'es': {
    headers: {
      stem: 'Enunciado',
      type: 'Tipo',
      optionPrefix: 'Opción ',
      answer: 'Respuesta',
      analysis: 'Análisis',
      subject: 'Materia',
      chapter: 'Capítulo',
      difficulty: 'Dificultad',
    },
    required: ' (obligatorio)',
    keep: ' (no borrar)',
    types: {
      single_choice: 'Opción única',
      multi_choice: 'Opción múltiple',
      true_false: 'Verdadero o falso',
      fill_blank: 'Completar el espacio',
      short_answer: 'Respuesta corta',
    },
    difficulties: {
      easy: 'Fácil',
      medium: 'Medio',
      hard: 'Difícil',
    },
  },
  'fr': {
    headers: {
      stem: 'Énoncé',
      type: 'Type',
      optionPrefix: 'Option ',
      answer: 'Réponse',
      analysis: 'Analyse',
      subject: 'Matière',
      chapter: 'Chapitre',
      difficulty: 'Difficulté',
    },
    required: ' (obligatoire)',
    keep: ' (ne pas supprimer)',
    types: {
      single_choice: 'Choix unique',
      multi_choice: 'Choix multiple',
      true_false: 'Vrai ou faux',
      fill_blank: 'Texte à trous',
      short_answer: 'Réponse courte',
    },
    difficulties: {
      easy: 'Facile',
      medium: 'Moyen',
      hard: 'Difficile',
    },
  },
  'de': {
    headers: {
      stem: 'Frage',
      type: 'Typ',
      optionPrefix: 'Option ',
      answer: 'Antwort',
      analysis: 'Analyse',
      subject: 'Fach',
      chapter: 'Kapitel',
      difficulty: 'Schwierigkeit',
    },
    required: ' (erforderlich)',
    keep: ' (nicht löschen)',
    types: {
      single_choice: 'Einzelauswahl',
      multi_choice: 'Mehrfachauswahl',
      true_false: 'Wahr oder falsch',
      fill_blank: 'Lückentext',
      short_answer: 'Kurzantwort',
    },
    difficulties: {
      easy: 'Leicht',
      medium: 'Mittel',
      hard: 'Schwer',
    },
  },
  'ru': {
    headers: {
      stem: 'Вопрос',
      type: 'Тип',
      optionPrefix: 'Вариант ',
      answer: 'Ответ',
      analysis: 'Разбор',
      subject: 'Предмет',
      chapter: 'Глава',
      difficulty: 'Сложность',
    },
    required: ' (обязательно)',
    keep: ' (не удалять)',
    types: {
      single_choice: 'Одиночный выбор',
      multi_choice: 'Множественный выбор',
      true_false: 'Верно или неверно',
      fill_blank: 'Заполнить пропуск',
      short_answer: 'Краткий ответ',
    },
    difficulties: {
      easy: 'Легко',
      medium: 'Средне',
      hard: 'Сложно',
    },
  },
  'ar': {
    headers: {
      stem: 'نص السؤال',
      type: 'النوع',
      optionPrefix: 'الخيار ',
      answer: 'الإجابة',
      analysis: 'التحليل',
      subject: 'المادة',
      chapter: 'الفصل',
      difficulty: 'الصعوبة',
    },
    required: ' (مطلوب)',
    keep: ' (لا تحذف)',
    types: {
      single_choice: 'اختيار واحد',
      multi_choice: 'اختيار متعدد',
      true_false: 'صح أو خطأ',
      fill_blank: 'إكمال الفراغ',
      short_answer: 'إجابة قصيرة',
    },
    difficulties: {
      easy: 'سهل',
      medium: 'متوسط',
      hard: 'صعب',
    },
  },
}

/** 完整 15 列表头:题干、题型、选项 A–H、正确答案、解析、学科、章节、难度 */
export function exportHeaderRow(labels: ExportLabels): string[] {
  const h = labels.headers
  return [
    h.stem,
    h.type,
    ...Array.from({ length: 8 }, (_, i) => `${h.optionPrefix}${String.fromCharCode(65 + i)}`),
    h.answer,
    h.analysis,
    h.subject,
    h.chapter,
    h.difficulty,
  ]
}

/** XLSX 表头(带必填/勿删提示),与 Rust 侧 export/xlsx.rs 保持一致 */
export function exportXlsxHeaderRow(labels: ExportLabels): string[] {
  const h = labels.headers
  const opt = (i: number) => `${h.optionPrefix}${String.fromCharCode(65 + i)}`
  return [
    `${h.stem}${labels.required}`,
    `${h.type}${labels.required}`,
    ...Array.from({ length: 8 }, (_, i) => opt(i)),
    `${h.answer}\n${labels.required}`,
    `${h.analysis}\n${labels.keep}`,
    h.subject,
    `${h.chapter}\n${labels.keep}`,
    h.difficulty,
  ]
}

/** 一行题目数据,列顺序与 exportHeaderRow 完全一致 */
export function exportRow(q: Question, labels: ExportLabels): string[] {
  return [
    q.stem,
    labels.types[q.type] ?? q.type,
    ...Array.from({ length: 8 }, (_, i) => q.options[i] ?? ''),
    q.answer,
    q.analysis,
    q.subject ?? '',
    q.chapter ?? '',
    q.difficulty ? (labels.difficulties[q.difficulty] ?? q.difficulty) : '',
  ]
}
