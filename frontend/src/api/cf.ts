import type { AIConfig, AnswerResult, ExamParams, ExplainParams, ExplainResult, JudgeParams, JudgeResult, ModelInfo, Question } from '@exameow/shared'
import { AVAILABLE_CF_MODELS } from './cf-models'

export interface GenerateResult {
  questions: Question[]
}

function getBaseUrl(): string {
  if (import.meta.env.VITE_CF_API_URL) {
    return import.meta.env.VITE_CF_API_URL
  }
  return ''
}

export const cfApi = {
  async getModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/models`)
      if (res.ok) return res.json()
    } catch {}
    return AVAILABLE_CF_MODELS.map((m) => ({ id: m.id }))
  },

  async generateExam(
    file: File,
    params: ExamParams,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<GenerateResult> {
    const formData = new FormData()
    if (!params.text) {
      formData.append('file', file)
    }
    formData.append('params', JSON.stringify(params))
    formData.append('model', config.model)

    const res = await fetch(`${getBaseUrl()}/api/generate`, {
      method: 'POST',
      body: formData,
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async exportCsv(questions: Question[], filename: string = 'exameow_questions.csv'): Promise<void> {
    const csvContent = generateCsvContent(questions)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    downloadFile(url, filename)
  },

  async exportXlsx(questions: Question[], filename: string = 'exameow_questions.xlsx'): Promise<void> {
    const XLSX = await import('xlsx')
    const data = questions.map((q) => ({
      '题干（必填）': q.stem,
      '题型 （必填）': typeLabel(q.type),
      '选项 A': q.options[0] || '',
      '选项 B': q.options[1] || '',
      '选项 C': q.options[2] || '',
      '选项 D': q.options[3] || '',
      '选项 E': q.options[4] || '',
      '选项 F': q.options[5] || '',
      '选项 G': q.options[6] || '',
      '选项 H': q.options[7] || '',
      '正确答案': q.answer,
      '解析': q.analysis,
      '学科': q.subject || '',
      '章节': q.chapter || '',
      '难度': q.difficulty || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    downloadFile(url, filename)
  },

  async answerQuestion(
    question: string,
    language: string,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<AnswerResult> {
    const res = await fetch(`${getBaseUrl()}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, language, model: config.model }),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async judgeAnswer(
    params: JudgeParams,
    language: string,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<JudgeResult> {
    const res = await fetch(`${getBaseUrl()}/api/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stem: params.stem,
        reference_answer: params.reference_answer,
        analysis: params.analysis,
        user_answer: params.user_answer,
        language,
        model: config.model,
      }),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async explainQuestion(
    params: ExplainParams,
    language: string,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<ExplainResult> {
    const res = await fetch(`${getBaseUrl()}/api/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stem: params.stem,
        reference_answer: params.reference_answer,
        analysis: params.analysis,
        language,
        model: config.model,
      }),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async saveConfig(config: AIConfig): Promise<void> {
    localStorage.setItem('exameow_cf_config', JSON.stringify(config))
  },

  async loadConfig(): Promise<AIConfig | null> {
    const stored = localStorage.getItem('exameow_cf_config')
    if (stored) return JSON.parse(stored)
    return {
      endpoint: '',
      api_key: '',
      model: AVAILABLE_CF_MODELS[0]?.id || '@cf/meta/llama-4-scout-17b-16e-instruct',
    }
  },
};

export function generateCsvContent(questions: Question[]): string {
  const typeLabels: Record<string, string> = {
    single_choice: '单选题', multi_choice: '多选题',
    true_false: '判断题', fill_blank: '填空题',
    short_answer: '简答题',
  }
  const headers = ['题干', '题型', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '选项G', '选项H', '正确答案', '解析', '学科', '章节', '难度']
  const rows = questions.map((q) => [
    q.stem,
    typeLabels[q.type] || q.type,
    q.options[0] || '',
    q.options[1] || '',
    q.options[2] || '',
    q.options[3] || '',
    q.options[4] || '',
    q.options[5] || '',
    q.options[6] || '',
    q.options[7] || '',
    q.answer,
    q.analysis,
    q.subject || '',
    q.chapter || '',
    q.difficulty || '',
  ])
  const csvRows = [headers, ...rows].map((r) =>
    r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
  )
  return '\uFEFF' + csvRows.join('\n')
}

function typeLabel(qtype: string): string {
  const map: Record<string, string> = {
    single_choice: '单选题', multi_choice: '多选题',
    true_false: '判断题', fill_blank: '填空题',
    short_answer: '简答题',
  }
  return map[qtype] || '简答题'
}

function downloadFile(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
