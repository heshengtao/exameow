import type { LearnMessage } from '@/stores/learn'

const CACHE_KEY = 'exameow-learn-cache'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 80

interface CacheEntry {
  updatedAt: number
  stem: string
  messages: LearnMessage[]
}

type CacheMap = Record<string, CacheEntry>

export function learnCacheKey(bankId: string, questionId: string): string {
  return `${bankId}::${questionId.replace(/-s\d+$/, '')}`
}

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(cache: CacheMap) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    try {
      const entries = Object.entries(cache)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, Math.floor(MAX_ENTRIES / 2))
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
    } catch {}
  }
}

function prune(cache: CacheMap) {
  const now = Date.now()
  for (const [key, entry] of Object.entries(cache)) {
    if (!entry || now - entry.updatedAt > MAX_AGE_MS) delete cache[key]
  }
  const entries = Object.entries(cache)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, MAX_ENTRIES)
  return Object.fromEntries(entries)
}

export function loadLearnConversation(key: string, stem: string): LearnMessage[] | null {
  const cache = readCache()
  const entry = cache[key]
  if (!entry || entry.stem !== stem || !Array.isArray(entry.messages)) return null
  const messages = entry.messages
    .filter((message) => message && typeof message.content === 'string' && message.content.trim().length > 0)
    .filter((message) => message.kind !== 'search' || message.searchStatus !== 'searching')
    .map((message) => ({
      ...message,
      streaming: false,
      ...(message.toolStatus === 'running' ? { toolStatus: 'error' as const } : {}),
    }))
  return messages.length ? messages : null
}

export function saveLearnConversation(key: string, stem: string, messages: LearnMessage[]) {
  const cache = prune(readCache())
  cache[key] = {
    updatedAt: Date.now(),
    stem,
    messages: messages
      .filter((message) => message.content.trim().length > 0)
      .filter((message) => message.kind !== 'search' || message.searchStatus !== 'searching')
      .map((message) => ({
        ...message,
        streaming: false,
        ...(message.toolStatus === 'running' ? { toolStatus: 'error' as const } : {}),
      })),
  }
  writeCache(prune(cache))
}

export function clearLearnConversation(key: string) {
  const cache = readCache()
  if (cache[key]) {
    delete cache[key]
    writeCache(cache)
  }
}
