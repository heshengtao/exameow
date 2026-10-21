import type { SearchProvider, WebSearchResponse, WebSearchResult } from './types'

const TAVILY_URL = 'https://api.tavily.com/search'
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/tools/search'
const EXA_URL = 'https://api.exa.ai/search'
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/search'
const BOCHA_URL = 'https://api.bochaai.com/v1/web-search'

const MAX_QUERY_CHARS = 120
const MAX_SNIPPET_CHARS = 800
const SEARCH_TIMEOUT_MS = 20_000

function normalizeQuery(query: string): string {
  return Array.from(query.replace(/\s+/g, ' ').trim()).slice(0, MAX_QUERY_CHARS).join('')
}

function truncate(text: string, maxChars: number): string {
  const chars = Array.from(text)
  return chars.length <= maxChars ? text : `${chars.slice(0, maxChars).join('')}…`
}

export async function postJson(
  url: string,
  apiKey: string,
  authHeader: 'authorization' | 'x-api-key',
  body: unknown,
  timeoutMs: number = SEARCH_TIMEOUT_MS,
): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = apiKey.trim()
  if (key) {
    headers[authHeader] = authHeader === 'authorization' ? `Bearer ${key}` : key
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

function getStr(item: any, keys: string[]): string {
  for (const key of keys) {
    const value = item?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function resultsFrom(
  raw: any[],
  count: number,
  titleKeys: string[],
  urlKeys: string[],
  snippetKeys: string[],
): WebSearchResult[] {
  const results: WebSearchResult[] = []
  for (const item of raw.slice(0, count)) {
    const title = getStr(item, titleKeys).trim()
    const url = getStr(item, urlKeys).trim()
    if (!title || !url) continue
    results.push({
      title,
      url,
      snippet: truncate(getStr(item, snippetKeys).trim(), MAX_SNIPPET_CHARS),
    })
  }
  return results
}

async function searchTavily(apiKey: string, query: string, count: number): Promise<WebSearchResult[]> {
  const data = await postJson(TAVILY_URL, apiKey, 'authorization', {
    query,
    max_results: count,
    search_depth: 'basic',
    include_answer: false,
  })
  const raw = Array.isArray(data?.results) ? data.results : []
  return resultsFrom(raw, count, ['title'], ['url'], ['content', 'snippet'])
}

async function searchDeepseek(apiKey: string, query: string, count: number): Promise<WebSearchResult[]> {
  const data = await postJson(DEEPSEEK_URL, apiKey, 'authorization', {
    query,
    count,
    need_content: false,
  })
  const raw = Array.isArray(data?.results) ? data.results : []
  return resultsFrom(raw, count, ['title'], ['url'], ['summary', 'snippet'])
}

async function searchExa(apiKey: string, query: string, count: number): Promise<WebSearchResult[]> {
  const data = await postJson(EXA_URL, apiKey, 'x-api-key', {
    query,
    numResults: count,
    type: 'auto',
    contents: { highlights: true },
  })
  const raw = Array.isArray(data?.results) ? data.results : []
  const results: WebSearchResult[] = []
  for (const item of raw.slice(0, count)) {
    const title = getStr(item, ['title']).trim()
    const url = getStr(item, ['url']).trim()
    if (!title || !url) continue
    let snippet = getStr(item, ['text', 'summary']).trim()
    if (!snippet && Array.isArray(item?.highlights)) {
      snippet = typeof item.highlights[0] === 'string' ? item.highlights[0].trim() : ''
    }
    results.push({ title, url, snippet: truncate(snippet, MAX_SNIPPET_CHARS) })
  }
  return results
}

async function searchFirecrawl(apiKey: string, query: string, count: number): Promise<WebSearchResult[]> {
  const data = await postJson(FIRECRAWL_URL, apiKey, 'authorization', {
    query,
    limit: count,
  })
  const raw = Array.isArray(data?.data?.web)
    ? data.data.web
    : Array.isArray(data?.data)
      ? data.data
      : []
  return resultsFrom(raw, count, ['title'], ['url'], ['description', 'markdown'])
}

async function searchBocha(apiKey: string, query: string, count: number): Promise<WebSearchResult[]> {
  const data = await postJson(BOCHA_URL, apiKey, 'authorization', {
    query,
    summary: true,
    count,
  })
  const raw = Array.isArray(data?.data?.webPages?.value) ? data.data.webPages.value : []
  return resultsFrom(raw, count, ['name', 'title'], ['url'], ['snippet', 'summary'])
}

export async function webSearch(
  provider: SearchProvider,
  apiKey: string,
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) throw new Error('Search query is empty')
  if (!apiKey.trim()) throw new Error('Search API key is missing')

  const count = Math.min(10, Math.max(1, Math.round(maxResults) || 5))
  let results: WebSearchResult[]
  switch (provider) {
    case 'tavily':
      results = await searchTavily(apiKey, normalizedQuery, count)
      break
    case 'deepseek':
      results = await searchDeepseek(apiKey, normalizedQuery, count)
      break
    case 'exa':
      results = await searchExa(apiKey, normalizedQuery, count)
      break
    case 'firecrawl':
      results = await searchFirecrawl(apiKey, normalizedQuery, count)
      break
    case 'bocha':
      results = await searchBocha(apiKey, normalizedQuery, count)
      break
    default:
      throw new Error(`Unsupported search provider: ${String(provider)}`)
  }

  return { provider, query: normalizedQuery, results }
}
