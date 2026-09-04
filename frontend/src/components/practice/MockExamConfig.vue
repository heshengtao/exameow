<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { normalizeMockQuestionCount } from '@/utils/practiceFilter'
import type { QuestionType, MockExamConfig } from '@exameow/shared'

const props = defineProps<{
  availableTypes: { type: QuestionType; label: string; count: number }[]
  config: MockExamConfig
}>()

const emit = defineEmits<{
  (e: 'update:config', v: MockExamConfig): void
}>()

const i18n = useI18nStore()

function setCount(qtype: string, count: number) {
  const newConfig = { ...props.config, typeCounts: { ...props.config.typeCounts } }
  const normalizedCount = normalizeMockQuestionCount(count)
  if (normalizedCount === null) {
    delete newConfig.typeCounts[qtype]
  } else {
    newConfig.typeCounts[qtype] = Math.min(normalizedCount, props.availableTypes.find(t => t.type === qtype)?.count ?? 99)
  }
  emit('update:config', newConfig)
}

function toggleType(qtype: string) {
  if (props.config.typeCounts[qtype]) {
    setCount(qtype, 0)
  } else {
    setCount(qtype, Math.min(5, props.availableTypes.find(t => t.type === qtype)?.count ?? 5))
  }
}
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-title-sm" :style="{ color: 'rgb(var(--md-on-surface))' }">
      {{ i18n.t('practiceMockConfigTitle') }}
    </h3>

    <div v-for="item in props.availableTypes" :key="item.type" class="flex items-center gap-3">
      <button
        class="chip-filter flex-shrink-0"
        :class="{ 'chip-filter-active': !!props.config.typeCounts[item.type] }"
        @click="toggleType(item.type)"
      >
        {{ item.label }}
        <span class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-muted))' }">
          ({{ item.count }})
        </span>
      </button>

      <Transition name="scale">
        <div v-if="props.config.typeCounts[item.type]" class="flex items-center gap-2">
          <input
            type="number"
            :value="props.config.typeCounts[item.type]"
            min="1"
            :max="item.count"
            class="input-outlined !w-16 !px-2 !py-2 text-center text-sm"
            @input="setCount(item.type, Number(($event.target as HTMLInputElement).value))"
          />
          <span class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('practiceQuestions') }}
          </span>
        </div>
      </Transition>
    </div>

  </div>
</template>
