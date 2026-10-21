import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { resolveAIOptions, type AIConfig, type ChatMessage, type Question } from '@exameow/shared'
import { api } from '@/api'
import { isCloudflare } from '@/utils/platform'
import { useConfigStore } from '@/stores/config'
import { useI18nStore, type Locale } from '@/stores/i18n'
import {
  buildTutorSystemPrompt,
  formatQuestionForDisplay,
  formatUserAnswerForDisplay,
} from '@/utils/learnPrompt'
import { buildSearchQuery, formatSearchContext, searchWithCache } from '@/utils/webSearch'
import { runToolLoop } from '@/utils/toolLoop'
import {
  clearLearnConversation,
  learnCacheKey,
  loadLearnConversation,
  saveLearnConversation,
} from '@/utils/learnCache'
import type { ChatStreamHandlers, ChatToolEvent } from '@/utils/chatStream'

export type LearnEntry = 'explain' | 'answer'

export interface LearnMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  hidden?: boolean
  kind?: 'text' | 'question' | 'search' | 'tool'
  streaming?: boolean
  searchStatus?: 'searching' | 'done' | 'error'
  searchCount?: number
  toolId?: string
  toolName?: string
  toolStatus?: 'running' | 'done' | 'error'
  toolDetail?: string
  toolCount?: number
}

const LANGUAGE_NAMES: Record<Locale, string> = {
  zh: 'Chinese',
  'zh-TW': 'Traditional Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ru: 'Russian',
  ar: 'Arabic',
}

let messageSeq = 0
function nextId(): string {
  messageSeq += 1
  return `learn-msg-${Date.now().toString(36)}-${messageSeq}`
}

export interface LearnStartPayload {
  bankId: string
  bankName: string
  questions: Question[]
  index: number
  entry: LearnEntry
  /** The student's existing answer, carried over when jumping in from a question. */
  userAnswer?: string | null
}

export const useLearnStore = defineStore('learn', () => {
  const configStore = useConfigStore()

  const bankId = ref<string | null>(null)
  const bankName = ref('')
  const questions = ref<Question[]>([])
  const currentIndex = ref(0)
  const messages = ref<LearnMessage[]>([])
  const streaming = ref(false)
  const awaitingAnswer = ref(false)
  const error = ref<string | null>(null)

  // Composer toggles kept for the app session. Search follows the saved config
  // until the user flips it, so an already-configured setup keeps working.
  const searchToggle = ref<boolean | null>(null)
  const webSearchEnabled = computed({
    get: () => searchToggle.value ?? configStore.searchConfigured,
    set: (value: boolean) => {
      searchToggle.value = value
    },
  })
  const deepThinkingEnabled = ref(false)

  let abortController: AbortController | null = null

  const currentQuestion = computed(() => questions.value[currentIndex.value] ?? null)
  const total = computed(() => questions.value.length)
  const progress = computed(() => ({ current: currentIndex.value + 1, total: total.value }))
  const isFirst = computed(() => currentIndex.value === 0)
  const isLast = computed(() => currentIndex.value >= questions.value.length - 1)
  const hasSession = computed(() => questions.value.length > 0 && currentQuestion.value !== null)

  function languageName(): string {
    return LANGUAGE_NAMES[useI18nStore().locale] ?? 'English'
  }

  function buildApiMessages(searchContext?: string): ChatMessage[] {
    const question = currentQuestion.value
    if (!question) return []
    const history: ChatMessage[] = messages.value
      .filter(
        (m) =>
          m.kind !== 'search' &&
          m.kind !== 'tool' &&
          m.content.trim().length > 0,
      )
      .map((m) => ({ role: m.role, content: m.content }))
    let system = buildTutorSystemPrompt(question, languageName())
    if (searchContext) system += `\n\n${searchContext}`
    return [{ role: 'system', content: system }, ...history]
  }

  function currentCacheKey(): string | null {
    const question = currentQuestion.value
    if (!bankId.value || !question) return null
    return learnCacheKey(bankId.value, question.id)
  }

  function persistConversation() {
    const key = currentCacheKey()
    const question = currentQuestion.value
    if (!key || !question) return
    saveLearnConversation(key, question.stem, messages.value)
  }

  function restoreConversation(): boolean {
    const key = currentCacheKey()
    const question = currentQuestion.value
    if (!key || !question) return false
    const cached = loadLearnConversation(key, question.stem)
    if (!cached) return false
    messages.value = cached
    const last = cached[cached.length - 1]
    awaitingAnswer.value = last?.kind === 'question'
    return true
  }

  function cancelStream() {
    abortController?.abort()
    abortController = null
    streaming.value = false
  }

  /** User-initiated stop keeps the partial answer in the conversation cache. */
  function stop() {
    const wasStreaming = streaming.value
    cancelStream()
    if (wasStreaming) persistConversation()
  }

  /** Clear the whole conversation (per question) — the key to resetting model context. */
  function resetConversation() {
    cancelStream()
    messages.value = []
    error.value = null
    awaitingAnswer.value = false
  }

  function seed(entry: LearnEntry, userAnswer?: string | null) {
    const question = currentQuestion.value
    if (!question) return
    if (entry === 'explain') {
      // Keep the context the student already has: the original question, then
      // their own answer, then the tutor's explanation.
      messages.value.push({
        id: nextId(),
        role: 'assistant',
        kind: 'question',
        content: formatQuestionForDisplay(question),
      })
      const answer = userAnswer?.trim()
      if (answer) {
        messages.value.push({
          id: nextId(),
          role: 'user',
          content: formatUserAnswerForDisplay(question, answer),
        })
      }
      messages.value.push({
        id: nextId(),
        role: 'user',
        hidden: true,
        content: answer
          ? 'Please evaluate my answer above and explain this question.'
          : 'Please explain this question.',
      })
      void streamAssistant()
    } else {
      messages.value.push({
        id: nextId(),
        role: 'assistant',
        kind: 'question',
        content: formatQuestionForDisplay(question),
      })
      awaitingAnswer.value = true
    }
  }

  function start(payload: LearnStartPayload) {
    persistConversation()
    bankId.value = payload.bankId
    bankName.value = payload.bankName
    questions.value = payload.questions
    const maxIndex = Math.max(payload.questions.length - 1, 0)
    currentIndex.value = Math.min(Math.max(payload.index, 0), maxIndex)
    resetConversation()
    if (!restoreConversation()) {
      seed(payload.entry, payload.userAnswer)
    }
  }

  function goTo(index: number) {
    if (index < 0 || index >= questions.value.length) return
    persistConversation()
    currentIndex.value = index
    resetConversation()
    if (!restoreConversation()) {
      seed('answer')
    }
  }

  function restart() {
    const key = currentCacheKey()
    if (key) clearLearnConversation(key)
    resetConversation()
    seed('answer')
  }

  function next() {
    if (!isLast.value) goTo(currentIndex.value + 1)
  }

  function prev() {
    if (!isFirst.value) goTo(currentIndex.value - 1)
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming.value) return
    if (!configStore.configured) {
      error.value = 'not-configured'
      return
    }
    messages.value.push({ id: nextId(), role: 'user', content: trimmed })
    awaitingAnswer.value = false
    await streamAssistant()
  }

  async function retry() {
    if (streaming.value || !currentQuestion.value) return
    await streamAssistant()
  }

  function lastVisibleUserText(): string | undefined {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const message = messages.value[i]
      if (!message || message.role !== 'user' || message.hidden || message.kind === 'search') continue
      const text = message.content.trim()
      if (text) return text
    }
    return undefined
  }

  /** Deep thinking overrides the saved reasoning effort for this message only. */
  function requestConfig(): AIConfig {
    const config = configStore.getConfig()
    if (!deepThinkingEnabled.value) return config
    const effort = config.reasoning_effort
    if (effort === 'high' || effort === 'xhigh' || effort === 'max') return config
    return { ...config, reasoning_effort: 'high' }
  }

  async function streamAssistant() {
    const question = currentQuestion.value
    if (!question) return
    error.value = null
    streaming.value = true
    const controller = new AbortController()
    abortController = controller
    const signal = controller.signal

    const finish = () => {
      if (abortController === controller) {
        abortController = null
        streaming.value = false
      }
    }

    let searchContext = ''
    const searchConfig = webSearchEnabled.value ? configStore.getSearchConfig() : null
    if (searchConfig) {
      const searchMessage: LearnMessage = {
        id: nextId(),
        role: 'assistant',
        kind: 'search',
        content: '',
        searchStatus: 'searching',
      }
      messages.value.push(searchMessage)
      const liveMessage = messages.value[messages.value.length - 1]!
      try {
        const query = buildSearchQuery(question, lastVisibleUserText())
        const results = await searchWithCache(searchConfig, query, signal)
        liveMessage.searchStatus = 'done'
        liveMessage.searchCount = results.length
        liveMessage.content = query
        searchContext = formatSearchContext(results)
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') {
          messages.value = messages.value.filter((m) => m.id !== liveMessage.id)
          finish()
          return
        }
        liveMessage.searchStatus = 'error'
        liveMessage.content = ''
      }
    }

    if (signal.aborted) {
      finish()
      return
    }

    // Build the payload BEFORE appending the empty assistant placeholder.
    const apiMessages = buildApiMessages(searchContext)
    const toolOptions = webSearchEnabled.value ? configStore.getToolOptions() : null
    const toolSettings = configStore.getSearchSettings()
    const assistantId = nextId()
    messages.value.push({ id: assistantId, role: 'assistant', content: '', streaming: true })
    // Read the element back through the reactive array so mutations are tracked.
    const assistant = messages.value[messages.value.length - 1]!

    const handleTool = (event: ChatToolEvent) => {
      const existing = messages.value.find(
        (message) => message.kind === 'tool' && message.toolId === event.id,
      )
      if (event.phase === 'start') {
        const chip: LearnMessage = {
          id: nextId(),
          role: 'assistant',
          kind: 'tool',
          content: event.detail || event.name || 'tool',
          toolId: event.id,
          toolName: event.name,
          toolStatus: 'running',
          toolDetail: event.detail,
        }
        const index = messages.value.findIndex((message) => message.id === assistantId)
        if (index >= 0) messages.value.splice(index, 0, chip)
        else messages.value.push(chip)
        return
      }
      if (existing) {
        existing.toolStatus = event.ok === false ? 'error' : 'done'
        existing.toolCount = event.count
        return
      }
      if (event.name === 'fallback') {
        const chip: LearnMessage = {
          id: nextId(),
          role: 'assistant',
          kind: 'tool',
          content: 'fallback',
          toolId: event.id,
          toolName: 'fallback',
          toolStatus: 'error',
        }
        const index = messages.value.findIndex((message) => message.id === assistantId)
        if (index >= 0) messages.value.splice(index, 0, chip)
        else messages.value.push(chip)
      }
    }

    const handlers: ChatStreamHandlers = {
      onDelta: (text) => {
        assistant.content += text
      },
      onDone: () => {
        assistant.streaming = false
        awaitingAnswer.value = false
        if (abortController === controller) persistConversation()
      },
      onError: (e) => {
        assistant.streaming = false
        if ((e as { name?: string })?.name === 'AbortError') return
        if (!assistant.content.trim()) {
          messages.value = messages.value.filter((m) => m.id !== assistant.id)
        }
        error.value = e instanceof Error ? e.message : String(e)
        if (abortController === controller) persistConversation()
      },
      onTool: handleTool,
    }

    try {
      const config = requestConfig()
      if (isCloudflare() && configStore.aiProvider === 'custom') {
        const options = resolveAIOptions(config)
        if (toolOptions) {
          await runToolLoop({
            messages: apiMessages,
            config,
            options,
            searchConfig: toolSettings,
            toolOptions,
            handlers,
            signal,
          })
        } else {
          const { chatStreamDirect } = await import('@/utils/chatRequest')
          await chatStreamDirect(apiMessages, config, options, handlers, signal)
        }
      } else {
        await api.chatStream(apiMessages, config, handlers, signal, toolOptions)
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        assistant.streaming = false
        error.value = e instanceof Error ? e.message : String(e)
        if (abortController === controller) persistConversation()
      }
    } finally {
      assistant.streaming = false
      finish()
    }
  }

  return {
    bankId,
    bankName,
    questions,
    currentIndex,
    messages,
    streaming,
    awaitingAnswer,
    error,
    webSearchEnabled,
    deepThinkingEnabled,
    currentQuestion,
    total,
    progress,
    isFirst,
    isLast,
    hasSession,
    start,
    goTo,
    next,
    prev,
    send,
    retry,
    restart,
    stop,
  }
})
