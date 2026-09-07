<script setup lang="ts">
import { useConfigStore } from '@/stores/config'
import { useI18nStore } from '@/stores/i18n'
import { DEFAULT_AI_OPTIONS } from '@exameow/shared'
const store = useConfigStore()
const i18n = useI18nStore()
</script>

<template>
  <details class="card-filled p-5 sm:p-6 mb-4 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
    <summary class="cursor-pointer text-label-md font-semibold">{{ i18n.t('aiAdvanced') }}</summary>
    <p class="text-body-sm mt-3 mb-4">{{ i18n.t('aiAdvancedHint') }}</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label class="text-label-md">{{ i18n.t('aiThinking') }}
        <select v-model="store.options.thinking" class="input-outlined w-full mt-2">
          <option value="auto">{{ i18n.t('aiDefault') }}</option>
          <option value="on">{{ i18n.t('aiOn') }}</option>
          <option value="off">{{ i18n.t('aiOff') }}</option>
        </select>
      </label>
      <label class="text-label-md">{{ i18n.t('aiEffort') }}
        <select v-model="store.options.reasoning_effort" :disabled="store.options.thinking !== 'on'" class="input-outlined w-full mt-2 disabled:opacity-50">
          <option v-for="effort in ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']" :key="effort" :value="effort">{{ effort }}</option>
        </select>
      </label>
      <label class="text-label-md">{{ i18n.t('aiMaxTokens') }}
        <input v-model.number="store.options.max_tokens" type="number" min="1" max="1000000" step="1" class="input-outlined w-full mt-2" />
      </label>
      <label class="text-label-md">{{ i18n.t('aiTokenField') }}
        <select v-model="store.options.token_parameter" class="input-outlined w-full mt-2">
          <option value="max_tokens">max_tokens</option>
          <option value="max_completion_tokens">max_completion_tokens</option>
        </select>
      </label>
      <div>
        <label class="text-label-md block" for="ai-temperature">Temperature (0–2)</label>
        <input id="ai-temperature" :value="store.options.temperature ?? ''" :disabled="store.options.temperature === null" @input="store.options.temperature = ($event.target as HTMLInputElement).valueAsNumber" type="number" min="0" max="2" step="0.1" class="input-outlined w-full mt-2 disabled:opacity-50" />
        <label class="flex items-center gap-2 mt-2 text-body-sm">
          <input type="checkbox" :checked="store.options.temperature === null" @change="store.options.temperature = ($event.target as HTMLInputElement).checked ? null : 0.7" />
          {{ i18n.t('aiOmitTemperature') }}
        </label>
      </div>
      <label class="text-label-md">{{ i18n.t('aiTimeout') }}
        <input v-model.number="store.options.timeout_seconds" type="number" min="1" max="3600" step="1" class="input-outlined w-full mt-2" />
      </label>
      <label class="text-label-md">{{ i18n.t('aiRetries') }}
        <input v-model.number="store.options.retries" type="number" min="0" max="5" step="1" class="input-outlined w-full mt-2" />
      </label>
    </div>
    <p class="text-body-sm mt-3">{{ i18n.t('aiRetryHint') }}</p>
    <label class="text-label-md block mt-4">{{ i18n.t('aiPrompt') }}
      <textarea v-model="store.options.prompt" maxlength="20000" rows="5" class="input-outlined w-full mt-2" :placeholder="i18n.t('aiPromptHint')" />
    </label>
    <button type="button" class="btn-tonal mt-4" @click="store.options = { ...DEFAULT_AI_OPTIONS }">{{ i18n.t('aiReset') }}</button>
  </details>
</template>
