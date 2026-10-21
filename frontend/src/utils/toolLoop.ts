import type {
  AIConfig,
  AIRequestOptions,
  ChatMessage,
  ChatToolConfig,
  ChatToolName,
  ChatToolOptions,
  SearchConfig,
  ToolCall,
  ToolDefinition,
} from '@exameow/shared'
import { AIHttpError, chatStreamDirect } from './chatRequest'
import type { ChatStreamHandlers } from './chatStream'
import {
  fetchWithCache,
  formatFetchedPages,
  formatSearchContext,
  searchWithCache,
} from './webSearch'

const MAX_ROUNDS = 5
const MAX_CALLS_PER_ROUND = 3
const MAX_CALLS_TOTAL = 8
const MAX_RESULT_CHARS = 8000

function truncate(text: string, maxChars: number): string {
  const chars = Array.from(text)
  return chars.length <= maxChars ? text : `${chars.slice(0, maxChars).join('')}…`
}

function webSearchDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for up-to-date or verifiable information. Use it when the answer depends on facts beyond the provided question context.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'A concise search query.' },
          max_results: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: "How many results to return. Defaults to the user's setting.",
          },
        },
        required: ['query'],
      },
    },
  }
}

function webFetchDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'web_fetch',
      description:
        'Read the full text of a web page. Use it when a search snippet is not enough, or when the user gives a URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The absolute http(s) URL to read.' },
        },
        required: ['url'],
      },
    },
  }
}

function webCrawlDefinition(): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'web_crawl',
      description:
        'Crawl a website starting from one URL and read a few pages. Use it sparingly when the user explicitly asks about a whole site.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The site root or starting page.' },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: "Maximum number of pages to crawl. Defaults to the user's setting.",
          },
        },
        required: ['url'],
      },
    },
  }
}

function buildToolDefinitions(
  names: ChatToolName[],
  config: ChatToolConfig,
): ToolDefinition[] {
  const definitions: ToolDefinition[] = []
  for (const name of names) {
    if (name === 'web_search' && config.search) {
      definitions.push(webSearchDefinition())
    } else if (name === 'web_fetch' && config.fetch) {
      definitions.push(webFetchDefinition())
    } else if (name === 'web_crawl' && config.fetch?.provider === 'tavily') {
      definitions.push(webCrawlDefinition())
    }
  }
  return definitions
}

function toolDetail(call: ToolCall): string | undefined {
  try {
    const args = JSON.parse(call.function.arguments)
    return typeof args?.query === 'string'
      ? args.query
      : typeof args?.url === 'string'
        ? args.url
        : undefined
  } catch {
    return undefined
  }
}

function isToolsUnsupported(error: unknown): boolean {
  if (!(error instanceof AIHttpError)) return false
  if (![400, 404, 422, 501].includes(error.status)) return false
  const message = error.message.toLowerCase()
  return ['tool', 'function', 'unsupported', 'not supported'].some((part) =>
    message.includes(part),
  )
}

async function executeTool(
  call: ToolCall,
  config: ChatToolConfig,
  searchConfig: SearchConfig,
  signal?: AbortSignal,
): Promise<{ content: string; count?: number }> {
  let args: any
  try {
    args = JSON.parse(call.function.arguments || '{}')
  } catch {
    throw new Error('Invalid tool arguments')
  }

  if (call.function.name === 'web_search') {
    if (!config.search) throw new Error('Web search is not configured')
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (!query) throw new Error('Search query is empty')
    const requested =
      typeof args.max_results === 'number'
        ? Math.round(args.max_results)
        : config.search.max_results || 5
    const maxResults = Math.min(10, Math.max(1, requested))
    const results = await searchWithCache(
      { ...searchConfig, max_results: maxResults },
      query,
      signal,
    )
    return {
      content: truncate(formatSearchContext(results), MAX_RESULT_CHARS),
      count: results.length,
    }
  }

  if (call.function.name === 'web_fetch') {
    if (!config.fetch) throw new Error('Web fetch is not configured')
    const url = typeof args.url === 'string' ? args.url.trim() : ''
    if (!url) throw new Error('Fetch URL is empty')
    const pages = await fetchWithCache(searchConfig, [url], 'extract', signal)
    return {
      content: truncate(formatFetchedPages(pages), MAX_RESULT_CHARS),
      count: pages.length,
    }
  }

  if (call.function.name === 'web_crawl') {
    if (!config.fetch) throw new Error('Web crawl is not configured')
    if (searchConfig.fetch_provider !== 'tavily') {
      throw new Error(`Provider ${searchConfig.fetch_provider} does not support crawl`)
    }
    const url = typeof args.url === 'string' ? args.url.trim() : ''
    if (!url) throw new Error('Crawl URL is empty')
    const requested =
      typeof args.limit === 'number' ? Math.round(args.limit) : config.fetch.crawl_limit || 5
    const limit = Math.min(10, Math.max(1, requested))
    const pages = await fetchWithCache(
      { ...searchConfig, crawl_limit: limit },
      [url],
      'crawl',
      signal,
    )
    return {
      content: truncate(formatFetchedPages(pages), MAX_RESULT_CHARS),
      count: pages.length,
    }
  }

  throw new Error(`Unsupported tool: ${call.function.name}`)
}

export interface ToolLoopParams {
  messages: ChatMessage[]
  config: AIConfig
  options: AIRequestOptions
  searchConfig: SearchConfig
  toolOptions: ChatToolOptions
  handlers: ChatStreamHandlers
  signal?: AbortSignal
}

/**
 * Browser-direct tool loop: the model streams a round, we execute any tool
 * calls locally (via the platform-routed search/fetch APIs), then continue.
 */
export async function runToolLoop(params: ToolLoopParams): Promise<void> {
  const { messages, config, options, searchConfig, toolOptions, handlers, signal } = params
  const definitions = buildToolDefinitions(toolOptions.names, toolOptions.config)
  if (!definitions.length) {
    await chatStreamDirect(messages, config, options, handlers, signal)
    return
  }

  const working = messages.slice()
  const executed = new Set<string>()
  const maxRounds = Math.min(
    MAX_ROUNDS,
    Math.max(1, Math.round(toolOptions.config.max_rounds || 3)),
  )
  let totalCalls = 0

  for (let round = 0; round < maxRounds; round++) {
    let roundError: unknown = null
    const roundHandlers: ChatStreamHandlers = {
      onDelta: handlers.onDelta,
      onDone: () => {},
      onError: (error) => {
        roundError = error
      },
      onTool: handlers.onTool,
    }
    const calls = await chatStreamDirect(
      working,
      config,
      options,
      roundHandlers,
      signal,
      definitions,
      true,
    )
    if (signal?.aborted) return

    if (roundError) {
      if (round === 0 && isToolsUnsupported(roundError)) {
        handlers.onTool?.({ id: 'fallback', phase: 'end', name: 'fallback', ok: false })
        await chatStreamDirect(working, config, options, handlers, signal, [], false)
        return
      }
      handlers.onError(roundError)
      return
    }

    if (!calls.length) {
      handlers.onDone()
      return
    }

    working.push({ role: 'assistant', content: '', tool_calls: calls })

    for (const [index, call] of calls.entries()) {
      if (index >= MAX_CALLS_PER_ROUND || totalCalls >= MAX_CALLS_TOTAL) {
        working.push({
          role: 'tool',
          content: 'Tool call limit reached; answer with the information already gathered.',
          tool_call_id: call.id,
        })
        continue
      }
      totalCalls += 1

      const signature = `${call.function.name}|${call.function.arguments}`
      handlers.onTool?.({
        id: call.id,
        phase: 'start',
        name: call.function.name,
        detail: toolDetail(call),
      })

      let content = ''
      let count: number | undefined
      let ok = true
      if (executed.has(signature)) {
        content = 'Duplicate tool call skipped; use the previous result.'
      } else {
        executed.add(signature)
        try {
          const result = await executeTool(call, toolOptions.config, searchConfig, signal)
          content = result.content
          count = result.count
        } catch (error) {
          if ((error as { name?: string })?.name === 'AbortError') throw error
          ok = false
          content = JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      handlers.onTool?.({
        id: call.id,
        phase: 'end',
        name: call.function.name,
        ok,
        count,
      })
      working.push({ role: 'tool', content, tool_call_id: call.id })
    }
  }

  // Round cap reached: one final answer without tools.
  await chatStreamDirect(working, config, options, handlers, signal, [], false)
}
