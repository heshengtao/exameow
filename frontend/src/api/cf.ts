import type { AIConfig, AnswerResult, ChatMessage, ChatToolOptions, ExamParams, ExplainParams, ExplainResult, FetchResponse, JudgeParams, JudgeResult, ModelInfo, Question, SearchConfig, WebSearchResponse } from '@exameow/shared'
import { resolveAIOptions } from '@exameow/shared'
import { consumeChatSse, type ChatStreamHandlers } from '@/utils/chatStream'
import { fetchApiKeyOf, searchApiKeyOf } from '@/utils/searchConfig'
import { AVAILABLE_CF_MODELS } from './cf-models'
import { EXPORT_LABELS, exportHeaderRow, exportRow, exportXlsxHeaderRow } from '@/utils/exportLabels'
import type { Locale } from '@/i18n/locales'

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
    formData.append('options', JSON.stringify(resolveAIOptions(config)))

    const res = await fetch(`${getBaseUrl()}/api/generate`, {
      method: 'POST',
      body: formData,
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async exportCsv(questions: Question[], filename: string = 'exameow_questions.csv', locale: Locale = 'zh'): Promise<void> {
    const csvContent = generateCsvContent(questions, locale)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    downloadFile(url, filename)
  },

  async exportXlsx(questions: Question[], filename: string = 'exameow_questions.xlsx', locale: Locale = 'zh'): Promise<void> {
    const XLSX = await import('xlsx')
    const labels = EXPORT_LABELS[locale] ?? EXPORT_LABELS.zh
    const rows = questions.map((q) => exportRow(q, labels))
    const ws = XLSX.utils.aoa_to_sheet([exportXlsxHeaderRow(labels), ...rows])
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
      body: JSON.stringify({ question, language, model: config.model, options: resolveAIOptions(config) }),
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
        options: resolveAIOptions(config),
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
        options: resolveAIOptions(config),
        search_results: params.search_results ?? [],
      }),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async webSearch(config: SearchConfig, query: string, signal?: AbortSignal): Promise<WebSearchResponse> {
    const res = await fetch(`${getBaseUrl()}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: config.provider,
        api_key: searchApiKeyOf(config),
        query,
        max_results: config.max_results,
      }),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async fetchPages(
    config: SearchConfig,
    urls: string[],
    mode: 'extract' | 'crawl',
    signal?: AbortSignal,
  ): Promise<FetchResponse> {
    const res = await fetch(`${getBaseUrl()}/api/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: config.fetch_provider,
        api_key: fetchApiKeyOf(config),
        urls,
        mode,
        max_chars: config.max_content_chars,
        limit: config.crawl_limit,
      }),
      signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async chatStream(
    messages: ChatMessage[],
    config: AIConfig,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal,
    toolOptions?: ChatToolOptions | null,
  ): Promise<void> {
    let res: Response
    try {
      res = await fetch(`${getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          model: config.model,
          options: resolveAIOptions(config),
          ...(toolOptions ? { tools: toolOptions.names, tool_config: toolOptions.config } : {}),
        }),
        signal,
      })
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') throw error
      handlers.onError(error)
      return
    }
    if (!res.ok) {
      handlers.onError(new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`))
      return
    }
    if (!res.body) {
      handlers.onError(new Error('Server returned no response body'))
      return
    }
    await consumeChatSse(res.body, handlers, signal)
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

export function generateCsvContent(questions: Question[], locale: Locale = 'zh'): string {
  const labels = EXPORT_LABELS[locale] ?? EXPORT_LABELS.zh
  const csvRows = [exportHeaderRow(labels), ...questions.map((q) => exportRow(q, labels))].map((r) =>
    r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
  )
  return '\uFEFF' + csvRows.join('\n')
}

function downloadFile(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
