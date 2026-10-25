<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'

import { useI18nStore } from '@/stores/i18n'
import { isCloudflare, isTauri } from '@/utils/platform'
import BaseCombobox from '@/components/common/BaseCombobox.vue'
import BaseSelect from '@/components/common/BaseSelect.vue'
import BaseSwitch from '@/components/common/BaseSwitch.vue'
import { ServerIcon, KeyIcon, CloudArrowDownIcon, CpuChipIcon, CheckCircleIcon, EyeIcon, EyeSlashIcon, CheckIcon, ArrowRightIcon, ArrowLeftIcon, CloudIcon, AdjustmentsHorizontalIcon, ChevronDownIcon, GlobeAltIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'

const configStore = useConfigStore()
const router = useRouter()
const route = useRoute()
const i18n = useI18nStore()

const advancedOpen = ref(false)
const showSearchKey = ref(false)
const showFetchKey = ref(false)
const highlightSearch = ref(false)

interface ProviderMeta {
  label: string
  url: string
}

const SEARCH_PROVIDER_META: Record<string, ProviderMeta> = {
  deepseek: { label: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys' },
  tavily: { label: 'Tavily', url: 'https://app.tavily.com/home' },
  exa: { label: 'Exa', url: 'https://dashboard.exa.ai/api-keys' },
  firecrawl: { label: 'Firecrawl', url: 'https://www.firecrawl.dev/app/api-keys' },
  bocha: { label: '博查 Bocha', url: 'https://open.bochaai.com' },
}

const FETCH_PROVIDER_META: Record<string, ProviderMeta> = {
  jina: { label: 'Jina Reader', url: 'https://jina.ai/reader/' },
  deepseek: { label: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys' },
  tavily: { label: 'Tavily', url: 'https://app.tavily.com/home' },
  exa: { label: 'Exa', url: 'https://dashboard.exa.ai/api-keys' },
  firecrawl: { label: 'Firecrawl', url: 'https://www.firecrawl.dev/app/api-keys' },
}

const searchProviderOptions = Object.entries(SEARCH_PROVIDER_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}))

const fetchProviderOptions = Object.entries(FETCH_PROVIDER_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}))

const currentSearchProvider = computed(
  () => SEARCH_PROVIDER_META[configStore.searchProvider] ?? SEARCH_PROVIDER_META.deepseek!,
)
const currentFetchProvider = computed(
  () => FETCH_PROVIDER_META[configStore.fetchProvider] ?? FETCH_PROVIDER_META.jina!,
)
const fetchKeyOptional = computed(() => configStore.fetchProvider === 'jina')

const searchResultOptions = [3, 5, 8, 10].map((value) => ({
  value,
  label: String(value),
}))

const contentCharOptions = [2000, 4000, 8000].map((value) => ({
  value,
  label: String(value),
}))

const crawlLimitOptions = [3, 5, 10].map((value) => ({
  value,
  label: String(value),
}))

const toolRoundOptions = [1, 3, 5].map((value) => ({
  value,
  label: String(value),
}))

async function openExternal(url: string) {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function openSearchConsole() {
  void openExternal(currentSearchProvider.value.url)
}

function openFetchConsole() {
  void openExternal(currentFetchProvider.value.url)
}

onMounted(async () => {
  if (route.query.section !== 'search') return
  await nextTick()
  document.getElementById('search-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightSearch.value = true
  setTimeout(() => {
    highlightSearch.value = false
  }, 1800)
})

const tokenParameterOptions = [
  { value: 'max_tokens', label: 'max_tokens' },
  { value: 'max_completion_tokens', label: 'max_completion_tokens' },
]

const reasoningEffortOptions = computed(() => [
  { value: '', label: i18n.t('configReasoningDefault') },
  ...['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'none'].map((e) => ({ value: e, label: e })),
])

const showKey = ref(false)
const saveSuccess = ref(false)
const saveError = ref('')

const configFetchError = ref('')
const configFetching = ref(false)

const showEndpointAndAuth = computed(() => {
  if (isTauri()) return true
  if (isCloudflare()) return configStore.aiProvider === 'custom'
  return configStore.aiProvider !== 'server'
})

const fetchModelsDisabled = computed(() => {
  if (isCloudflare()) return configStore.aiProvider === 'custom' && (!configStore.endpoint || !configStore.apiKey)
  if (isTauri()) return !configStore.endpoint || !configStore.apiKey
  if (configStore.aiProvider === 'server') return false
  return !configStore.endpoint || !configStore.apiKey
})

async function handleFetchModels() {
  configFetchError.value = ''
  configFetching.value = true
  try {
    await configStore.fetchModels()
    configStore.model = ''
  } catch (e: any) { configFetchError.value = e.message || String(e) } finally { configFetching.value = false }
}


async function handleSave() {
  saveError.value = ''
  try {
    await configStore.save()
    saveSuccess.value = true
    setTimeout(() => saveSuccess.value = false, 2500)
  } catch (e: any) { saveError.value = e.message || String(e) }
}
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <button class="btn-icon" @click="router.push('/mine')">
        <ArrowLeftIcon class="w-5 h-5" />
      </button>
      <div>
        <h1 class="text-display-sm font-bold tracking-tight">{{ i18n.t('configTitle') }}</h1>
      </div>
    </div>

    <!-- CF: Provider toggle -->
    <div v-if="isCloudflare()" class="card-filled p-5 mb-4 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
      <label class="text-label-md font-semibold block mb-3" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('configAiProvider') }}</label>
      <div class="flex items-center gap-3">
        <button
          class="btn-tonal text-sm !px-5 !py-2.5"
          :class="{ 'btn-filled': configStore.aiProvider === 'cf-free' }"
          @click="configStore.setProvider('cf-free')"
        >
          <CloudIcon class="w-4 h-4" />
          <span>{{ i18n.t('configCfFree') }}</span>
        </button>
        <button
          class="btn-tonal text-sm !px-5 !py-2.5"
          :class="{ 'btn-filled': configStore.aiProvider === 'custom' }"
          @click="configStore.setProvider('custom')"
        >
          <ServerIcon class="w-4 h-4" />
          <span>{{ i18n.t('configCustomApi') }}</span>
        </button>
      </div>
      <p v-if="configStore.aiProvider === 'cf-free'" class="text-body-sm mt-3" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('configCfFreeDesc') }}
      </p>
      <p v-else class="text-body-sm mt-3" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('configCustomApiDesc') }}
      </p>
    </div>

    <!-- HTTP/Web: Server env AI vs custom API -->
    <div v-if="!isCloudflare() && !isTauri()" class="card-filled p-5 mb-4 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
      <label class="text-label-md font-semibold block mb-3" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('configAiProvider') }}</label>
      <div class="flex items-center gap-3">
        <button
          v-if="configStore.serverInfo?.has_env_ai"
          class="btn-tonal text-sm !px-5 !py-2.5"
          :class="{ 'btn-filled': configStore.aiProvider === 'server' }"
          @click="configStore.setProvider('server')"
        >
          <CpuChipIcon class="w-4 h-4" />
          <span>{{ i18n.t('configServerAi') }}</span>
        </button>
        <button
          class="btn-tonal text-sm !px-5 !py-2.5"
          :class="{ 'btn-filled': configStore.aiProvider !== 'server' }"
          @click="configStore.setProvider('custom')"
        >
          <ServerIcon class="w-4 h-4" />
          <span>{{ i18n.t('configCustomApi') }}</span>
        </button>
      </div>
      <p v-if="configStore.aiProvider === 'server'" class="text-body-sm mt-3" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('configServerAiDesc') }}<template v-if="configStore.serverInfo?.endpoint"> · {{ configStore.serverInfo.endpoint }}</template>
      </p>
      <p v-else class="text-body-sm mt-3" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('configCustomApiDesc') }}
      </p>
    </div>

    <!-- Endpoint (custom API or non-CF) -->
    <div v-if="showEndpointAndAuth" class="card-filled p-5 sm:p-6 mb-4 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
      <label class="text-label-md font-semibold block mb-3" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('configSectionEndpoint') }}</label>
      <div class="relative">
        <ServerIcon class="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 z-10" style="color: rgb(var(--md-on-surface-variant))" />
        <input
          v-model="configStore.endpoint"
          placeholder="https://<your_api_url>/v1"
          class="input-outlined !pl-11 !rounded-2xl !py-3"
        />
      </div>
    </div>

    <!-- Auth (custom API or non-CF) -->
    <div v-if="showEndpointAndAuth" class="card-filled p-5 sm:p-6 mb-4 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
      <label class="text-label-md font-semibold block mb-3" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('configSectionAuth') }}</label>
      <div class="relative">
        <KeyIcon class="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 z-10" style="color: rgb(var(--md-on-surface-variant))" />
        <input
          v-model="configStore.apiKey"
          :type="showKey ? 'text' : 'password'"
          :placeholder="i18n.t('configApiKey')"
          class="input-outlined !pl-11 !pr-11 !rounded-2xl !py-3"
        />
        <button class="absolute right-3 top-1/2 -translate-y-1/2 btn-icon !w-8 !h-8" @click="showKey = !showKey">
          <EyeSlashIcon v-if="showKey" class="w-4 h-4" />
          <EyeIcon v-else class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Model -->
    <div class="card-filled p-5 sm:p-6 mb-4 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
      <label class="text-label-md font-semibold block mb-3" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('configSectionModel') }}</label>
      <div class="flex flex-col sm:flex-row items-center gap-3">
        <button
          class="btn-tonal shrink-0 text-sm !h-12 !px-4 !rounded-2xl"
          :disabled="fetchModelsDisabled"
          @click="handleFetchModels"
        >
          <CloudArrowDownIcon class="w-4 h-4" />
          <span>{{ configFetching ? '...' : i18n.t('configFetchModels') }}</span>
        </button>
        <div class="flex-1 relative w-full">
          <CpuChipIcon class="absolute left-3.5 top-3.5 w-5 h-5 z-10 pointer-events-none" style="color: rgb(var(--md-on-surface-variant))" />
          <BaseCombobox
            :model-value="configStore.model"
            :options="configStore.models.map(m => ({ value: m.id, label: m.id }))"
            :placeholder="i18n.t('configEnterModel')"
            class="[&_input]:!pl-11 [&_input]:!rounded-2xl [&_input]:!py-3"
            @update:model-value="configStore.model = $event"
          />
        </div>
      </div>
    </div>

    <!-- Web search -->
    <div
      id="search-settings"
      class="card-filled p-5 sm:p-6 mb-4 shadow-sm border transition-shadow duration-500"
      :class="highlightSearch ? 'ring-2 ring-[rgb(var(--md-primary))]' : 'border-[rgb(var(--md-outline-variant)/0.3)]'"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <div
            class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            :style="{ backgroundColor: 'rgb(var(--md-secondary-container))' }"
          >
            <GlobeAltIcon class="w-5 h-5" :style="{ color: 'rgb(var(--md-on-secondary-container))' }" />
          </div>
          <div class="min-w-0">
            <p class="text-label-md font-semibold" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ i18n.t('configSearchTitle') }}
            </p>
            <p class="text-body-sm mt-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ i18n.t('configSearchDesc') }}
            </p>
          </div>
        </div>
        <BaseSwitch
          v-model="configStore.searchEnabled"
          class="mt-1"
          :aria-label="i18n.t('configSearchEnable')"
        />
      </div>

      <Transition name="scale">
        <div v-if="configStore.searchEnabled" class="mt-5">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="text-label-md block mb-2">{{ i18n.t('configSearchProvider') }}</label>
              <BaseSelect
                :model-value="configStore.searchProvider"
                :options="searchProviderOptions"
                @update:model-value="configStore.searchProvider = $event"
              />
            </div>
            <div>
              <label class="text-label-md block mb-2">{{ i18n.t('configSearchMaxResults') }}</label>
              <BaseSelect
                :model-value="configStore.searchMaxResults"
                :options="searchResultOptions"
                @update:model-value="configStore.searchMaxResults = $event"
              />
            </div>
          </div>

          <div class="mt-4">
            <label class="text-label-md block mb-2">{{ i18n.t('configSearchApiKey') }}</label>
            <div class="relative">
              <KeyIcon
                class="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 z-10"
                :style="{ color: 'rgb(var(--md-on-surface-variant))' }"
              />
              <input
                v-model="configStore.searchApiKey"
                :type="showSearchKey ? 'text' : 'password'"
                :placeholder="i18n.t('configSearchApiKey')"
                class="input-outlined !pl-11 !pr-11 !rounded-2xl !py-3"
              />
              <button
                class="absolute right-3 top-1/2 -translate-y-1/2 btn-icon !w-8 !h-8"
                @click="showSearchKey = !showSearchKey"
              >
                <EyeSlashIcon v-if="showSearchKey" class="w-4 h-4" />
                <EyeIcon v-else class="w-4 h-4" />
              </button>
            </div>
            <p class="text-body-sm mt-2" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ i18n.t('configSearchKeyHint', { provider: currentSearchProvider.label }) }}
              <button
                type="button"
                class="underline cursor-pointer"
                :style="{ color: 'rgb(var(--md-primary))' }"
                @click="openSearchConsole"
              >{{ i18n.t('configSearchGetKey') }}</button>
            </p>
            <p
              v-if="!configStore.searchConfigured"
              class="text-body-sm mt-1"
              :style="{ color: 'rgb(var(--md-error))' }"
            >
              {{ i18n.t('configSearchKeyRequired') }}
            </p>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Web fetch + AI tools -->
    <div class="card-filled p-5 sm:p-6 mb-4 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
      <div class="flex items-start gap-3">
        <div
          class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          :style="{ backgroundColor: 'rgb(var(--md-secondary-container))' }"
        >
          <DocumentTextIcon class="w-5 h-5" :style="{ color: 'rgb(var(--md-on-secondary-container))' }" />
        </div>
        <div class="min-w-0">
          <p class="text-label-md font-semibold" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('configFetchTitle') }}
          </p>
          <p class="text-body-sm mt-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('configFetchDesc') }}
          </p>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="text-label-md block mb-2">{{ i18n.t('configFetchProvider') }}</label>
          <BaseSelect
            :model-value="configStore.fetchProvider"
            :options="fetchProviderOptions"
            @update:model-value="configStore.fetchProvider = $event"
          />
        </div>
        <div>
          <label class="text-label-md block mb-2">{{ i18n.t('configFetchMaxChars') }}</label>
          <BaseSelect
            :model-value="configStore.maxContentChars"
            :options="contentCharOptions"
            @update:model-value="configStore.maxContentChars = $event"
          />
        </div>
      </div>

      <div class="mt-4">
        <label class="text-label-md block mb-2">
          {{ i18n.t('configSearchApiKey') }}
          <span v-if="fetchKeyOptional" class="font-normal">（{{ i18n.t('configFetchKeyOptional') }}）</span>
        </label>
        <div class="relative">
          <KeyIcon
            class="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 z-10"
            :style="{ color: 'rgb(var(--md-on-surface-variant))' }"
          />
          <input
            v-model="configStore.fetchApiKey"
            :type="showFetchKey ? 'text' : 'password'"
            :placeholder="fetchKeyOptional ? i18n.t('configFetchKeyOptional') : i18n.t('configSearchApiKey')"
            class="input-outlined !pl-11 !pr-11 !rounded-2xl !py-3"
          />
          <button
            class="absolute right-3 top-1/2 -translate-y-1/2 btn-icon !w-8 !h-8"
            @click="showFetchKey = !showFetchKey"
          >
            <EyeSlashIcon v-if="showFetchKey" class="w-4 h-4" />
            <EyeIcon v-else class="w-4 h-4" />
          </button>
        </div>
        <p class="text-body-sm mt-2" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          <button
            type="button"
            class="underline cursor-pointer"
            :style="{ color: 'rgb(var(--md-primary))' }"
            @click="openFetchConsole"
          >{{ currentFetchProvider.label }}</button>
          {{ fetchKeyOptional ? i18n.t('configFetchKeyOptional') : '' }}
        </p>
        <p
          v-if="!configStore.fetchConfigured"
          class="text-body-sm mt-1"
          :style="{ color: 'rgb(var(--md-error))' }"
        >
          {{ i18n.t('configSearchKeyRequired') }}
        </p>
      </div>

      <div v-if="configStore.crawlSupported" class="mt-4">
        <label class="text-label-md block mb-2">{{ i18n.t('configFetchCrawlLimit') }}</label>
        <BaseSelect
          :model-value="configStore.crawlLimit"
          :options="crawlLimitOptions"
          @update:model-value="configStore.crawlLimit = $event"
        />
      </div>

      <div class="mt-6 pt-5 border-t border-[rgb(var(--md-outline-variant)/0.4)]">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-label-md font-semibold" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ i18n.t('configToolsTitle') }}
            </p>
            <p class="text-body-sm mt-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ i18n.t('configToolsHint') }}
            </p>
          </div>
          <BaseSwitch
            v-model="configStore.toolsEnabled"
            class="mt-1"
            :aria-label="i18n.t('configToolsEnable')"
          />
        </div>

        <div v-if="configStore.toolsEnabled" class="mt-4 max-w-xs">
          <label class="text-label-md block mb-2">{{ i18n.t('configToolsMaxRounds') }}</label>
          <BaseSelect
            :model-value="configStore.maxToolRounds"
            :options="toolRoundOptions"
            @update:model-value="configStore.maxToolRounds = $event"
          />
        </div>
      </div>
    </div>

    <!-- Advanced AI settings -->
    <div class="card-filled p-5 sm:p-6 mb-4 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
      <button
        type="button"
        class="w-full flex items-center gap-3 text-left cursor-pointer"
        :aria-expanded="advancedOpen"
        aria-controls="advanced-ai-panel"
        @click="advancedOpen = !advancedOpen"
      >
        <AdjustmentsHorizontalIcon class="w-5 h-5 shrink-0" style="color: rgb(var(--md-on-surface-variant))" />
        <span class="flex-1 text-label-md font-semibold" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('configAdvancedAI') }}</span>
        <ChevronDownIcon
          class="w-5 h-5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          :class="{ 'rotate-180': advancedOpen }"
          style="color: rgb(var(--md-on-surface-variant))"
        />
      </button>

      <Transition name="scale">
        <div v-if="advancedOpen" id="advanced-ai-panel">
          <p class="text-body-sm mt-3 mb-4" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('configAdvancedAIHint') }}</p>

          <!-- 输出上限 -->
          <p class="text-label-md font-semibold mb-3" style="color: rgb(var(--md-on-surface))">{{ i18n.t('configGroupOutput') }}</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label class="text-label-md block">{{ i18n.t('configMaxTokens') }}
              <input
                :value="configStore.maxTokens ?? ''"
                type="number"
                min="1"
                step="1"
                class="input-outlined w-full mt-2 text-sm"
                :placeholder="i18n.t('configMaxTokensHint')"
                @input="(e: Event) => {
                  const v = (e.target as HTMLInputElement).value
                  configStore.maxTokens = v === '' ? null : Math.max(1, Math.floor(Number(v)) || 1)
                }"
              />
            </label>
            <div>
              <label class="text-label-md block">{{ i18n.t('configTokenParameter') }}</label>
              <BaseSelect
                class="mt-2 [&>button]:!rounded-xl"
                :model-value="configStore.tokenParameter"
                :options="tokenParameterOptions"
                @update:model-value="configStore.tokenParameter = $event"
              />
            </div>
          </div>

          <div class="divider my-5" />

          <!-- 采样与思考 -->
          <p class="text-label-md font-semibold mb-3" style="color: rgb(var(--md-on-surface))">{{ i18n.t('configGroupSampling') }}</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="text-label-md block">{{ i18n.t('configTemperature') }}</label>
              <input
                :value="configStore.temperature ?? ''"
                type="number"
                min="0"
                max="2"
                step="0.1"
                class="input-outlined w-full mt-2 text-sm"
                :placeholder="i18n.t('configOmitTemperature')"
                @input="(e: Event) => {
                  const raw = (e.target as HTMLInputElement).value
                  if (raw === '') { configStore.temperature = null; return }
                  const v = Number(raw)
                  configStore.temperature = Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : 0.7
                }"
              />
            </div>
            <div>
              <label class="text-label-md block">{{ i18n.t('configReasoningEffort') }}</label>
              <BaseSelect
                class="mt-2 [&>button]:!rounded-xl"
                :model-value="configStore.reasoningEffort"
                :options="reasoningEffortOptions"
                @update:model-value="configStore.reasoningEffort = $event"
              />
            </div>
          </div>

          <div class="divider my-5" />

          <!-- 可靠性 -->
          <p class="text-label-md font-semibold mb-3" style="color: rgb(var(--md-on-surface))">{{ i18n.t('configGroupReliability') }}</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label class="text-label-md block">{{ i18n.t('configRetries') }}
              <input v-model.number="configStore.retries" type="number" min="0" max="5" step="1" class="input-outlined w-full mt-2 text-sm" />
            </label>
            <label class="text-label-md block">{{ i18n.t('configTimeout') }}
              <input
                :value="configStore.timeoutSeconds ?? ''"
                type="number"
                min="1"
                max="3600"
                step="1"
                class="input-outlined w-full mt-2 text-sm"
                @input="(e: Event) => {
                  const v = (e.target as HTMLInputElement).value
                  configStore.timeoutSeconds = v === '' ? null : Math.min(3600, Math.max(1, Math.floor(Number(v)) || 1))
                }"
              />
            </label>
          </div>

          <div class="divider my-5" />

          <!-- 补充 Prompt -->
          <p class="text-label-md font-semibold mb-3" style="color: rgb(var(--md-on-surface))">{{ i18n.t('configGroupPrompt') }}</p>
          <label class="text-label-md block">{{ i18n.t('configExtraPrompt') }}
            <textarea
              v-model="configStore.extraPrompt"
              maxlength="20000"
              rows="4"
              class="input-outlined w-full mt-2 text-sm"
              :placeholder="i18n.t('configExtraPromptHint')"
            />
          </label>
          <p class="text-body-sm mt-3" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('configRetryHint') }}</p>
        </div>
      </Transition>
    </div>

    <Transition name="scale">
      <div
        v-if="configFetchError"
        class="mb-4 px-4 py-3 rounded-2xl text-sm flex items-center gap-2"
        style="background-color: rgb(var(--md-error-container)); color: rgb(var(--md-on-error-container))"
      >
        <span>{{ configFetchError }}</span>
      </div>
    </Transition>

    <!-- ========= Unified Save + CTA ========= -->
    <div class="flex items-center justify-center gap-3 mt-8">
      <button class="btn-filled !h-12 !px-8 shadow-md" :disabled="!configStore.configured" @click="handleSave">
        <CheckIcon class="w-5 h-5" />
        <span>{{ i18n.t('configSave') }}</span>
      </button>

      <button
        class="btn-tonal !h-12 !px-8 shadow-sm"
        :disabled="!configStore.configured"
        @click="router.push('/generate')"
      >
        <span>{{ i18n.t('configReadyCta') }}</span>
        <ArrowRightIcon class="w-5 h-5" />
      </button>

      <Transition name="fade">
        <div v-if="saveSuccess" class="flex items-center gap-2 text-sm font-medium" style="color: rgb(var(--md-primary))">
          <CheckCircleIcon class="w-5 h-5" /> {{ i18n.t('configSaved') }}
        </div>
      </Transition>
    </div>

    <Transition name="scale">
      <div
        v-if="saveError"
        class="mt-4 px-4 py-3 rounded-2xl text-sm"
        style="background-color: rgb(var(--md-error-container)); color: rgb(var(--md-on-error-container))"
      >
        {{ saveError }}
      </div>
    </Transition>
  </div>
</template>
