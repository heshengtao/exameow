<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { normalizeMockQuestionCount } from '@/utils/practiceFilter'
import type { QuestionType, MockExamConfig } from '@exameow/shared'
import { CheckIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  availableTypes: { type: QuestionType; label: string; count: number }[]
  config: MockExamConfig
}>()

const emit = defineEmits<{
  (e: 'update:config', v: MockExamConfig): void
}>()

const i18n = useI18nStore()
const inputErrors = reactive<Record<string, 'invalid' | 'exceeds'>>({})

const configuredTotal = computed(() => Object.values(props.config.typeCounts).reduce((sum, count) => sum + count, 0))
const availableTotal = computed(() => props.availableTypes.reduce((sum, item) => sum + item.count, 0))

function getAvailableCount(qtype: string) {
  return props.availableTypes.find(item => item.type === qtype)?.count ?? 0
}

function setCount(qtype: string, count: number) {
  const newConfig = { ...props.config, typeCounts: { ...props.config.typeCounts } }
  const normalizedCount = normalizeMockQuestionCount(count)
  const availableCount = getAvailableCount(qtype)
  if (normalizedCount === null || availableCount <= 0) {
    delete newConfig.typeCounts[qtype]
  } else {
    newConfig.typeCounts[qtype] = Math.min(normalizedCount, availableCount)
  }
  emit('update:config', newConfig)
}

function toggleType(qtype: string) {
  delete inputErrors[qtype]
  if (props.config.typeCounts[qtype]) {
    setCount(qtype, 0)
  } else {
    setCount(qtype, Math.min(5, props.availableTypes.find(t => t.type === qtype)?.count ?? 5))
  }
}

function updateInput(qtype: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (!value) {
    delete inputErrors[qtype]
    setCount(qtype, 0)
    return
  }
  const count = Number(value)
  if (normalizeMockQuestionCount(count) === null) {
    inputErrors[qtype] = 'invalid'
    setCount(qtype, 0)
    return
  }
  if (count > getAvailableCount(qtype)) {
    inputErrors[qtype] = 'exceeds'
  } else {
    delete inputErrors[qtype]
  }
  setCount(qtype, count)
}
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-title-sm" :style="{ color: 'rgb(var(--md-on-surface))' }">
      {{ i18n.t('practiceMockConfigTitle') }}
    </h3>
    <p class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
      {{ i18n.t('practiceModeMockDesc') }}
    </p>

    <div class="space-y-2">
      <div
        v-for="item in props.availableTypes"
        :key="item.type"
        class="flex items-stretch gap-2 rounded-2xl border p-2 transition-all duration-200"
        :class="props.config.typeCounts[item.type]
          ? 'border-[rgb(var(--md-primary))] bg-[rgb(var(--md-primary-container))] text-[rgb(var(--md-on-primary-container))] shadow-[var(--md-elevation-1)]'
          : 'border-[rgb(var(--md-outline-variant)/0.55)] bg-[rgb(var(--md-surface-container-low))] hover:bg-[rgb(var(--md-surface-container))]'"
      >
        <button
          type="button"
          class="ripple flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--md-primary))] active:scale-[0.99]"
          :aria-pressed="Boolean(props.config.typeCounts[item.type])"
          @click="toggleType(item.type)"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors"
            :class="props.config.typeCounts[item.type]
              ? 'border-[rgb(var(--md-primary))] bg-[rgb(var(--md-primary))] text-[rgb(var(--md-on-primary))]'
              : 'border-[rgb(var(--md-outline))]'"
            aria-hidden="true"
          >
            <CheckIcon v-if="props.config.typeCounts[item.type]" class="h-4 w-4" />
          </span>
          <span class="min-w-0">
            <span class="block break-words text-title-sm font-medium [overflow-wrap:anywhere]">{{ item.label }}</span>
            <span class="text-body-sm" :style="{ color: props.config.typeCounts[item.type] ? 'rgb(var(--md-on-primary-container))' : 'rgb(var(--md-on-surface-variant))' }">
              {{ item.count }} {{ i18n.t('practiceAvailableQuestions') }}
            </span>
          </span>
        </button>

        <div class="flex w-24 shrink-0 flex-col items-end gap-1 pr-1">
          <input
            type="number"
            :value="props.config.typeCounts[item.type] ?? ''"
            min="1"
            :max="item.count"
            :disabled="!props.config.typeCounts[item.type]"
            :aria-label="`${item.label} ${i18n.t('practiceQuestions', { n: props.config.typeCounts[item.type] ?? 0 })}`"
            :aria-invalid="Boolean(inputErrors[item.type])"
            :class="inputErrors[item.type] ? '!border-[rgb(var(--md-error))] !text-[rgb(var(--md-error))]' : ''"
            class="input-outlined !w-16 !px-2 !py-2 text-center text-sm disabled:cursor-not-allowed disabled:opacity-45"
            @input="updateInput(item.type, $event)"
          />
          <span v-if="inputErrors[item.type]" class="w-full text-right text-xs text-[rgb(var(--md-error))]" role="alert">
            {{ inputErrors[item.type] === 'exceeds' ? i18n.t('practiceMockCountExceedsAvailable') : i18n.t('practiceMockInvalidCount') }}
          </span>
          <span v-else class="hidden text-body-sm text-[rgb(var(--md-on-surface-variant))] sm:inline">
            {{ i18n.t('practiceQuestionUnitOnly') }}
          </span>
        </div>
      </div>
    </div>

    <div
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-[rgb(var(--md-surface-container-low))] px-4 py-3 text-body-sm"
      :style="{ color: 'rgb(var(--md-on-surface-variant))' }"
    >
      <span>{{ i18n.t('practiceConfiguredQuestions') }}: <strong :style="{ color: 'rgb(var(--md-on-surface))' }">{{ configuredTotal }}</strong></span>
      <span>{{ i18n.t('practiceAvailableQuestions') }}: <strong :style="{ color: 'rgb(var(--md-on-surface))' }">{{ availableTotal }}</strong></span>
    </div>
  </div>
</template>
