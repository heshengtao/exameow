import type { FetchedPage, FetchProvider, FetchResponse } from './types'
import { postJson } from './search'

const DEEPSEEK_FETCH_URL = 'https://api.deepseek.com/v1/tools/fetch'
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract'
const TAVILY_CRAWL_URL = 'https://api.tavily.com/crawl'
const EXA_CONTENTS_URL = 'https://api.exa.ai/contents'
const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape'
const JINA_READER_PREFIX = 'https://r.jina.ai/'

const FETCH_TIMEOUT_MS = 60_000
const CRAWL_TIMEOUT_MS = 120_000
const MAX_EXTRACT_URLS = 5

function truncate(text: string, maxChars: number): string {
  const chars = Array.from(text)
  return chars.length <= maxChars ? text : `${chars.slice(0, maxChars).join('')}…`
}

function isSafePublicUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!host) return false
  if (host === 'localhost' || host === '::1' || host === '[::1]' || host.endsWith('.local')) {
    return false
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return false
    }
  }
  return true
}

function collectUrls(urls: string[], mode: 'extract' | 'crawl'): string[] {
  const max = mode === 'crawl' ? 1 : MAX_EXTRACT_URLS
  const cleaned = urls
    .map((url) => url.trim())
    .filter(Boolean)
    .slice(0, max)
  if (!cleaned.length) throw new Error('Fetch URL is missing')
  for (const url of cleaned) {
    if (!isSafePublicUrl(url)) throw new Error(`Unsupported or unsafe URL: ${url}`)
  }
  return cleaned
}

function makePage(url: string, title: unknown, content: unknown, maxChars: number): FetchedPage {
  return {
    url,
    title: typeof title === 'string' ? title.trim() : '',
    content: truncate(typeof content === 'string' ? content.trim() : '', maxChars),
  }
}

async function fetchDeepseek(apiKey: string, url: string, maxChars: number): Promise<FetchedPage> {
  const data = await postJson(
    DEEPSEEK_FETCH_URL,
    apiKey,
    'authorization',
    { url },
    FETCH_TIMEOUT_MS,
  )
  return makePage(url, data?.title, data?.content, maxChars)
}

async function fetchTavilyExtract(
  apiKey: string,
  urls: string[],
  maxChars: number,
): Promise<FetchedPage[]> {
  const data = await postJson(
    TAVILY_EXTRACT_URL,
    apiKey,
    'authorization',
    { urls, extract_depth: 'basic' },
    FETCH_TIMEOUT_MS,
  )
  const raw = Array.isArray(data?.results) ? data.results : []
  return raw
    .map((item: any) =>
      makePage(
        typeof item?.url === 'string' ? item.url : '',
        item?.title,
        item?.raw_content,
        maxChars,
      ),
    )
    .filter((page: FetchedPage) => page.content.length > 0)
}

async function fetchTavilyCrawl(
  apiKey: string,
  url: string,
  maxChars: number,
  limit: number,
): Promise<FetchedPage[]> {
  const data = await postJson(
    TAVILY_CRAWL_URL,
    apiKey,
    'authorization',
    {
      url,
      max_depth: 1,
      max_breadth: 20,
      limit,
      extract_depth: 'basic',
    },
    CRAWL_TIMEOUT_MS,
  )
  const raw = Array.isArray(data?.results) ? data.results : []
  return raw
    .map((item: any) =>
      makePage(
        typeof item?.url === 'string' ? item.url : '',
        item?.title,
        item?.raw_content,
        maxChars,
      ),
    )
    .filter((page: FetchedPage) => page.content.length > 0)
}

async function fetchJina(apiKey: string, url: string, maxChars: number): Promise<FetchedPage> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`
    const res = await fetch(`${JINA_READER_PREFIX}${url}`, {
      headers,
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
    try {
      const data = JSON.parse(text)
      if (typeof data?.content === 'string' && data.content.trim()) {
        return makePage(url, data.title, data.content, maxChars)
      }
    } catch {
      // Plain-text reader response.
    }
    return makePage(url, '', text, maxChars)
  } finally {
    clearTimeout(timer)
  }
}

async function fetchExaContents(
  apiKey: string,
  url: string,
  maxChars: number,
): Promise<FetchedPage> {
  const data = await postJson(
    EXA_CONTENTS_URL,
    apiKey,
    'x-api-key',
    { ids: [url], text: { maxCharacters: maxChars } },
    FETCH_TIMEOUT_MS,
  )
  const item = Array.isArray(data?.results) ? data.results[0] : null
  return makePage(
    typeof item?.url === 'string' ? item.url : url,
    item?.title,
    item?.text,
    maxChars,
  )
}

async function fetchFirecrawl(
  apiKey: string,
  url: string,
  maxChars: number,
): Promise<FetchedPage> {
  const data = await postJson(
    FIRECRAWL_SCRAPE_URL,
    apiKey,
    'authorization',
    { url, formats: ['markdown'], onlyMainContent: true },
    FETCH_TIMEOUT_MS,
  )
  return makePage(url, data?.data?.metadata?.title, data?.data?.markdown, maxChars)
}

export async function fetchPages(
  provider: FetchProvider,
  apiKey: string,
  urls: string[],
  mode: 'extract' | 'crawl',
  maxChars: number,
  limit: number,
): Promise<FetchResponse> {
  const cleaned = collectUrls(urls, mode)
  const chars = Math.min(20000, Math.max(500, Math.round(maxChars) || 4000))
  const crawlLimit = Math.min(10, Math.max(1, Math.round(limit) || 5))

  if (provider !== 'jina' && !apiKey.trim()) {
    throw new Error('Fetch API key is missing')
  }

  let pages: FetchedPage[] = []
  if (provider === 'deepseek' && mode === 'extract') {
    for (const url of cleaned) pages.push(await fetchDeepseek(apiKey, url, chars))
  } else if (provider === 'tavily' && mode === 'extract') {
    pages = await fetchTavilyExtract(apiKey, cleaned, chars)
  } else if (provider === 'tavily' && mode === 'crawl') {
    pages = await fetchTavilyCrawl(apiKey, cleaned[0]!, chars, crawlLimit)
  } else if (provider === 'jina' && mode === 'extract') {
    for (const url of cleaned) pages.push(await fetchJina(apiKey, url, chars))
  } else if (provider === 'exa' && mode === 'extract') {
    for (const url of cleaned) pages.push(await fetchExaContents(apiKey, url, chars))
  } else if (provider === 'firecrawl' && mode === 'extract') {
    for (const url of cleaned) pages.push(await fetchFirecrawl(apiKey, url, chars))
  } else if (provider === 'firecrawl' && mode === 'crawl') {
    throw new Error('Firecrawl crawl is not supported; use Firecrawl extract instead')
  } else {
    throw new Error(`Unsupported fetch provider: ${String(provider)}`)
  }

  pages = pages.filter((page) => page.content.length > 0)
  if (!pages.length) throw new Error('Fetch returned no content')
  return { provider, pages }
}
