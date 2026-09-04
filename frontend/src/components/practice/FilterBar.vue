<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import type { QuestionBank, QuestionType } from '@exameow/shared'
import type { PracticeFilterComparison } from '@/utils/practiceFilter'
import BaseMultiSelect from '@/components/common/BaseMultiSelect.vue'
import { matchPracticeFilter, UNMARKED_DIFFICULTY, type PracticeDifficulty } from '@/utils/practiceFilter'

const props = defineProps<{
  bank: QuestionBank
  modelValue: PracticeFilterComparison
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: PracticeFilterComparison): void
}>()

const i18n = useI18nStore()

const typeKeys: Record<string, string> = {
  single_choice: 'typeSingle',
  multi_choice: 'typeMulti',
  true_false: 'typeTrueFalse',
  fill_blank: 'typeFillBlank',
  short_answer: 'typeShortAnswer',
}

const typeOptions = computed(() => {
  const counts: Record<string, number> = {}
  for (const q of props.bank.questions) counts[q.type] = (counts[q.type] || 0) + 1
  return Object.entries(counts).map(([type, count]) => ({
    value: type as QuestionType,
    label: i18n.t(typeKeys[type] as any),
    hint: String(count),
  }))
})

const subjectOptions = computed(() => [...new Set(props.bank.questions.flatMap(q => q.subject ? [q.subject] : []))]
  .map(value => ({ value, label: value })))

const chapterOptions = computed(() => {
  const subjects = props.modelValue.subjects ?? []
  const chapters = new Set<string>()
  for (const q of props.bank.questions) {
    if (!q.chapter) continue
    if (subjects.length === 0 || !q.subject || subjects.includes(q.subject)) chapters.add(q.chapter)
  }
  return [...chapters].map(value => ({ value, label: value }))
})

const difficultyOptions = computed(() => [
  { value: 'easy' as PracticeDifficulty, label: i18n.t('diffEasy') },
  { value: 'medium' as PracticeDifficulty, label: i18n.t('diffMedium') },
  { value: 'hard' as PracticeDifficulty, label: i18n.t('diffHard') },
  { value: UNMARKED_DIFFICULTY, label: i18n.t('practiceFilterUnmarked') },
])

const selectedSubjects = computed(() => props.modelValue.subjects ?? [])
const selectedChapters = computed(() => props.modelValue.chapters ?? [])
const selectedDifficulties = computed(() => (props.modelValue.difficulties ?? []) as PracticeDifficulty[])
const selectedTypes = computed(() => props.modelValue.types ?? [])

const matchedCount = computed(() => props.bank.questions.filter(q => matchPracticeFilter(q, props.modelValue)).length)

function update(key: keyof PracticeFilterComparison, value: any[]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

watch(chapterOptions, (options) => {
  const valid = new Set(options.map(o => o.value))
  const chapters = selectedChapters.value.filter(chapter => valid.has(chapter))
  if (chapters.length !== selectedChapters.value.length) update('chapters', chapters)
})
</script>

<template>
  <section class="card-outlined p-4 sm:p-5 space-y-4">
    <div>
      <h2 class="text-title-md font-bold tracking-tight" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceFilterTitle') }}
      </h2>
      <p class="text-body-sm mt-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ i18n.t('practiceSettingsSummary', { n: matchedCount }) }}
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <label v-if="subjectOptions.length" class="space-y-1.5">
        <span class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterSubject') }}</span>
        <BaseMultiSelect :model-value="selectedSubjects" :options="subjectOptions" :placeholder="i18n.t('practiceFilterAll')" @update:model-value="update('subjects', $event)" />
      </label>
      <label v-if="chapterOptions.length" class="space-y-1.5">
        <span class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterChapter') }}</span>
        <BaseMultiSelect :model-value="selectedChapters" :options="chapterOptions" :placeholder="i18n.t('practiceFilterAll')" @update:model-value="update('chapters', $event)" />
      </label>
      <label class="space-y-1.5">
        <span class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterDifficulty') }}</span>
        <BaseMultiSelect :model-value="selectedDifficulties" :options="difficultyOptions" :placeholder="i18n.t('practiceFilterAll')" @update:model-value="update('difficulties', $event)" />
      </label>
      <label v-if="typeOptions.length" class="space-y-1.5">
        <span class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterTypes') }}</span>
        <BaseMultiSelect :model-value="selectedTypes" :options="typeOptions" :placeholder="i18n.t('practiceFilterAll')" @update:model-value="update('types', $event)" />
      </label>
    </div>

    <div class="text-body-sm" :style="{ color: matchedCount ? 'rgb(var(--md-primary))' : 'rgb(var(--md-error))' }">
      {{ matchedCount ? i18n.t('practiceFilterCount', { n: matchedCount }) : i18n.t('practiceFilterEmpty') }}
    </div>
  </section>
</template>
