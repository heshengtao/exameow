import type { SearchConfig } from '@exameow/shared'

/** The active search vendor's key, falling back to the legacy single key. */
export function searchApiKeyOf(config: SearchConfig): string {
  return (config.keys?.[config.provider] ?? config.api_key ?? '').trim()
}

/** The active fetch vendor's key (Jina may legitimately be empty). */
export function fetchApiKeyOf(config: SearchConfig): string {
  return (config.keys?.[config.fetch_provider] ?? '').trim()
}
