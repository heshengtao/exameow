import { QuestionType, type Question, type QuestionBank } from '@exameow/shared'
import { publishExam } from '@/api/relay'
import { countQuestionImages, relaySupportsMedia } from '@/utils/capabilities'
import { collectRelayImages } from '@/utils/relayMedia'
import { usePublishedStore } from '@/stores/published'

export const EXAM_TYPE_ORDER: QuestionType[] = [
  QuestionType.SingleChoice,
  QuestionType.MultiChoice,
  QuestionType.TrueFalse,
  QuestionType.FillBlank,
  QuestionType.ShortAnswer,
]

export class ExamPublishError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ExamPublishError'
    this.code = code
  }
}

export interface PublishExamInput {
  title: string
  questions: Question[]
  startAt: number
  durationMinutes: number
}

export interface PublishExamOutput {
  code: string
  manageUrl: string
  adminToken: string
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]!
    copy[i] = copy[j]!
    copy[j] = temp
  }
  return copy
}

/** Picks questions from one or more banks, honouring per-type counts and points. */
export function composeExamQuestions(
  banks: QuestionBank[],
  counts: Record<string, number>,
  points: Record<string, number> = {},
): Question[] {
  const picked: Question[] = []
  for (const type of EXAM_TYPE_ORDER) {
    const wanted = Math.max(0, counts[type] ?? 0)
    if (wanted <= 0) continue
    const pool = banks.flatMap(bank => bank.questions.filter(q => q.type === type))
    const score = Math.max(1, points[type] ?? 1)
    picked.push(...shuffle(pool).slice(0, wanted).map(q => ({ ...q, score })))
  }
  return picked.map((q, index) => ({ ...q, id: `q${index + 1}` }))
}

export function useExamPublish() {
  const publishedStore = usePublishedStore()

  async function publish(input: PublishExamInput): Promise<PublishExamOutput> {
    const title = input.title.trim()
    if (!title) throw new ExamPublishError('title_required', 'A title is required')
    if (!input.questions.length) throw new ExamPublishError('no_questions', 'No questions to publish')
    if (!(input.durationMinutes > 0)) {
      throw new ExamPublishError('invalid_window', 'Duration must be positive')
    }
    const startAt = Number.isFinite(input.startAt) && input.startAt > 0 ? input.startAt : Date.now()
    const endAt = startAt + input.durationMinutes * 60_000

    const imageCount = countQuestionImages(input.questions)
    if (imageCount > 0 && !relaySupportsMedia()) {
      throw new ExamPublishError(
        'media_unsupported',
        'Online exams on this platform do not support images',
      )
    }
    const images = imageCount > 0 ? await collectRelayImages(input.questions) : undefined

    const response = await publishExam({
      title,
      questions: input.questions,
      startAt,
      endAt,
      durationMinutes: input.durationMinutes,
      images,
    })
    publishedStore.add({
      code: response.code,
      title,
      manageUrl: response.manageUrl,
      publishedAt: Date.now(),
    })
    return {
      code: response.code,
      manageUrl: response.manageUrl,
      adminToken: response.adminToken,
    }
  }

  return { publish }
}
