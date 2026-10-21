import type {
  ExamResultEntry,
  ExamResultsResponse,
  GradedQuestion,
  PublicQuestion,
  PublishExamRequest,
  PublishExamResponse,
  PublishedExamInfo,
  Question,
  StoredExam,
  SubmitExamRequest,
  SubmitExamResponse,
} from './types'
import { MAX_ANSWERS_BYTES, MAX_EXAM_PAYLOAD_BYTES, MAX_EXAM_RESULTS, MAX_STUDENT_NAME_CHARS } from './types'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_QUESTIONS = 500
const MAX_PUBLISH_PER_DAY = 20
const REPORT_SUSPEND_THRESHOLD = 3
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  let code = ''
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return code
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function isExpired(exam: StoredExam): boolean {
  return Date.now() - exam.createdAt > MAX_AGE_MS
}

interface ExamRow {
  code: string
  title: string
  questions: string
  start_at: number
  end_at: number
  duration_minutes: number
  created_at: number
  admin_token_hash: string
  suspended: number
}

interface ResultRow {
  id: string
  code: string
  name: string
  answers: string
  score: number
  total_score: number
  correct_count: number
  total_count: number
  pending_count: number
  duration_sec: number
  submitted_at: number
  detail: string
}

export async function readExam(db: D1Database, code: string): Promise<StoredExam | null> {
  const row = await db.prepare('SELECT * FROM exams WHERE code = ?').bind(code).first<ExamRow>()
  if (!row) return null
  const exam: StoredExam = {
    title: row.title,
    questions: JSON.parse(row.questions) as Question[],
    startAt: row.start_at,
    endAt: row.end_at,
    durationMinutes: row.duration_minutes,
    createdAt: row.created_at,
    adminTokenHash: row.admin_token_hash,
    suspended: row.suspended,
  }
  if (isExpired(exam)) {
    await db.batch([
      db.prepare('DELETE FROM exams WHERE code = ?').bind(code),
      db.prepare('DELETE FROM results WHERE code = ?').bind(code),
    ])
    return null
  }
  return exam
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handlePublish(
  db: D1Database,
  body: unknown,
  origin: string,
  ip: string,
): Promise<Response> {
  const day = new Date().toISOString().slice(0, 10)
  const limitRow = await db
    .prepare('SELECT count FROM publish_limits WHERE ip = ? AND day = ?')
    .bind(ip, day)
    .first<{ count: number }>()
  if ((limitRow?.count ?? 0) >= MAX_PUBLISH_PER_DAY) {
    return json({ error: 'rate_limited' }, 429)
  }

  const req = body as Partial<PublishExamRequest>
  if (typeof req.title !== 'string') return json({ error: 'Title is required' }, 400)
  const title = req.title.trim()
  const questions = req.questions
  const { startAt, endAt, durationMinutes } = req

  if (!title) return json({ error: 'Title is required' }, 400)
  if (title.length > 200) return json({ error: 'Title is too long' }, 400)
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > MAX_QUESTIONS) {
    return json({ error: `Questions must be 1-${MAX_QUESTIONS}` }, 400)
  }
  if (
    typeof startAt !== 'number' ||
    typeof endAt !== 'number' ||
    typeof durationMinutes !== 'number' ||
    !(startAt < endAt) ||
    durationMinutes <= 0 ||
    endAt - startAt > MAX_WINDOW_MS
  ) {
    return json({ error: 'Invalid time window or duration' }, 400)
  }
  // Cloudflare has no media storage: strip image references (and any other
  // unexpected fields) so nothing image-related ever reaches D1.
  const sanitizedQuestions = questions.map((q) => ({
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: Array.isArray(q.options) ? q.options : [],
    answer: q.answer,
    analysis: typeof q.analysis === 'string' ? q.analysis : '',
    ...(typeof q.score === 'number' ? { score: q.score } : {}),
    ...(q.subject ? { subject: q.subject } : {}),
    ...(q.chapter ? { chapter: q.chapter } : {}),
    ...(q.difficulty ? { difficulty: q.difficulty } : {}),
  }))
  const payload = JSON.stringify(sanitizedQuestions)
  if (payload.length > MAX_EXAM_PAYLOAD_BYTES) {
    return json({ error: 'Payload too large' }, 400)
  }

  let code = generateCode()
  for (let i = 0; i < 5; i++) {
    const existing = await db.prepare('SELECT code FROM exams WHERE code = ?').bind(code).first()
    if (!existing) break
    code = generateCode()
  }

  const adminToken = randomToken()
  const adminTokenHash = await sha256Hex(adminToken)
  await db.batch([
    db
      .prepare(
        'INSERT INTO exams (code, title, questions, start_at, end_at, duration_minutes, created_at, admin_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(code, title, payload, startAt, endAt, durationMinutes, Date.now(), adminTokenHash),
    db
      .prepare(
        'INSERT INTO publish_limits (ip, day, count) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET count = count + 1',
      )
      .bind(ip, day),
  ])

  const res: PublishExamResponse = {
    code,
    adminToken,
    manageUrl: `${origin}/#/manage/${code}?token=${adminToken}`,
  }
  return json(res)
}

function normalizeChoice(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-H]/g, '').split('').sort().join('')
}

function isTrueAnswer(a: string): boolean {
  const t = a.trim()
  return ['A', '√', '对', '正确', 'TRUE', 'T', '是', 'YES', 'Y', '1'].some(
    (v) =>
      t.toUpperCase() === v.toUpperCase() ||
      (v.length > 1 && t.includes(v) && !/[不非错没]/.test(t.replace(v, ''))),
  )
}

function grade(q: Question, user: string | undefined): boolean | null {
  if (q.type === 'short_answer') return null
  if (!user || !user.trim()) return false
  switch (q.type) {
    case 'single_choice':
    case 'multi_choice':
      return normalizeChoice(user) === normalizeChoice(q.answer)
    case 'true_false':
      return isTrueAnswer(user) === isTrueAnswer(q.answer)
    case 'fill_blank':
      return user.trim().toLowerCase() === q.answer.trim().toLowerCase()
    default:
      return false
  }
}

function windowCheck(exam: StoredExam): Response | null {
  const now = Date.now()
  if (now < exam.startAt) return json({ error: 'not_started', startAt: exam.startAt }, 403)
  if (now > exam.endAt) return json({ error: 'ended' }, 403)
  return null
}

export async function handleGetExam(db: D1Database, code: string): Promise<Response> {
  const exam = await readExam(db, code)
  if (!exam) return json({ error: 'not_found' }, 404)
  if (exam.suspended) return json({ error: 'reported' }, 403)
  const deny = windowCheck(exam)
  if (deny) return deny
  const publicQuestions: PublicQuestion[] = exam.questions.map(
    ({ id, type, stem, options }) => ({ id, type, stem, options }),
  )
  const info: PublishedExamInfo = {
    title: exam.title,
    questions: publicQuestions,
    startAt: exam.startAt,
    endAt: exam.endAt,
    durationMinutes: exam.durationMinutes,
  }
  return json(info)
}

export async function handleSubmit(
  db: D1Database,
  code: string,
  body: unknown,
): Promise<Response> {
  const exam = await readExam(db, code)
  if (!exam) return json({ error: 'not_found' }, 404)
  if (exam.suspended) return json({ error: 'reported' }, 403)
  const deny = windowCheck(exam)
  if (deny) return deny

  const req = body as Partial<SubmitExamRequest>
  if (typeof req.name !== 'string') return json({ error: 'Name is required' }, 400)
  const name = req.name.trim()
  if (!name) return json({ error: 'Name is required' }, 400)
  if (name.length > MAX_STUDENT_NAME_CHARS) return json({ error: 'Name is too long' }, 400)
  const rawAnswers = req.answers && typeof req.answers === 'object' ? req.answers : {}
  const answers = Object.fromEntries(
    Object.entries(rawAnswers).filter(([, value]) => typeof value === 'string'),
  ) as Record<string, string>
  if (JSON.stringify(answers).length > MAX_ANSWERS_BYTES) {
    return json({ error: 'Answers too large' }, 400)
  }
  const durationSec = typeof req.durationSec === 'number' ? Math.max(0, Math.round(req.durationSec)) : 0

  const stored = await db
    .prepare('SELECT COUNT(*) AS n FROM results WHERE code = ?')
    .bind(code)
    .first<{ n: number }>()
  if ((stored?.n ?? 0) >= MAX_EXAM_RESULTS) return json({ error: 'exam_full' }, 429)

  const graded: GradedQuestion[] = exam.questions.map((q) => {
    const raw = answers[q.id]
    const userAnswer = typeof raw === 'string' ? raw : null
    return { question: q, userAnswer, isCorrect: grade(q, userAnswer ?? undefined) }
  })
  const objective = graded.filter((g) => g.isCorrect !== null)
  const correctCount = objective.filter((g) => g.isCorrect === true).length
  const pendingCount = graded.filter((g) => g.isCorrect === null).length
  const pointsOf = (g: GradedQuestion) => (typeof g.question.score === 'number' && g.question.score > 0 ? g.question.score : 1)
  const score = objective.filter((g) => g.isCorrect === true).reduce((s, g) => s + pointsOf(g), 0)
  const totalScore = objective.reduce((s, g) => s + pointsOf(g), 0)

  const entry: ExamResultEntry = {
    name,
    answers,
    score,
    totalScore,
    correctCount,
    totalCount: exam.questions.length,
    pendingCount,
    durationSec,
    submittedAt: Date.now(),
    detail: graded.map((g) => ({ questionId: g.question.id, isCorrect: g.isCorrect })),
  }

  await db
    .prepare(
      'INSERT INTO results (id, code, name, answers, score, total_score, correct_count, total_count, pending_count, duration_sec, submitted_at, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(),
      code,
      entry.name,
      JSON.stringify(entry.answers),
      entry.score,
      entry.totalScore,
      entry.correctCount,
      entry.totalCount,
      entry.pendingCount,
      entry.durationSec,
      entry.submittedAt,
      JSON.stringify(entry.detail),
    )
    .run()

  const res: SubmitExamResponse = {
    score: entry.score,
    totalScore: entry.totalScore,
    correctCount,
    totalCount: entry.totalCount,
    pendingCount,
    graded,
  }
  return json(res)
}

export async function handleResults(
  db: D1Database,
  code: string,
  token: string,
): Promise<Response> {
  const exam = await readExam(db, code)
  if (!exam) return json({ error: 'not_found' }, 404)
  if (!token || (await sha256Hex(token)) !== exam.adminTokenHash) {
    return json({ error: 'unauthorized' }, 403)
  }
  const { results: rows } = await db
    .prepare('SELECT * FROM results WHERE code = ? ORDER BY score DESC, submitted_at ASC LIMIT 500')
    .bind(code)
    .all<ResultRow>()
  const results: ExamResultEntry[] = rows.map((r) => ({
    name: r.name,
    answers: JSON.parse(r.answers) as Record<string, string>,
    score: r.score,
    totalScore: r.total_score,
    correctCount: r.correct_count,
    totalCount: r.total_count,
    pendingCount: r.pending_count,
    durationSec: r.duration_sec,
    submittedAt: r.submitted_at,
    detail: JSON.parse(r.detail) as { questionId: string; isCorrect: boolean | null }[],
  }))
  const res: ExamResultsResponse = { title: exam.title, questions: exam.questions, results, endAt: exam.endAt }
  return json(res)
}

export async function handleDeleteExam(
  db: D1Database,
  code: string,
  token: string,
): Promise<Response> {
  const exam = await readExam(db, code)
  if (!exam) return json({ error: 'not_found' }, 404)
  if (!token || (await sha256Hex(token)) !== exam.adminTokenHash) {
    return json({ error: 'unauthorized' }, 403)
  }
  await db.batch([
    db.prepare('DELETE FROM exams WHERE code = ?').bind(code),
    db.prepare('DELETE FROM results WHERE code = ?').bind(code),
  ])
  return json({ ok: true })
}

export async function handleReport(db: D1Database, code: string, ip: string, body: unknown): Promise<Response> {
  const exam = await readExam(db, code)
  if (!exam) return json({ error: 'not_found' }, 404)
  const reason = typeof (body as { reason?: unknown })?.reason === 'string'
    ? ((body as { reason: string }).reason || '').trim().slice(0, 500)
    : ''
  await db
    .prepare('INSERT INTO reports (id, code, ip, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), code, ip, reason, Date.now())
    .run()
  const row = await db
    .prepare('SELECT COUNT(DISTINCT ip) AS n FROM reports WHERE code = ?')
    .bind(code)
    .first<{ n: number }>()
  if ((row?.n ?? 0) >= REPORT_SUSPEND_THRESHOLD) {
    await db.prepare('UPDATE exams SET suspended = 1 WHERE code = ?').bind(code).run()
  }
  return json({ ok: true })
}

export async function handleAdminReports(db: D1Database): Promise<Response> {
  const { results: rows } = await db
    .prepare(
      `SELECT r.code, COUNT(*) AS report_count, COUNT(DISTINCT r.ip) AS ip_count,
              MAX(r.created_at) AS last_reported_at,
              (SELECT title FROM exams e WHERE e.code = r.code) AS title,
              (SELECT suspended FROM exams e WHERE e.code = r.code) AS suspended,
              (SELECT reason FROM reports r2 WHERE r2.code = r.code ORDER BY r2.created_at DESC LIMIT 1) AS last_reason
       FROM reports r GROUP BY r.code ORDER BY ip_count DESC, last_reported_at DESC LIMIT 100`,
    )
    .all()
  return json({ reports: rows })
}

export async function handleAdminDelete(db: D1Database, code: string): Promise<Response> {
  await db.batch([
    db.prepare('DELETE FROM exams WHERE code = ?').bind(code),
    db.prepare('DELETE FROM results WHERE code = ?').bind(code),
    db.prepare('DELETE FROM reports WHERE code = ?').bind(code),
  ])
  return json({ ok: true })
}

export async function handleAdminRestore(db: D1Database, code: string): Promise<Response> {
  await db.batch([
    db.prepare('UPDATE exams SET suspended = 0 WHERE code = ?').bind(code),
    db.prepare('DELETE FROM reports WHERE code = ?').bind(code),
  ])
  return json({ ok: true })
}
