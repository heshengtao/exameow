import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Ai, Fetcher, D1Database } from '@cloudflare/workers-types'
import { generateExam } from './exam'
import { handlePublish, handleGetExam, handleSubmit, handleResults, handleDeleteExam, handleReport, handleAdminReports, handleAdminDelete, handleAdminRestore } from './relay'
import { answerQuestion } from './answer'
import { judgeAnswer } from './judge'
import { explainQuestion } from './explain'
import { webSearch } from './search'
import { fetchPages } from './fetch'
import { chatStream, chatStreamWithTools, normalizeChatMessages } from './chat'
import { parseFile } from './parser'
import { generateXlsxBuffer, generateCsvContent } from './export'
import { Question, ExamParams, AVAILABLE_CF_MODELS, AIRequestOptions, SearchProvider, FetchProvider, ChatToolConfig, ChatToolName, WebSearchResult, MAX_JSON_BODY_BYTES, MAX_JSON_EXPORT_BYTES, MAX_REQUEST_BYTES, MAX_UPLOAD_BYTES, MAX_DOC_TEXT_CHARS, MAX_STEM_CHARS, MAX_ANSWER_CHARS, MAX_PROMPT_CHARS, MAX_EXAM_PAYLOAD_BYTES } from './types'
import { allowRequest, bodyTooLarge, clampText, originAllowed, readJsonCapped, sanitizeModel } from './guard'

type Bindings = {
  AI: Ai
  ASSETS: Fetcher
  EXAM_DB: D1Database
  CF_ACCOUNT_ID?: string
  CF_API_TOKEN?: string
  ADMIN_TOKEN?: string
  ALLOWED_ORIGINS?: string
}

const SEARCH_PROVIDERS = new Set<SearchProvider>(['tavily', 'deepseek', 'exa', 'firecrawl', 'bocha'])
const FETCH_PROVIDERS = new Set<FetchProvider>(['deepseek', 'tavily', 'jina', 'exa', 'firecrawl'])
const TOOL_NAMES = new Set<ChatToolName>(['web_search', 'web_fetch', 'web_crawl'])

function normalizeToolNames(raw: unknown): ChatToolName[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((name): name is ChatToolName => typeof name === 'string' && TOOL_NAMES.has(name as ChatToolName))
    .slice(0, 3)
}

function normalizeToolConfig(raw: unknown): ChatToolConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const config: ChatToolConfig = {
    max_rounds:
      typeof source.max_rounds === 'number'
        ? Math.min(5, Math.max(1, Math.round(source.max_rounds)))
        : 3,
  }

  const search = source.search as Record<string, unknown> | undefined
  if (search && SEARCH_PROVIDERS.has(search.provider as SearchProvider)) {
    const apiKey = clampText(search.api_key, 512).trim()
    if (apiKey) {
      config.search = {
        provider: search.provider as SearchProvider,
        api_key: apiKey,
        max_results:
          typeof search.max_results === 'number'
            ? Math.min(10, Math.max(1, Math.round(search.max_results)))
            : 5,
      }
    }
  }

  const fetch = source.fetch as Record<string, unknown> | undefined
  if (fetch && FETCH_PROVIDERS.has(fetch.provider as FetchProvider)) {
    const provider = fetch.provider as FetchProvider
    const apiKey = clampText(fetch.api_key, 512).trim()
    if (apiKey || provider === 'jina') {
      config.fetch = {
        provider,
        api_key: apiKey,
        max_chars:
          typeof fetch.max_chars === 'number'
            ? Math.min(20000, Math.max(500, Math.round(fetch.max_chars)))
            : 4000,
        crawl_limit:
          typeof fetch.crawl_limit === 'number'
            ? Math.min(10, Math.max(1, Math.round(fetch.crawl_limit)))
            : 5,
      }
    }
  }

  return config
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({
  origin: (origin, c) => (originAllowed(origin, c.env) ? origin : undefined),
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

// Reject browser requests from unknown sites: CORS alone cannot stop simple POSTs such as multipart uploads.
app.use('/api/*', async (c, next) => {
  if (!originAllowed(c.req.header('origin') || null, c.env)) {
    return c.json({ error: 'origin_not_allowed' }, 403)
  }
  await next()
})

const AI_QUOTA_PATTERN = /daily|allocation|neuron|quota|too many requests|rate limit|429/i

function aiErrorPayload(message: string): { status: 502 | 503; error: string } {
  if (AI_QUOTA_PATTERN.test(message)) {
    return { status: 503, error: 'AI demo quota is exhausted; retry later or use your own API key' }
  }
  return { status: 502, error: 'AI request failed' }
}

// GET /api/models - returns available CF AI models (dynamic from API, fallback to static list)
app.get('/api/models', async (c) => {
  if (!(await allowRequest(c.req.raw, 'models', 30, 60))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  const cacheKey = new Request('https://exameow-cache.internal/models')
  try {
    const cached = await caches.default.match(cacheKey)
    if (cached) return cached
  } catch {
    // Cache API unavailable: fall through to a fresh lookup.
  }
  const models = await loadCfModels(c.env)
  const response = new Response(JSON.stringify(models), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  })
  try {
    await caches.default.put(cacheKey, response.clone())
  } catch {
    // Cache API unavailable: serve uncached.
  }
  return response
})

async function loadCfModels(env: Bindings): Promise<{ id: string }[]> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    return AVAILABLE_CF_MODELS.map((m) => ({ id: m.id }))
  }
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/models/search?task=Text%20Generation&hide_experimental=true&per_page=100`
    const apiRes = await fetch(url, { headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } })
    if (!apiRes.ok) {
      const errBody = await apiRes.text()
      console.error('CF API error:', apiRes.status, errBody.substring(0, 300))
      return AVAILABLE_CF_MODELS.map((m) => ({ id: m.id }))
    }
    const data = (await apiRes.json()) as {
      success?: boolean
      result?: { name?: string; description?: string }[]
    }
    const textModels = (data.result || [])
      .filter((model) => {
        const name = (model.name || '').toLowerCase()
        const desc = (model.description || '').toLowerCase()
        return (
          !name.includes('lora') &&
          !name.includes('guard') &&
          !name.includes('deprecated') &&
          !name.includes('-awq') &&
          !desc.includes('deprecated')
        )
      })
      .map((model) => ({ id: model.name as string }))
    if (data.success && textModels.length > 0) return textModels
  } catch (e) {
    console.error('CF API fetch failed:', String(e))
  }
  return AVAILABLE_CF_MODELS.map((m) => ({ id: m.id }))
}

// POST /api/generate - generates exam questions from uploaded file
app.post('/api/generate', async (c) => {
  if (!(await allowRequest(c.req.raw, 'generate', 20, 600))) {
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }
  if (bodyTooLarge(c.req.raw, MAX_REQUEST_BYTES)) {
    return c.json({ error: 'Payload too large' }, 413)
  }
  const contentType = c.req.header('content-type') || ''

  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Expected multipart/form-data' }, 400)
  }

  let fileData: ArrayBuffer | null = null
  let fileName = 'unknown'
  let paramsJson = ''
  let model = ''
  let optionsJson = ''

  try {
    const formData = await c.req.formData()

    const file = formData.get('file')
    if (file instanceof File) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return c.json({ error: 'File too large' }, 413)
      }
      fileName = file.name.slice(0, 200)
      fileData = await file.arrayBuffer()
    }

    const paramsField = formData.get('params')
    if (typeof paramsField === 'string') {
      paramsJson = paramsField
    }

    const modelField = formData.get('model')
    if (typeof modelField === 'string') {
      model = modelField
    }

    const optionsField = formData.get('options')
    if (typeof optionsField === 'string') {
      optionsJson = optionsField
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
  if (params.text) params.text = params.text.slice(0, MAX_DOC_TEXT_CHARS)
  params.custom_prompt = clampText(params.custom_prompt, MAX_PROMPT_CHARS)

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
  let options: AIRequestOptions | undefined
  if (optionsJson.trim()) {
    try {
      options = JSON.parse(optionsJson)
    } catch {
      return c.json({ error: 'Invalid options JSON' }, 400)
    }
  }
  try {
    questions = await generateExam(c.env.AI, text, params, sanitizeModel(model), options)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI generation error:', msg)
    const failure = aiErrorPayload(msg)
    return c.json({ error: failure.error }, failure.status)
  }

  return c.json({ questions })
})

// POST /api/answer - answers a user question via AI
app.post('/api/answer', async (c) => {
  if (!(await allowRequest(c.req.raw, 'answer', 20, 600))) {
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_BODY_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const body = parsed.value as { question?: string; language?: string; model?: string; options?: AIRequestOptions }

  const question = clampText(body.question, MAX_STEM_CHARS).trim()
  if (!question) {
    return c.json({ error: 'Question is empty' }, 400)
  }

  try {
    const result = await answerQuestion(
      c.env.AI,
      question,
      clampText(body.language, 40) || 'Chinese',
      sanitizeModel(body.model),
      body.options
    )
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI answer error:', msg)
    const failure = aiErrorPayload(msg)
    return c.json({ error: failure.error }, failure.status)
  }
})

// POST /api/judge - AI-grades a user's answer against the reference answer
app.post('/api/judge', async (c) => {
  if (!(await allowRequest(c.req.raw, 'judge', 20, 600))) {
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_BODY_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const body = parsed.value as {
    stem?: string
    reference_answer?: string
    analysis?: string
    user_answer?: string
    language?: string
    model?: string
    options?: AIRequestOptions
  }

  const userAnswer = clampText(body.user_answer, MAX_ANSWER_CHARS).trim()
  if (!userAnswer) {
    return c.json({ error: 'User answer is empty' }, 400)
  }

  try {
    const result = await judgeAnswer(c.env.AI, {
      stem: clampText(body.stem, MAX_STEM_CHARS),
      referenceAnswer: clampText(body.reference_answer, MAX_ANSWER_CHARS),
      analysis: clampText(body.analysis, MAX_ANSWER_CHARS),
      userAnswer,
      language: clampText(body.language, 40) || 'Chinese',
      model: sanitizeModel(body.model),
    }, body.options)
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI judge error:', msg)
    const failure = aiErrorPayload(msg)
    return c.json({ error: failure.error }, failure.status)
  }
})

// POST /api/explain - AI explains why the reference answer is correct
app.post('/api/explain', async (c) => {
  if (!(await allowRequest(c.req.raw, 'explain', 20, 600))) {
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_BODY_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const body = parsed.value as {
    stem?: string
    reference_answer?: string
    analysis?: string
    language?: string
    model?: string
    options?: AIRequestOptions
    search_results?: unknown
  }

  const stem = clampText(body.stem, MAX_STEM_CHARS).trim()
  if (!stem) {
    return c.json({ error: 'Question is empty' }, 400)
  }

  const searchResults: WebSearchResult[] = Array.isArray(body.search_results)
    ? body.search_results.slice(0, 10).flatMap((item) => {
        const record = item as Record<string, unknown>
        const title = clampText(record.title as string, 500).trim()
        const url = clampText(record.url as string, 2000).trim()
        const snippet = clampText(record.snippet as string, MAX_ANSWER_CHARS).trim()
        return title && url ? [{ title, url, snippet }] : []
      })
    : []

  try {
    const result = await explainQuestion(c.env.AI, {
      stem,
      referenceAnswer: clampText(body.reference_answer, MAX_ANSWER_CHARS),
      analysis: clampText(body.analysis, MAX_ANSWER_CHARS),
      language: clampText(body.language, 40) || 'Chinese',
      model: sanitizeModel(body.model),
      searchResults,
    }, body.options)
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI explain error:', msg)
    const failure = aiErrorPayload(msg)
    return c.json({ error: failure.error }, failure.status)
  }
})

// POST /api/search - web search via Tavily or DeepSeek
app.post('/api/search', async (c) => {
  if (!(await allowRequest(c.req.raw, 'search', 30, 600))) {
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_BODY_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const body = parsed.value as {
    provider?: string
    api_key?: string
    query?: string
    max_results?: number
  }

  const provider: SearchProvider | null = SEARCH_PROVIDERS.has(body.provider as SearchProvider)
    ? (body.provider as SearchProvider)
    : null
  if (!provider) {
    return c.json({ error: 'Unsupported search provider' }, 400)
  }
  const apiKey = clampText(body.api_key, 512).trim()
  if (!apiKey) {
    return c.json({ error: 'Search API key is missing' }, 400)
  }
  const query = clampText(body.query, 512).trim()
  if (!query) {
    return c.json({ error: 'Search query is empty' }, 400)
  }

  try {
    const result = await webSearch(provider, apiKey, query, body.max_results ?? 5)
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Web search error:', msg)
    return c.json({ error: 'Web search failed' }, 502)
  }
})

// POST /api/fetch - read web page content via DeepSeek/Tavily/Jina/Exa/Firecrawl
app.post('/api/fetch', async (c) => {
  if (!(await allowRequest(c.req.raw, 'fetch', 20, 600))) {
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_BODY_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const body = parsed.value as {
    provider?: string
    api_key?: string
    urls?: unknown
    mode?: string
    max_chars?: number
    limit?: number
  }

  const provider: FetchProvider | null = FETCH_PROVIDERS.has(body.provider as FetchProvider)
    ? (body.provider as FetchProvider)
    : null
  if (!provider) {
    return c.json({ error: 'Unsupported fetch provider' }, 400)
  }
  const apiKey = clampText(body.api_key, 512).trim()
  if (provider !== 'jina' && !apiKey) {
    return c.json({ error: 'Fetch API key is missing' }, 400)
  }
  const urls = Array.isArray(body.urls)
    ? body.urls
        .filter((url): url is string => typeof url === 'string')
        .map((url) => clampText(url, 2000).trim())
        .filter(Boolean)
        .slice(0, 5)
    : []
  if (!urls.length) {
    return c.json({ error: 'Fetch URL is missing' }, 400)
  }
  const mode = body.mode === 'crawl' ? 'crawl' : 'extract'

  try {
    const result = await fetchPages(
      provider,
      apiKey,
      urls,
      mode,
      typeof body.max_chars === 'number' ? body.max_chars : 4000,
      typeof body.limit === 'number' ? body.limit : 5,
    )
    return c.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Web fetch error:', msg)
    return c.json({ error: 'Web fetch failed' }, 502)
  }
})

// POST /api/chat - streaming multi-turn chat (normalized SSE protocol)
app.post('/api/chat', async (c) => {
  if (!(await allowRequest(c.req.raw, 'chat', 20, 600))) {
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_BODY_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const body = parsed.value as {
    messages?: unknown
    model?: string
    options?: AIRequestOptions
    tools?: unknown
    tool_config?: unknown
  }

  const messages = normalizeChatMessages(body.messages)
  if (messages.length === 0) {
    return c.json({ error: 'Messages are empty' }, 400)
  }
  const toolNames = normalizeToolNames(body.tools)
  const toolConfig = normalizeToolConfig(body.tool_config)

  try {
    const stream =
      toolNames.length && toolConfig
        ? await chatStreamWithTools(
            c.env.AI,
            messages,
            sanitizeModel(body.model),
            body.options,
            toolNames,
            toolConfig,
          )
        : await chatStream(c.env.AI, messages, sanitizeModel(body.model), body.options)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI chat error:', msg)
    const failure = aiErrorPayload(msg)
    return c.json({ error: failure.error }, failure.status)
  }
})

// GET /api/export - exports questions as CSV download
app.get('/api/export', async (c) => {
  if (!(await allowRequest(c.req.raw, 'export', 30, 60))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
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
  if (!(await allowRequest(c.req.raw, 'export-xlsx', 20, 60))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_EXPORT_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const questions = parsed.value

  if (!Array.isArray(questions)) {
    return c.json({ error: 'Expected array of questions' }, 400)
  }

  const xlsxData = generateXlsxBuffer(questions as Question[])
  return new Response(xlsxData, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="exameow_questions.xlsx"',
    },
  })
})

// POST /api/config/save - config save (no-op on worker, client uses localStorage)
app.post('/api/config/save', async (c) => {
  if (!(await allowRequest(c.req.raw, 'config-save', 10, 600))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  return c.body(null, 200)
})

// GET /api/config/load - config load (no-op on worker, client uses localStorage)
app.get('/api/config/load', (c) => {
  return c.json(null)
})

app.post('/api/exam/publish', async (c) => {
  if (!(await allowRequest(c.req.raw, 'publish', 5, 600))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_EXAM_PAYLOAD_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const origin = new URL(c.req.url).origin
  return handlePublish(c.env.EXAM_DB, parsed.value, origin, c.req.header('CF-Connecting-IP') || 'unknown')
})

app.get('/api/exam/code/:code', async (c) => {
  if (!(await allowRequest(c.req.raw, 'get-exam', 120, 60))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  return handleGetExam(c.env.EXAM_DB, c.req.param('code'))
})

app.post('/api/exam/code/:code/submit', async (c) => {
  if (!(await allowRequest(c.req.raw, 'submit', 120, 60))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_BODY_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  return handleSubmit(c.env.EXAM_DB, c.req.param('code'), parsed.value)
})

app.get('/api/exam/code/:code/results', async (c) => {
  if (!(await allowRequest(c.req.raw, 'results', 60, 60))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  return handleResults(c.env.EXAM_DB, c.req.param('code'), c.req.query('token') || '')
})

app.delete('/api/exam/code/:code', async (c) => {
  if (!(await allowRequest(c.req.raw, 'delete-exam', 30, 60))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  return handleDeleteExam(c.env.EXAM_DB, c.req.param('code'), c.req.query('token') || '')
})

app.post('/api/exam/code/:code/report', async (c) => {
  if (!(await allowRequest(c.req.raw, 'report', 10, 600))) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  const parsed = await readJsonCapped(c.req.raw, MAX_JSON_BODY_BYTES)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  return handleReport(c.env.EXAM_DB, c.req.param('code'), c.req.header('CF-Connecting-IP') || 'unknown', parsed.value)
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
  return c.json({ status: 'ok', version: '1.6.2', runtime: 'cloudflare-worker' })
})

// SPA fallback: serve index.html for all non-API, non-asset routes
app.notFound(async (c) => {
  // Only do SPA fallback for GET requests
  if (c.req.method !== 'GET') {
    return c.json({ error: 'Not found' }, 404)
  }
  if (!(await allowRequest(c.req.raw, 'spa-fallback', 60, 60))) {
    return c.json({ error: 'Too many requests' }, 429)
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
