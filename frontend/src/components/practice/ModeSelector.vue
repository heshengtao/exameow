<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import type { PracticeMode } from '@exameow/shared'
import {
  QueueListIcon,
  ArrowPathRoundedSquareIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline'

const props = defineProps<{
  modelValue: PracticeMode | null
  hasWrongQuestions?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: PracticeMode): void
}>()

const i18n = useI18nStore()

const modes = computed(() => {
  const all = [
    {
      value: 'sequential' as PracticeMode,
      title: i18n.t('practiceModeSequential'),
      desc: i18n.t('practiceModeSequentialDesc'),
      icon: QueueListIcon,
    },
    {
      value: 'random' as PracticeMode,
      title: i18n.t('practiceModeRandom'),
      desc: i18n.t('practiceModeRandomDesc'),
      icon: ArrowPathRoundedSquareIcon,
    },
    {
      value: 'mock' as PracticeMode,
      title: i18n.t('practiceModeMock'),
      desc: i18n.t('practiceModeMockDesc'),
      icon: ClockIcon,
    },
    {
      value: 'wrong' as PracticeMode,
      title: i18n.t('wrongModeTitle'),
      desc: i18n.t('wrongModeDesc'),
      icon: ExclamationTriangleIcon,
    },
  ]
  if (!props.hasWrongQuestions) {
    return all.filter(m => m.value !== 'wrong')
  }
  return all
})

function select(mode: PracticeMode) {
  emit('update:modelValue', mode)
}

</script>

<template>
  <section class="card-outlined p-4 sm:p-5 space-y-3">
    <h3 class="text-title-md font-bold tracking-tight mb-2" :style="{ color: 'rgb(var(--md-on-surface))' }">
      {{ i18n.t('practiceSelectModeTitle') }}
    </h3>
    <button
      v-for="m in modes"
      :key="m.value"
      class="w-full text-left p-3 rounded-2xl border transition-all duration-200 flex items-center gap-3 cursor-pointer focus-visible:ring-2 focus-visible:ring-[rgb(var(--md-primary))]"
      :class="[
        props.modelValue === m.value
          ? 'border-[rgb(var(--md-primary))] bg-[rgba(var(--md-primary),0.07)] shadow-md'
          : 'border-[rgb(var(--md-outline-variant)/0.4)] bg-[rgb(var(--md-surface-container-low))] hover:bg-[rgb(var(--md-surface-container))]'
      ]"
      @click="select(m.value)"
    >
      <div
        class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200"
        :class="{ 'scale-105': props.modelValue === m.value }"
        :style="{
          backgroundColor:
            props.modelValue === m.value
              ? 'rgb(var(--md-primary-container))'
              : 'rgb(var(--md-surface-container-high))',
        }"
      >
        <component
          :is="m.icon"
          class="w-6 h-6 transition-colors duration-200"
          :style="{
            color:
              props.modelValue === m.value
                ? 'rgb(var(--md-on-primary-container))'
                : 'rgb(var(--md-on-surface-variant))',
          }"
        />
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-title-sm font-bold" :style="{ color: 'rgb(var(--md-on-surface))' }">{{ m.title }}</div>
        <div class="text-body-sm mt-0.5" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ m.desc }}</div>
      </div>
      <div
        class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        :style="{
          borderColor:
            props.modelValue === m.value
              ? 'rgb(var(--md-primary))'
              : 'rgb(var(--md-outline-variant))',
        }"
      >
        <div
          v-if="props.modelValue === m.value"
          class="w-3 h-3 rounded-full animate-spring-pop"
          :style="{ backgroundColor: 'rgb(var(--md-primary))' }"
        />
      </div>
     </button>
  </section>
</template>
