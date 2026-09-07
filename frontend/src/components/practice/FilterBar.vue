<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import type { QuestionBank, QuestionType } from '@exameow/shared'
import type { PracticeFilterComparison } from '@/utils/practiceFilter'
import { groupChapters } from '@/utils/chapters'
import BaseMultiSelect from '@/components/common/BaseMultiSelect.vue'
import { UNMARKED_DIFFICULTY, type PracticeDifficulty } from '@/utils/practiceFilter'

const props = defineProps<{
  bank: QuestionBank
  matchedCount: number
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

const chapterGroups = computed(() => groupChapters(props.bank.questions))
const hasChapters = computed(() => chapterGroups.value.some(group => group.chapter !== null))

function toggleChapter(chapter: string | null) {
  if (chapter === null) {
    emit('update:modelValue', { ...props.modelValue, includeUnchaptered: !props.modelValue.includeUnchaptered })
  } else {
    const chapters = selectedChapters.value.includes(chapter)
      ? selectedChapters.value.filter(value => value !== chapter)
      : [...selectedChapters.value, chapter]
    update('chapters', chapters)
  }
}

function clearChapters() {
  emit('update:modelValue', { ...props.modelValue, chapters: [], includeUnchaptered: false })
}

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

function update(key: keyof PracticeFilterComparison, value: any[]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

</script>

<template>
  <section class="card-outlined p-4 sm:p-5 space-y-4">
    <div>
      <h2 class="text-title-md font-bold tracking-tight" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceFilterTitle') }}
      </h2>
      <p class="text-body-sm mt-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ i18n.t('practiceSettingsSummary', { n: matchedCount }) }}
        <span class="text-xs opacity-75"> / {{ i18n.t('practiceQuestionUnit', { n: bank.questions.length }) }}</span>
      </p>
    </div>

    <fieldset v-if="hasChapters" class="space-y-2 min-w-0">
      <legend class="text-body-sm mb-2">{{ i18n.t('practiceFilterChapter') }}</legend>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-tonal !h-auto !py-2"
          :aria-pressed="!selectedChapters.length && !modelValue.includeUnchaptered"
          :style="{ outline: !selectedChapters.length && !modelValue.includeUnchaptered ? '2px solid rgb(var(--md-primary))' : undefined }"
          @click="clearChapters">
          {{ i18n.t('practiceFilterAll') }} · {{ bank.questions.length }}
        </button>
        <button v-for="group in chapterGroups" :key="JSON.stringify(group.chapter)" type="button"
          class="btn-tonal !h-auto !py-2 !whitespace-normal text-left break-words max-w-full"
          :aria-pressed="group.chapter === null ? !!modelValue.includeUnchaptered : selectedChapters.includes(group.chapter)"
          :style="{ outline: (group.chapter === null ? modelValue.includeUnchaptered : selectedChapters.includes(group.chapter)) ? '2px solid rgb(var(--md-primary))' : undefined }"
          @click="toggleChapter(group.chapter)">
          {{ group.chapter ?? i18n.t('practiceUnchaptered') }} · {{ group.count }}
        </button>
      </div>
    </fieldset>

    <div class="grid gap-3 sm:grid-cols-2">
      <label v-if="subjectOptions.length" class="space-y-1.5">
        <span class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterSubject') }}</span>
        <BaseMultiSelect :model-value="selectedSubjects" :options="subjectOptions" :placeholder="i18n.t('practiceFilterAll')" @update:model-value="update('subjects', $event)" />
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
