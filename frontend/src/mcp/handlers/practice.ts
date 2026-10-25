import type { PracticeMode } from '@exameow/shared'
import { useConfigStore } from '@/stores/config'
import { useI18nStore } from '@/stores/i18n'
import { usePracticeStore } from '@/stores/practice'
import { useWrongQuestionsStore } from '@/stores/wrongQuestions'
import { api } from '@/api'
import { McpToolError, registerMcpTool } from '../registry'
import { argNumber, argString, publicQuestion } from '../helpers'

const PRACTICE_MODES: PracticeMode[] = ['sequential', 'random', 'mock', 'wrong']

function normalizeTypeCounts(input: unknown): Record<string, number> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const entries = Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => [key, typeof value === 'number' ? Math.max(0, Math.round(value)) : 0] as const)
    .filter(([, value]) => value > 0)
  if (entries.length === 0) return null
  return Object.fromEntries(entries)
}

function sessionSummary() {
  const practice = usePracticeStore()
  const session = practice.session
  if (!session) {
    throw new McpToolError('no_session', 'No practice session is active. Call start_practice first.')
  }
  const item = practice.currentQuestion
  return {
    bank_id: session.bankId,
    mode: session.mode,
    index: session.currentIndex,
    total: session.questions.length,
    answered: practice.answeredCount,
    submitted: item?.submitted ?? false,
    finished_at: session.finishedAt,
    current_question: item ? publicQuestion(item.question) : null,
  }
}

export function registerPracticeTools(): void {
  registerMcpTool('start_practice', (args) => {
    const practice = usePracticeStore()
    const wrongStore = useWrongQuestionsStore()
    const bankId = argString(args, 'bank_id', true)!
    const bank = practice.getBank(bankId)
    if (!bank) throw new McpToolError('not_found', `bank \`${bankId}\` does not exist`)
    const mode = (argString(args, 'mode') ?? 'sequential') as PracticeMode
    if (!PRACTICE_MODES.includes(mode)) {
      throw new McpToolError('invalid_args', `mode must be one of ${PRACTICE_MODES.join(', ')}`)
    }

    let started = false
    if (mode === 'wrong') {
      const questions = wrongStore.getWrongQuestions(bankId, 'count-desc')
      if (questions.length === 0) {
        throw new McpToolError('no_questions', 'This bank has no wrong questions yet')
      }
      started = practice.startSession(bankId, 'wrong', undefined, questions)
    } else if (mode === 'mock') {
      const typeCounts = normalizeTypeCounts(args.type_counts)
      if (typeCounts) {
        started = practice.startSession(bankId, 'mock', { typeCounts })
      } else {
        const count = argNumber(args, 'count', bank.questions.length, 1, bank.questions.length)
        started = practice.startSession(bankId, 'mock', undefined, bank.questions.slice(0, count))
      }
    } else {
      started = practice.startSession(bankId, mode)
    }

    if (!started) {
      throw new McpToolError('no_questions', 'No questions are available for this practice mode')
    }
    return sessionSummary()
  })

  registerMcpTool('get_practice_state', () => sessionSummary())

  registerMcpTool('next_question', () => {
    const practice = usePracticeStore()
    const session = practice.session
    if (!session) {
      throw new McpToolError('no_session', 'No practice session is active. Call start_practice first.')
    }
    const atEnd = session.currentIndex >= session.questions.length - 1
    if (!atEnd) practice.nextQuestion()
    return { at_end: atEnd, ...sessionSummary() }
  })

  registerMcpTool('submit_answer', async (args) => {
    const practice = usePracticeStore()
    const session = practice.session
    if (!session) {
      throw new McpToolError('no_session', 'No practice session is active. Call start_practice first.')
    }
    const item = practice.currentQuestion
    if (!item) throw new McpToolError('no_session', 'The session has no current question')
    const typed = typeof args.answer === 'string' ? args.answer : String(args.answer ?? '')

    practice.setAnswer(typed)
    let correct = practice.submitAnswer(typed)

    if (correct === null && args.use_ai_judge === true) {
      const configStore = useConfigStore()
      if (!configStore.configured) {
        throw new McpToolError('ai_not_configured', 'Configure an AI model before using AI grading')
      }
      const i18n = useI18nStore()
      const language = i18n.locale === 'zh' || i18n.locale === 'zh-TW' ? 'Chinese' : 'English'
      const judged = await api.judgeAnswer(
        {
          stem: item.question.stem,
          reference_answer: item.question.answer,
          analysis: item.question.analysis || undefined,
          user_answer: typed,
        },
        language,
        configStore.getConfig(),
      )
      practice.selfCheck(judged.correct)
      correct = judged.correct
      return {
        is_correct: correct,
        correct_answer: item.question.answer,
        analysis: item.question.analysis,
        feedback: judged.feedback,
        ...sessionSummary(),
      }
    }

    return {
      is_correct: correct,
      correct_answer: item.question.answer,
      analysis: item.question.analysis,
      ...sessionSummary(),
    }
  })

  registerMcpTool('finish_practice', () => {
    const practice = usePracticeStore()
    const session = practice.session
    if (!session) {
      throw new McpToolError('no_session', 'No practice session is active.')
    }
    practice.finishSession()
    const questions = session.questions
    return {
      bank_id: session.bankId,
      total: questions.length,
      answered: questions.filter(item => item.submitted).length,
      correct: questions.filter(item => item.isCorrect === true).length,
      wrong: questions.filter(item => item.isCorrect === false).length,
      pending: questions.filter(item => item.submitted && item.isCorrect === null).length,
      duration_sec: practice.getElapsedTime(),
    }
  })

  registerMcpTool('list_wrong_questions', (args) => {
    const practice = usePracticeStore()
    const wrongStore = useWrongQuestionsStore()
    const limit = argNumber(args, 'limit', 50, 1, 500)
    const onlyBank = argString(args, 'bank_id')
    const groups = onlyBank
      ? [{ bankId: onlyBank, entries: Object.values(wrongStore.getBankEntryMap(onlyBank)) }]
      : wrongStore.getAllWrongBanks()

    const results: {
      bank_id: string
      bank_name: string
      question_id: string
      wrong_count: number
      consecutive_correct: number
      last_wrong_at: number
      stem: string
    }[] = []

    for (const group of groups) {
      const bank = practice.getBank(group.bankId)
      if (!bank) continue
      for (const entry of group.entries) {
        const question = bank.questions.find(item => item.id === entry.questionId)
        if (!question) continue
        results.push({
          bank_id: bank.id,
          bank_name: bank.name,
          question_id: entry.questionId,
          wrong_count: entry.wrongCount,
          consecutive_correct: entry.consecutiveCorrect,
          last_wrong_at: entry.lastWrongAt,
          stem: question.stem,
        })
        if (results.length >= limit) return { results, truncated: true }
      }
    }
    return { results, truncated: false }
  })
}
