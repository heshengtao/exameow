import { resolveAIOptions, type AIOptions } from '../../packages/shared/src/aiOptions'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Ai, Fetcher, D1Database } from '@cloudflare/workers-types'
import { generateExam } from './exam'
import { handlePublish, handleGetExam, handleSubmit, handleResults, handleDeleteExam, handleReport, handleAdminReports, handleAdminDelete, handleAdminRestore } from './relay'
import { answerQuestion } from './answer'
import { judgeAnswer } from './judge'
import { explainQuestion } from './explain'
import { parseFile } from './parser'
import { generateXlsxBuffer, generateCsvContent } from './export'
import { Question, ExamParams, AVAILABLE_CF_MODELS } from './types'

type Bindings = {
  AI: Ai
  ASSETS: Fetcher
  EXAM_DB: D1Database
  CF_ACCOUNT_ID?: string
  CF_API_TOKEN?: string
  ADMIN_TOKEN?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

// GET /api/models - returns available CF AI models (dynamic from API, fallback to static list)
app.get('/api/models', async (c) => {
  // Try dynamic fetch from CF API
  if (c.env.CF_ACCOUNT_ID && c.env.CF_API_TOKEN) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${c.env.CF_ACCOUNT_ID}/ai/models/search?task=Text%20Generation&hide_experimental=true&per_page=100`
      console.log('Fetching models from CF API...')
      const apiRes = await fetch(url, {
        headers: { Authorization: `Bearer ${c.env.CF_API_TOKEN}` },
      })
      console.log('CF API response status:', apiRes.status)
      if (apiRes.ok) {
        const data = await apiRes.json() as any
        console.log('CF API success:', data.success, 'models:', data.result?.length)
        if (data.success && data.result) {
          const textModels = data.result
            .filter((m: any) => {
              const name = (m.name || '').toLowerCase()
              const desc = (m.description || '').toLowerCase()
              return (
                !name.includes('lora') &&
                !name.includes('guard') &&
                !name.includes('deprecated') &&
                !name.includes('-awq') &&
                !desc.includes('deprecated')
              )
            })
            .map((m: any) => ({ id: m.name as string }))
          if (textModels.length > 0) {
            return c.json(textModels)
          }
        }
      } else {
        const errBody = await apiRes.text()
        console.error('CF API error:', apiRes.status, errBody.substring(0, 300))
      }
    } catch (e) {
      console.error('CF API fetch failed:', String(e))
    }
  } else {
    console.log('CF_API_TOKEN or CF_ACCOUNT_ID not configured, using static list')
  }
  // Fallback to static list
  return c.json(AVAILABLE_CF_MODELS.map((m) => ({ id: m.id })))
})

// POST /api/generate - generates exam questions from uploaded file
app.post('/api/generate', async (c) => {
  const contentType = c.req.header('content-type') || ''

  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Expected multipart/form-data' }, 400)
  }

  let fileData: ArrayBuffer | null = null
  let fileName = 'unknown'
  let paramsJson = ''
  let model = ''
  let options: AIOptions | undefined

  try {
    const formData = await c.req.formData()

    const file = formData.get('file')
    if (file instanceof File) {
      fileName = file.name
      fileData = await file.arrayBuffer()
    }

    const paramsField = formData.get('params')
    if (typeof paramsField === 'string') {
      paramsJson = paramsField
    }

    const optionsField = formData.get('options')
    options = resolveAIOptions(typeof optionsField === 'string' ? JSON.parse(optionsField) : undefined)
    const modelField = formData.get('model')
    if (typeof modelField === 'string') {
      model = modelField
    }
  } catch (err) {
    return c.json({ error: `Failed to parse form data: ${err}` }, 400)
  }

  if (!paramsJson) {
    return c.json({ error: 'No params provided' }, 400)
  }

  let params: ExamParams
  try {
    params = JSON.parse(paramsJson)
  } catch {
    return c.json({ error: 'Invalid params JSON' }, 400)
  }

  let text: string
  if (params.text && params.text.trim()) {
    text = params.text
  } else {
    if (!fileData) {
      return c.json({ error: 'No file uploaded' }, 400)
    }
    try {
      text = await parseFile(fileData, fileName)
    } catch (err) {
      return c.json({ error: `File parse error: ${err}` }, 400)
    }
  }

  if (!text.trim()) {
    return c.json({ error: 'No text extracted from file' }, 400)
  }

  let questions: Question[]
  try {
    questions = await generateExam(c.env.AI, text, params, model || undefined, options, c.req.raw.signal)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI generation error:', msg)
    return c.json({ error: `AI generation error: ${msg}` }, 502)
  }

  return c.json({ questions })
})

// POST /api/answer - answers a user question via AI
app.post('/api/answer', async (c) => {
  let body: { question?: string; language?: string; model?: string; options?: AIOptions }
  try {
    body = await c.req.json()
    body.options = resolveAIOptions(body.options)
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const question = (body.question || '').trim()
  if (!question) {
    return c.json({ error: 'Question is empty' }, 400)
  }

  try {
    const result = await answerQuestion(
      c.env.AI,
      question,
      body.language || 'Chinese',
      body.model || undefined,
      body.options,
      c.req.raw.signal,
    )
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI answer error:', msg)
    return c.json({ error: `AI answer error: ${msg}` }, 502)
  }
})

// POST /api/judge - AI-grades a user's answer against the reference answer
app.post('/api/judge', async (c) => {
  let body: {
    stem?: string
    reference_answer?: string
    analysis?: string
    user_answer?: string
    language?: string
    model?: string
    options?: AIOptions
  }
  try {
    body = await c.req.json()
    body.options = resolveAIOptions(body.options)
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const userAnswer = (body.user_answer || '').trim()
  if (!userAnswer) {
    return c.json({ error: 'User answer is empty' }, 400)
  }

  try {
    const result = await judgeAnswer(c.env.AI, {
      stem: body.stem || '',
      referenceAnswer: body.reference_answer || '',
      analysis: body.analysis || '',
      userAnswer,
      language: body.language || 'Chinese',
      model: body.model || undefined,
      options: body.options,
      signal: c.req.raw.signal,
    })
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI judge error:', msg)
    return c.json({ error: `AI judge error: ${msg}` }, 502)
  }
})

// POST /api/explain - AI explains why the reference answer is correct
app.post('/api/explain', async (c) => {
  let body: {
    stem?: string
    reference_answer?: string
    analysis?: string
    language?: string
    model?: string
    options?: AIOptions
  }
  try {
    body = await c.req.json()
    body.options = resolveAIOptions(body.options)
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const stem = (body.stem || '').trim()
  if (!stem) {
    return c.json({ error: 'Question is empty' }, 400)
  }

  try {
    const result = await explainQuestion(c.env.AI, {
      stem,
      referenceAnswer: body.reference_answer || '',
      analysis: body.analysis || '',
      language: body.language || 'Chinese',
      model: body.model || undefined,
      options: body.options,
      signal: c.req.raw.signal,
    })
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI explain error:', msg)
    return c.json({ error: `AI explain error: ${msg}` }, 502)
  }
})

// GET /api/export - exports questions as CSV download
app.get('/api/export', (c) => {
  const questionsParam = c.req.query('questions')
  if (!questionsParam) {
    return c.json({ error: 'Missing questions parameter' }, 400)
  }

  let questions: Question[]
  try {
    questions = JSON.parse(questionsParam)
  } catch {
    return c.json({ error: 'Invalid questions JSON' }, 400)
  }

  const csvContent = generateCsvContent(questions)
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="exameow_questions.csv"',
    },
  })
})

// POST /api/export/xlsx - exports questions as XLSX download
app.post('/api/export/xlsx', async (c) => {
  let questions: Question[]
  try {
    questions = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid questions JSON body' }, 400)
  }

  if (!Array.isArray(questions)) {
    return c.json({ error: 'Expected array of questions' }, 400)
  }

  const xlsxData = generateXlsxBuffer(questions)
  return new Response(xlsxData, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="exameow_questions.xlsx"',
    },
  })
})

// POST /api/config/save - config save (no-op on worker, client uses localStorage)
app.post('/api/config/save', async (c) => {
  return c.body(null, 200)
})

// GET /api/config/load - config load (no-op on worker, client uses localStorage)
app.get('/api/config/load', (c) => {
  return c.json(null)
})

app.post('/api/exam/publish', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const origin = new URL(c.req.url).origin
  return handlePublish(c.env.EXAM_DB, body, origin, c.req.header('CF-Connecting-IP') || 'unknown')
})

app.get('/api/exam/code/:code', (c) => handleGetExam(c.env.EXAM_DB, c.req.param('code')))

app.post('/api/exam/code/:code/submit', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  return handleSubmit(c.env.EXAM_DB, c.req.param('code'), body)
})

app.get('/api/exam/code/:code/results', (c) =>
  handleResults(c.env.EXAM_DB, c.req.param('code'), c.req.query('token') || ''),
)

app.delete('/api/exam/code/:code', (c) =>
  handleDeleteExam(c.env.EXAM_DB, c.req.param('code'), c.req.query('token') || ''),
)

app.post('/api/exam/code/:code/report', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  return handleReport(c.env.EXAM_DB, c.req.param('code'), c.req.header('CF-Connecting-IP') || 'unknown', body)
})

function adminAuthorized(c: { env: Bindings; req: { header: (name: string) => string | undefined } }): boolean {
  const token = c.env.ADMIN_TOKEN
  if (!token) return false
  return c.req.header('authorization') === `Bearer ${token}`
}

app.get('/api/exam/admin/reports', (c) => {
  if (!adminAuthorized(c)) return c.json({ error: 'unauthorized' }, 403)
  return handleAdminReports(c.env.EXAM_DB)
})

app.delete('/api/exam/admin/code/:code', (c) => {
  if (!adminAuthorized(c)) return c.json({ error: 'unauthorized' }, 403)
  return handleAdminDelete(c.env.EXAM_DB, c.req.param('code'))
})

app.post('/api/exam/admin/code/:code/restore', (c) => {
  if (!adminAuthorized(c)) return c.json({ error: 'unauthorized' }, 403)
  return handleAdminRestore(c.env.EXAM_DB, c.req.param('code'))
})

// GET /api/health - health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: '1.4.0', runtime: 'cloudflare-worker' })
})

// SPA fallback: serve index.html for all non-API, non-asset routes
app.notFound(async (c) => {
  // Only do SPA fallback for GET requests
  if (c.req.method !== 'GET') {
    return c.json({ error: 'Not found' }, 404)
  }

  // Serve index.html for SPA routing
  const indexUrl = new URL('/index.html', c.req.url)
  try {
    const asset = await c.env.ASSETS.fetch(new Request(indexUrl))
    if (asset.ok) return asset
  } catch {}

  return c.json({ error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const dayCutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    ctx.waitUntil(
      env.EXAM_DB.batch([
        env.EXAM_DB.prepare('DELETE FROM exams WHERE created_at < ?').bind(cutoff),
        env.EXAM_DB.prepare('DELETE FROM results WHERE submitted_at < ?').bind(cutoff),
        env.EXAM_DB.prepare('DELETE FROM reports WHERE created_at < ?').bind(cutoff),
        env.EXAM_DB.prepare('DELETE FROM publish_limits WHERE day < ?').bind(dayCutoff),
      ]),
    )
  },
}
