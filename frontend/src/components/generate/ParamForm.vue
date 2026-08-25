<script setup lang="ts">
import { useExamStore } from '@/stores/exam'
import { useI18nStore } from '@/stores/i18n'
import { SUPPORTED_LOCALES } from '@/i18n/locales'
import { QuestionType, Difficulty } from '@exameow/shared'
import BaseSelect from '@/components/common/BaseSelect.vue'
import { ChartBarIcon, LanguageIcon } from '@heroicons/vue/24/outline'

const store = useExamStore()
const i18n = useI18nStore()

const typeOptions = [
  { title: 'typeSingle', value: QuestionType.SingleChoice },
  { title: 'typeMulti', value: QuestionType.MultiChoice },
  { title: 'typeTrueFalse', value: QuestionType.TrueFalse },
  { title: 'typeFillBlank', value: QuestionType.FillBlank },
  { title: 'typeShortAnswer', value: QuestionType.ShortAnswer },
]

const difficultyOptions = [
  { title: 'diffEasy', value: Difficulty.Easy },
  { title: 'diffMedium', value: Difficulty.Medium },
  { title: 'diffHard', value: Difficulty.Hard },
]

function toggleType(type: QuestionType) {
  const idx = store.questionTypes.indexOf(type)
  if (idx >= 0) { store.questionTypes.splice(idx, 1); store.typeCounts[type] = 0 }
  else { store.questionTypes.push(type); store.typeCounts[type] = 5 }
}
</script>

<template>
  <div class="card-filled p-5 sm:p-6 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]">
    <label class="text-label-md font-semibold tracking-wide block mb-3" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('genQuestionTypes') }}</label>

    <!-- Filter Chips -->
    <div class="flex flex-wrap gap-2 mb-5">
      <button
        v-for="opt in typeOptions"
        :key="opt.value"
        class="chip-filter !rounded-full !h-9 !px-4 text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-95 cursor-pointer"
        :class="{ 'chip-filter-active shadow-sm': store.questionTypes.includes(opt.value) }"
        @click="toggleType(opt.value)"
      >
        <span>{{ i18n.t(opt.title as any) }}</span>
      </button>
    </div>

    <!-- Per-type counts -->
    <TransitionGroup name="list" tag="div" class="space-y-2.5 mb-5">
      <div
        v-for="type in store.questionTypes"
        :key="type"
        class="flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 shadow-sm border border-[rgb(var(--md-outline-variant)/0.3)]"
        :style="{ backgroundColor: 'rgb(var(--md-surface-container-low))' }"
      >
        <span
          class="inline-flex items-center px-3.5 h-8 rounded-full text-xs font-bold shadow-xs !cursor-default"
          :style="{ backgroundColor: 'rgb(var(--md-primary-container))', color: 'rgb(var(--md-on-primary-container))' }"
        >
          {{ i18n.t(typeOptions.find(o => o.value === type)?.title as any) }}
        </span>
        <span class="text-body-md font-medium flex-1" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('genQuestions') }}</span>
        <input
          :value="store.typeCounts[type] || 0"
          type="number"
          min="1"
          max="999"
          class="w-20 text-center font-bold text-base px-3 py-1.5 rounded-xl border outline-none transition-all duration-200 focus:ring-2 focus:ring-[rgb(var(--md-primary))]"
          :style="{
            backgroundColor: 'rgb(var(--md-surface-container-lowest))',
            borderColor: 'rgb(var(--md-outline-variant))',
            color: 'rgb(var(--md-on-surface))',
          }"
          @input="(e: Event) => { const v = parseInt((e.target as HTMLInputElement).value) || 0; store.typeCounts[type] = Math.max(0, v) }"
        />
      </div>
    </TransitionGroup>

    <div class="divider my-5" />

    <!-- Options -->
    <div class="grid grid-cols-2 gap-4">
      <div class="relative">
        <label class="text-label-md font-semibold tracking-wide block mb-2" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('genDifficulty') }}</label>
        <div class="relative">
          <ChartBarIcon class="absolute left-3 top-3 w-5 h-5 z-10 pointer-events-none" style="color: rgb(var(--md-on-surface-variant))" />
          <BaseSelect
            :model-value="store.difficulty"
            :options="difficultyOptions.map(d => ({ value: d.value, label: i18n.t(d.title as any) }))"
            class="[&>button]:!pl-10 [&>button]:!rounded-xl"
            @update:model-value="store.difficulty = $event"
          />
        </div>
      </div>

      <div class="relative">
        <label class="text-label-md font-semibold tracking-wide block mb-2" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('genLanguage') }}</label>
        <div class="relative">
          <LanguageIcon class="absolute left-3 top-3 w-5 h-5 z-10 pointer-events-none" style="color: rgb(var(--md-on-surface-variant))" />
          <BaseSelect
            :model-value="store.language"
            :options="SUPPORTED_LOCALES.map(l => ({
              value: l.code === 'zh' ? 'zh-CN' : l.code === 'en' ? 'en-US' : l.code,
              label: l.nativeName
            }))"
            class="[&>button]:!pl-10 [&>button]:!rounded-xl"
            @update:model-value="store.language = $event"
          />
        </div>
      </div>

      <div class="col-span-2">
        <label class="text-label-md font-semibold tracking-wide block mb-2" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('genSubject') }}</label>
        <input
          v-model="store.subject"
          :placeholder="i18n.t('genSubjectPlaceholder')"
          class="input-outlined text-sm !py-3 !rounded-xl"
        />
      </div>

      <div class="col-span-2">
        <label class="text-label-md font-semibold tracking-wide block mb-2" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('genTopic') }}</label>
        <input
          v-model="store.topicFilter"
          :placeholder="i18n.t('genTopicPlaceholder')"
          class="input-outlined text-sm !py-3 !rounded-xl"
        />
      </div>
    </div>
  </div>
</template>
