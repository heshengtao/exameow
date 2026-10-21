import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { AIConfig, ChatToolConfig, ChatToolName, ChatToolOptions, FetchProvider, ModelInfo, ReasoningEffort, SearchConfig, SearchProvider, TokenParameter, VendorId } from '@exameow/shared'
import { api } from '@/api'
import { isCloudflare, isTauri } from '@/utils/platform'
import type { ServerConfigInfo } from '@/api/http'

import { DEFAULT_CF_MODEL } from '@/api/cf-models'
import { fetchModelsFromEndpoint } from '@/utils/modelList'
import { normalizeEndpoint, withV1Suffix } from '@/utils/endpoint'

export type AIProvider = 'cf-free' | 'custom' | 'server'

const SEARCH_PROVIDERS: SearchProvider[] = ['tavily', 'deepseek', 'exa', 'firecrawl', 'bocha']
const FETCH_PROVIDERS: FetchProvider[] = ['deepseek', 'tavily', 'jina', 'exa', 'firecrawl']
const CRAWL_PROVIDERS: FetchProvider[] = ['tavily']

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function sanitizeKeys(raw: unknown): Partial<Record<VendorId, string>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Record<VendorId, string>> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim()) out[key as VendorId] = value
  }
  return out
}

export const useConfigStore = defineStore('config', () => {
  const endpoint = ref('')
  const apiKey = ref('')
  const model = ref('')
  const maxTokens = ref<number | null>(null)
  const tokenParameter = ref<TokenParameter>('max_tokens')
  const temperature = ref<number | null>(0.7)
  const reasoningEffort = ref<ReasoningEffort | ''>('')
  const extraPrompt = ref('')
  const retries = ref(0)
  const timeoutSeconds = ref<number | null>(null)
  const models = ref<ModelInfo[]>([])
  const loading = ref(false)
  const aiProvider = ref<AIProvider>('cf-free')
  const serverInfo = ref<ServerConfigInfo | null>(null)
  const searchEnabled = ref(false)
  const searchProvider = ref<SearchProvider>('tavily')
  const searchKeys = ref<Partial<Record<VendorId, string>>>({})
  const searchMaxResults = ref(5)
  const fetchProvider = ref<FetchProvider>('jina')
  const maxContentChars = ref(4000)
  const crawlLimit = ref(5)
  const toolsEnabled = ref(false)
  const maxToolRounds = ref(3)

  /** Per-vendor keys are exposed as the active provider's key so switching never overwrites. */
  const searchApiKey = computed({
    get: () => searchKeys.value[searchProvider.value] ?? '',
    set: (value: string) => {
      searchKeys.value = { ...searchKeys.value, [searchProvider.value]: value }
    },
  })
  const fetchApiKey = computed({
    get: () => searchKeys.value[fetchProvider.value] ?? '',
    set: (value: string) => {
      searchKeys.value = { ...searchKeys.value, [fetchProvider.value]: value }
    },
  })

  const configured = computed(() => {
    if (!isCloudflare() && !isTauri() && aiProvider.value === 'server') {
      return true
    }
    if (!isCloudflare()) {
      return !!endpoint.value && !!apiKey.value && !!model.value
    }
    if (aiProvider.value === 'cf-free') {
      return !!model.value
    }
    return !!endpoint.value && !!apiKey.value && !!model.value
  })

  const searchConfigured = computed(
    () => searchEnabled.value && searchApiKey.value.trim().length > 0,
  )
  const fetchConfigured = computed(
    () => fetchProvider.value === 'jina' || fetchApiKey.value.trim().length > 0,
  )
  const crawlSupported = computed(() => CRAWL_PROVIDERS.includes(fetchProvider.value))

  async function loadSaved() {
    const saved = await api.loadConfig()
    if (saved) {
      if (saved.endpoint) endpoint.value = saved.endpoint
      if (saved.api_key) apiKey.value = saved.api_key
      model.value = saved.model
      maxTokens.value = typeof saved.max_tokens === 'number' ? saved.max_tokens : null
      tokenParameter.value = saved.token_parameter === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens'
      if (typeof saved.temperature === 'number') temperature.value = saved.temperature
      else if (saved.omit_temperature === true) temperature.value = null
      reasoningEffort.value = saved.reasoning_effort ?? ''
      extraPrompt.value = saved.extra_prompt ?? ''
      retries.value = typeof saved.retries === 'number' ? saved.retries : 0
      timeoutSeconds.value = typeof saved.timeout_seconds === 'number' ? saved.timeout_seconds : null
      if (saved.search) {
        searchEnabled.value = saved.search.enabled === true
        searchProvider.value = SEARCH_PROVIDERS.includes(saved.search.provider as SearchProvider)
          ? (saved.search.provider as SearchProvider)
          : 'tavily'
        searchKeys.value = sanitizeKeys(saved.search.keys)
        if (!searchKeys.value[searchProvider.value] && saved.search.api_key) {
          searchKeys.value = {
            ...searchKeys.value,
            [searchProvider.value]: saved.search.api_key,
          }
        }
        searchMaxResults.value = clampInt(saved.search.max_results, 1, 10, 5)
        fetchProvider.value = FETCH_PROVIDERS.includes(saved.search.fetch_provider as FetchProvider)
          ? (saved.search.fetch_provider as FetchProvider)
          : 'jina'
        maxContentChars.value = clampInt(saved.search.max_content_chars, 500, 20000, 4000)
        crawlLimit.value = clampInt(saved.search.crawl_limit, 1, 10, 5)
        toolsEnabled.value = saved.search.tools_enabled === true
        maxToolRounds.value = clampInt(saved.search.max_tool_rounds, 1, 5, 3)
      }
    }
    if (isCloudflare()) {
      const provider = localStorage.getItem('exameow_ai_provider')
      if (provider === 'custom' || provider === 'cf-free') {
        aiProvider.value = provider
      }
      if (!model.value) {
        endpoint.value = 'cloudflare-worker'
        apiKey.value = 'cloudflare-worker'
      }
      return
    }
    if (isTauri()) return
    serverInfo.value = await api.getServerInfo()
    const storedProvider = localStorage.getItem('exameow_ai_provider')
    if (storedProvider === 'server' && serverInfo.value?.has_env_ai) {
      aiProvider.value = 'server'
      if (!model.value && serverInfo.value?.model) model.value = serverInfo.value.model
      return
    }
    if (endpoint.value || apiKey.value || model.value) return
    if (serverInfo.value?.has_env_ai) {
      aiProvider.value = 'server'
      if (serverInfo.value.model) model.value = serverInfo.value.model
      localStorage.setItem('exameow_ai_provider', 'server')
    }
  }

  async function fetchModels() {
    loading.value = true
    try {
      if (isCloudflare() && aiProvider.value === 'cf-free') {
        models.value = await api.getModels({ endpoint: '', api_key: '', model: '' })
        return
      }
      if (!isCloudflare() && !isTauri() && aiProvider.value === 'server') {
        models.value = await api.getModels({ endpoint: '', api_key: '', model: '' })
        return
      }
      endpoint.value = normalizeEndpoint(endpoint.value)
      if (!endpoint.value || !apiKey.value) return
      try {
        if (isCloudflare() && aiProvider.value === 'custom') {
          models.value = await fetchModelsFromEndpoint(endpoint.value, apiKey.value)
        } else {
          models.value = await api.getModels({ endpoint: endpoint.value, api_key: apiKey.value, model: '' })
        }
      } catch (firstError) {
        const candidate = withV1Suffix(endpoint.value)
        if (!candidate) throw firstError
        if (isCloudflare() && aiProvider.value === 'custom') {
          models.value = await fetchModelsFromEndpoint(candidate, apiKey.value)
        } else {
          models.value = await api.getModels({ endpoint: candidate, api_key: apiKey.value, model: '' })
        }
        endpoint.value = candidate
      }
    } catch (e: any) {
      throw new Error(e.message || String(e))
    } finally {
      loading.value = false
    }
  }

  async function save() {
    localStorage.setItem('exameow_ai_provider', aiProvider.value)
    if (!isCloudflare() && !isTauri() && aiProvider.value === 'server') {
      // Server-provided AI needs no key, but web-search settings still need to persist.
      const existing = await api.loadConfig()
      await api.saveConfig({ ...(existing ?? buildConfig()), search: buildSearchConfig() })
      return
    }
    endpoint.value = normalizeEndpoint(endpoint.value)
    await api.saveConfig(buildConfig())
  }

  function buildConfig(): AIConfig {
    return {
      endpoint: endpoint.value,
      api_key: apiKey.value,
      model: model.value,
      max_tokens: maxTokens.value ?? undefined,
      token_parameter: tokenParameter.value,
      temperature: temperature.value ?? undefined,
      omit_temperature: temperature.value === null,
      reasoning_effort: reasoningEffort.value || undefined,
      extra_prompt: extraPrompt.value.trim() || undefined,
      retries: retries.value,
      timeout_seconds: timeoutSeconds.value ?? undefined,
      search: buildSearchConfig(),
    }
  }

  function buildSearchConfig(): SearchConfig {
    return {
      enabled: searchEnabled.value,
      provider: searchProvider.value,
      max_results: clampInt(searchMaxResults.value, 1, 10, 5),
      fetch_provider: fetchProvider.value,
      max_content_chars: clampInt(maxContentChars.value, 500, 20000, 4000),
      crawl_limit: clampInt(crawlLimit.value, 1, 10, 5),
      keys: { ...searchKeys.value },
      tools_enabled: toolsEnabled.value,
      max_tool_rounds: clampInt(maxToolRounds.value, 1, 5, 3),
    }
  }

  function getSearchConfig(): SearchConfig | null {
    if (!searchConfigured.value) return null
    return buildSearchConfig()
  }

  function getSearchSettings(): SearchConfig {
    return buildSearchConfig()
  }

  function getToolOptions(): ChatToolOptions | null {
    if (!toolsEnabled.value) return null
    const searchKey = searchApiKey.value.trim()
    const names: ChatToolName[] = []
    if (searchKey) names.push('web_search')
    if (fetchConfigured.value) {
      names.push('web_fetch')
      if (crawlSupported.value) names.push('web_crawl')
    }
    if (names.length === 0) return null

    const config: ChatToolConfig = {
      max_rounds: clampInt(maxToolRounds.value, 1, 5, 3),
    }
    if (searchKey) {
      config.search = {
        provider: searchProvider.value,
        api_key: searchKey,
        max_results: clampInt(searchMaxResults.value, 1, 10, 5),
      }
    }
    if (fetchConfigured.value) {
      config.fetch = {
        provider: fetchProvider.value,
        api_key: fetchApiKey.value.trim(),
        max_chars: clampInt(maxContentChars.value, 500, 20000, 4000),
        crawl_limit: clampInt(crawlLimit.value, 1, 10, 5),
      }
    }
    return { names, config }
  }

  function getConfig(): AIConfig {
    if (!isCloudflare() && !isTauri() && aiProvider.value === 'server') {
      return { ...buildConfig(), endpoint: '', api_key: '' }
    }
    return buildConfig()
  }

  function setProvider(provider: AIProvider) {
    aiProvider.value = provider
    models.value = []
    if (provider === 'cf-free' && !model.value) {
      model.value = DEFAULT_CF_MODEL
    }
    if (provider === 'server' && !model.value && serverInfo.value?.model) {
      model.value = serverInfo.value.model
    }
  }

  return {
    endpoint,
    apiKey,
    model,
    maxTokens,
    tokenParameter,
    temperature,
    reasoningEffort,
    extraPrompt,
    retries,
    timeoutSeconds,
    models,
    loading,
    configured,
    aiProvider,
    serverInfo,
    searchEnabled,
    searchProvider,
    searchApiKey,
    searchMaxResults,
    fetchProvider,
    fetchApiKey,
    maxContentChars,
    crawlLimit,
    crawlSupported,
    toolsEnabled,
    maxToolRounds,
    searchConfigured,
    fetchConfigured,
    loadSaved,
    fetchModels,
    save,
    getConfig,
    getSearchConfig,
    getSearchSettings,
    getToolOptions,
    setProvider,
  }
})
