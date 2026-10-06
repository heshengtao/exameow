import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { resolveAIOptions, type ChatMessage, type Question } from '@exameow/shared'
import { api } from '@/api'
import { isCloudflare } from '@/utils/platform'
import { useConfigStore } from '@/stores/config'
import { useI18nStore, type Locale } from '@/stores/i18n'
import {
  buildTutorSystemPrompt,
  formatQuestionForDisplay,
  formatUserAnswerForDisplay,
} from '@/utils/learnPrompt'
import type { ChatStreamHandlers } from '@/utils/chatStream'

export type LearnEntry = 'explain' | 'answer'

export interface LearnMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  hidden?: boolean
  kind?: 'text' | 'question'
  streaming?: boolean
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
  return `learn-msg-${messageSeq}`
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

  function buildApiMessages(): ChatMessage[] {
    const question = currentQuestion.value
    if (!question) return []
    const history: ChatMessage[] = messages.value
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }))
    return [{ role: 'system', content: buildTutorSystemPrompt(question, languageName()) }, ...history]
  }

  function stop() {
    abortController?.abort()
    abortController = null
    streaming.value = false
  }

  /** Clear the whole conversation (per question) — the key to resetting model context. */
  function resetConversation() {
    stop()
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
    bankId.value = payload.bankId
    bankName.value = payload.bankName
    questions.value = payload.questions
    const maxIndex = Math.max(payload.questions.length - 1, 0)
    currentIndex.value = Math.min(Math.max(payload.index, 0), maxIndex)
    resetConversation()
    seed(payload.entry, payload.userAnswer)
  }

  function goTo(index: number) {
    if (index < 0 || index >= questions.value.length) return
    currentIndex.value = index
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

  async function streamAssistant() {
    if (!currentQuestion.value) return
    error.value = null
    streaming.value = true
    const controller = new AbortController()
    abortController = controller
    const signal = controller.signal

    // Build the payload BEFORE appending the empty assistant placeholder.
    const apiMessages = buildApiMessages()
    const assistantId = nextId()
    messages.value.push({ id: assistantId, role: 'assistant', content: '', streaming: true })
    // Read the element back through the reactive array so mutations are tracked.
    const assistant = messages.value[messages.value.length - 1]!

    const handlers: ChatStreamHandlers = {
      onDelta: (text) => {
        assistant.content += text
      },
      onDone: () => {
        assistant.streaming = false
        awaitingAnswer.value = false
      },
      onError: (e) => {
        assistant.streaming = false
        if ((e as { name?: string })?.name === 'AbortError') return
        if (!assistant.content.trim()) {
          messages.value = messages.value.filter((m) => m.id !== assistant.id)
        }
        error.value = e instanceof Error ? e.message : String(e)
      },
    }

    try {
      const config = configStore.getConfig()
      if (isCloudflare() && configStore.aiProvider === 'custom') {
        const { chatStreamDirect } = await import('@/utils/chatRequest')
        await chatStreamDirect(apiMessages, config, resolveAIOptions(config), handlers, signal)
      } else {
        await api.chatStream(apiMessages, config, handlers, signal)
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        assistant.streaming = false
        error.value = e instanceof Error ? e.message : String(e)
      }
    } finally {
      assistant.streaming = false
      if (abortController === controller) {
        abortController = null
        streaming.value = false
      }
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
    stop,
  }
})
