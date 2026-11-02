import type { AIConfig, AIRequestOptions, AnswerResult, ChatMessage, ChatToolOptions, ExamParams, ExplainParams, ExplainResult, FetchResponse, JudgeParams, JudgeResult, ModelInfo, Question, SearchConfig, WebSearchResponse } from '@exameow/shared'
import { resolveAIOptions } from '@exameow/shared'
import { consumeChatSse, type ChatStreamHandlers } from '@/utils/chatStream'
import { fetchApiKeyOf, searchApiKeyOf } from '@/utils/searchConfig'
import { EXPORT_LABELS, exportHeaderRow, exportRow } from '@/utils/exportLabels'
import type { Locale } from '@/i18n/locales'

const BASE_URL = import.meta.env.VITE_API_URL || ''

export interface GenerateResult {
  questions: Question[]
}

export interface ServerConfigInfo {
  has_env_ai: boolean
  endpoint: string
  model: string
}

export const httpApi = {
  async getModels(endpoint: string, apiKey: string): Promise<ModelInfo[]> {
    const url = `${BASE_URL}/api/models?endpoint=${encodeURIComponent(endpoint)}&api_key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return res.json()
  },

  async generateExam(
    file: File,
    params: ExamParams,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<GenerateResult> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('params', JSON.stringify(params))
    formData.append('endpoint', config.endpoint)
    formData.append('api_key', config.api_key)
    formData.append('model', config.model)
    formData.append('options', JSON.stringify(resolveAIOptions(config)))

    const res = await fetch(`${BASE_URL}/api/generate`, {
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
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  async exportXlsx(questions: Question[], filename: string = 'exameow_questions.xlsx', locale: Locale = 'zh'): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/export/xlsx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions, locale }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(objectUrl)
  },

  async answerQuestion(
    question: string,
    language: string,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<AnswerResult> {
    const res = await fetch(`${BASE_URL}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        language,
        endpoint: config.endpoint,
        api_key: config.api_key,
        model: config.model,
        options: resolveAIOptions(config),
      }),
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
    const res = await fetch(`${BASE_URL}/api/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stem: params.stem,
        reference_answer: params.reference_answer,
        analysis: params.analysis,
        user_answer: params.user_answer,
        language,
        endpoint: config.endpoint,
        api_key: config.api_key,
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
    const res = await fetch(`${BASE_URL}/api/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stem: params.stem,
        reference_answer: params.reference_answer,
        analysis: params.analysis,
        language,
        endpoint: config.endpoint,
        api_key: config.api_key,
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
    const res = await fetch(`${BASE_URL}/api/search`, {
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
    const res = await fetch(`${BASE_URL}/api/fetch`, {
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
      res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          endpoint: config.endpoint,
          api_key: config.api_key,
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
    const res = await fetch(`${BASE_URL}/api/config/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) {
      localStorage.setItem('exameow_config', JSON.stringify(config))
    }
  },

  async loadConfig(): Promise<AIConfig | null> {
    try {
      const res = await fetch(`${BASE_URL}/api/config/load`)
      if (res.ok) {
        const data = await res.json()
        return data
      }
    } catch {}
    const stored = localStorage.getItem('exameow_config')
    return stored ? JSON.parse(stored) : null
  },

  async getServerInfo(): Promise<ServerConfigInfo | null> {
    try {
      const res = await fetch(`${BASE_URL}/api/config/server`)
      if (res.ok) return await res.json()
    } catch {}
    return null
  },
};

export function generateCsvContent(questions: Question[], locale: Locale = 'zh'): string {
  const labels = EXPORT_LABELS[locale] ?? EXPORT_LABELS.zh
  const csvRows = [exportHeaderRow(labels), ...questions.map((q) => exportRow(q, labels))].map((r) =>
    r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
  )
  return '\uFEFF' + csvRows.join('\n')
}
