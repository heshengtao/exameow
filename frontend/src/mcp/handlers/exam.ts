import type { Question, QuestionBank } from '@exameow/shared'
import { deleteExam, fetchResults } from '@/api/relay'
import { usePracticeStore } from '@/stores/practice'
import { composeExamQuestions, useExamPublish } from '@/composables/useExamPublish'
import { McpToolError, registerMcpTool } from '../registry'
import { argNumber, argString, normalizeQuestions } from '../helpers'

function normalizePoints(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const entries = Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => [key, typeof value === 'number' && value > 0 ? value : 1] as const)
  return Object.fromEntries(entries)
}

export function registerExamTools(): void {
  registerMcpTool('publish_exam', async (args) => {
    const practice = usePracticeStore()
    const title = argString(args, 'title', true)!
    const durationMinutes = argNumber(args, 'duration_minutes', 60, 1, 7 * 24 * 60)
    const startAt = typeof args.start_at === 'number' && args.start_at > 0 ? args.start_at : Date.now()

    let questions: Question[] = []
    if (Array.isArray(args.questions) && args.questions.length > 0) {
      questions = normalizeQuestions(args.questions)
    } else {
      const bankIds: string[] = Array.isArray(args.bank_ids) ? args.bank_ids.map(String) : []
      const banks = bankIds
        .map(id => practice.getBank(id))
        .filter((bank): bank is QuestionBank => bank !== undefined)
      if (banks.length === 0) {
        throw new McpToolError('invalid_args', 'Pass `questions` or `bank_ids` with existing banks')
      }
      const typeCounts = args.type_counts
      if (typeCounts && typeof typeCounts === 'object' && !Array.isArray(typeCounts)) {
        const counts: Record<string, number> = {}
        for (const [key, value] of Object.entries(typeCounts as Record<string, unknown>)) {
          if (typeof value === 'number' && value > 0) counts[key] = Math.round(value)
        }
        questions = composeExamQuestions(banks, counts, normalizePoints(args.points))
      } else {
        questions = banks
          .flatMap(bank => bank.questions)
          .map((question, index) => ({ ...question, id: `q${index + 1}`, score: question.score ?? 1 }))
      }
    }

    if (questions.length === 0) {
      throw new McpToolError('no_questions', 'No questions were selected for publishing')
    }

    const { publish } = useExamPublish()
    const result = await publish({ title, questions, startAt, durationMinutes })
    return {
      code: result.code,
      manage_url: result.manageUrl,
      admin_token: result.adminToken,
      question_count: questions.length,
      start_at: startAt,
      end_at: startAt + durationMinutes * 60_000,
    }
  })

  registerMcpTool('get_exam_results', async (args) => {
    const code = argString(args, 'code', true)!
    const token = argString(args, 'token', true)!
    return await fetchResults(code, token)
  })

  registerMcpTool('delete_exam', async (args) => {
    const code = argString(args, 'code', true)!
    const token = argString(args, 'token', true)!
    if (args.confirm !== true) {
      throw new McpToolError(
        'confirm_required',
        'Deleting an exam also removes every submission. Pass confirm=true to proceed.',
      )
    }
    await deleteExam(code, token)
    return { ok: true, code }
  })
}
