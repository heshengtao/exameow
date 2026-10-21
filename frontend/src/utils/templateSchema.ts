import type { Locale } from '@/i18n/locales'

export interface TemplateHeaders {
  stem: string
  type: string
  /** Options A–H. */
  options: string[]
  answer: string
  analysis: string
  subject: string
  chapter: string
  difficulty: string
  stemImage: string
  /** Option image columns A–H. */
  optionImages: string[]
}

export interface TemplateSample {
  typeValue: string
  stem: string
  optionA: string
  optionB: string
  analysis: string
  chapter: string
}

export interface TemplateCopy {
  headers: TemplateHeaders
  sample: TemplateSample
}

export function normalizeHeaderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, '')
}

function optionHeaders(prefix: string, suffix: string): string[] {
  return Array.from({ length: 8 }, (_, i) => `${prefix}${String.fromCharCode(65 + i)}${suffix}`)
}

/**
 * Single source of truth for XLSX template headers. The importer derives its
 * header aliases from these values, so any template we generate always imports.
 */
export const TEMPLATE_COPY: Record<Locale, TemplateCopy> = {
  zh: {
    headers: {
      stem: '题干',
      type: '题型',
      options: optionHeaders('选项', ''),
      answer: '正确答案',
      analysis: '解析',
      subject: '学科',
      chapter: '章节',
      difficulty: '难度',
      stemImage: '题干图',
      optionImages: optionHeaders('选项', '图'),
    },
    sample: {
      typeValue: '单选题',
      stem: 'Exameow 的 AI 接口协议是什么类型？',
      optionA: 'OpenAI 兼容 API',
      optionB: 'WebSocket',
      analysis: 'Exameow 兼容所有 OpenAI 格式的 API，支持对接任何 OpenAI 兼容的服务商。',
      chapter: '第一章 基础',
    },
  },
  'zh-TW': {
    headers: {
      stem: '題幹',
      type: '題型',
      options: optionHeaders('選項', ''),
      answer: '正確答案',
      analysis: '解析',
      subject: '學科',
      chapter: '章節',
      difficulty: '難度',
      stemImage: '題幹圖',
      optionImages: optionHeaders('選項', '圖'),
    },
    sample: {
      typeValue: '單選題',
      stem: 'Exameow 的 AI 介面協定是什麼類型？',
      optionA: 'OpenAI 相容 API',
      optionB: 'WebSocket',
      analysis: 'Exameow 相容所有 OpenAI 格式的 API，支援對接任何 OpenAI 相容的服務商。',
      chapter: '第一章 基礎',
    },
  },
  en: {
    headers: {
      stem: 'Question',
      type: 'Type',
      options: optionHeaders('Option ', ''),
      answer: 'Answer',
      analysis: 'Analysis',
      subject: 'Subject',
      chapter: 'Chapter',
      difficulty: 'Difficulty',
      stemImage: 'Stem image',
      optionImages: optionHeaders('Option ', ' image'),
    },
    sample: {
      typeValue: 'Single Choice',
      stem: 'What type of AI API protocol does Exameow use?',
      optionA: 'OpenAI-compatible API',
      optionB: 'WebSocket',
      analysis: 'Exameow works with any OpenAI-compatible API provider.',
      chapter: 'Chapter 1 Basics',
    },
  },
  ja: {
    headers: {
      stem: '問題文',
      type: '問題形式',
      options: optionHeaders('選択肢', ''),
      answer: '正解',
      analysis: '解説',
      subject: '科目',
      chapter: '章',
      difficulty: '難易度',
      stemImage: '問題文の画像',
      optionImages: optionHeaders('選択肢', 'の画像'),
    },
    sample: {
      typeValue: '単一選択',
      stem: 'Exameow が利用する AI API のプロトコルはどれですか？',
      optionA: 'OpenAI 互換 API',
      optionB: 'WebSocket',
      analysis: 'Exameow は OpenAI 形式の API に対応しています。',
      chapter: '第1章 基礎',
    },
  },
  ko: {
    headers: {
      stem: '문제',
      type: '유형',
      options: optionHeaders('보기 ', ''),
      answer: '정답',
      analysis: '해설',
      subject: '과목',
      chapter: '단원',
      difficulty: '난이도',
      stemImage: '문제 이미지',
      optionImages: optionHeaders('보기 ', ' 이미지'),
    },
    sample: {
      typeValue: '단일 선택',
      stem: 'Exameow가 사용하는 AI API 프로토콜은 무엇인가요?',
      optionA: 'OpenAI 호환 API',
      optionB: 'WebSocket',
      analysis: 'Exameow는 모든 OpenAI 호환 API와 함께 동작합니다.',
      chapter: '1장 기초',
    },
  },
  es: {
    headers: {
      stem: 'Enunciado',
      type: 'Tipo',
      options: optionHeaders('Opción ', ''),
      answer: 'Respuesta',
      analysis: 'Análisis',
      subject: 'Materia',
      chapter: 'Capítulo',
      difficulty: 'Dificultad',
      stemImage: 'Imagen del enunciado',
      optionImages: optionHeaders('Imagen de la opción ', ''),
    },
    sample: {
      typeValue: 'Opción única',
      stem: '¿Qué tipo de protocolo de API de IA usa Exameow?',
      optionA: 'API compatible con OpenAI',
      optionB: 'WebSocket',
      analysis: 'Exameow funciona con cualquier proveedor de API compatible con OpenAI.',
      chapter: 'Capítulo 1: Fundamentos',
    },
  },
  fr: {
    headers: {
      stem: 'Énoncé',
      type: 'Type',
      options: optionHeaders('Option ', ''),
      answer: 'Réponse',
      analysis: 'Analyse',
      subject: 'Matière',
      chapter: 'Chapitre',
      difficulty: 'Difficulté',
      stemImage: 'Image de l’énoncé',
      optionImages: optionHeaders('Image de l’option ', ''),
    },
    sample: {
      typeValue: 'Choix unique',
      stem: 'Quel type de protocole d’API IA Exameow utilise-t-il ?',
      optionA: 'API compatible OpenAI',
      optionB: 'WebSocket',
      analysis: 'Exameow fonctionne avec tout fournisseur d’API compatible OpenAI.',
      chapter: 'Chapitre 1 : Bases',
    },
  },
  de: {
    headers: {
      stem: 'Frage',
      type: 'Typ',
      options: optionHeaders('Option ', ''),
      answer: 'Antwort',
      analysis: 'Analyse',
      subject: 'Fach',
      chapter: 'Kapitel',
      difficulty: 'Schwierigkeit',
      stemImage: 'Fragebild',
      optionImages: optionHeaders('Bild zu Option ', ''),
    },
    sample: {
      typeValue: 'Einzelauswahl',
      stem: 'Welches KI-API-Protokoll verwendet Exameow?',
      optionA: 'OpenAI-kompatible API',
      optionB: 'WebSocket',
      analysis: 'Exameow funktioniert mit jedem OpenAI-kompatiblen API-Anbieter.',
      chapter: 'Kapitel 1: Grundlagen',
    },
  },
  ru: {
    headers: {
      stem: 'Вопрос',
      type: 'Тип',
      options: optionHeaders('Вариант ', ''),
      answer: 'Ответ',
      analysis: 'Разбор',
      subject: 'Предмет',
      chapter: 'Глава',
      difficulty: 'Сложность',
      stemImage: 'Изображение вопроса',
      optionImages: optionHeaders('Изображение варианта ', ''),
    },
    sample: {
      typeValue: 'Одиночный выбор',
      stem: 'Какой тип протокола AI API использует Exameow?',
      optionA: 'API, совместимый с OpenAI',
      optionB: 'WebSocket',
      analysis: 'Exameow работает с любым API-провайдером, совместимым с OpenAI.',
      chapter: 'Глава 1. Основы',
    },
  },
  ar: {
    headers: {
      stem: 'نص السؤال',
      type: 'النوع',
      options: optionHeaders('الخيار ', ''),
      answer: 'الإجابة',
      analysis: 'التحليل',
      subject: 'المادة',
      chapter: 'الفصل',
      difficulty: 'الصعوبة',
      stemImage: 'صورة السؤال',
      optionImages: optionHeaders('صورة الخيار ', ''),
    },
    sample: {
      typeValue: 'اختيار واحد',
      stem: 'ما نوع بروتوكول واجهة الذكاء الاصطناعي الذي يستخدمه Exameow؟',
      optionA: 'واجهة متوافقة مع OpenAI',
      optionB: 'WebSocket',
      analysis: 'يعمل Exameow مع أي مزود واجهة متوافق مع OpenAI.',
      chapter: 'الفصل الأول: الأساسيات',
    },
  },
}

export const TEMPLATE_LOCALES = Object.keys(TEMPLATE_COPY) as Locale[]
