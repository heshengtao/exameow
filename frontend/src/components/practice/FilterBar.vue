<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import type { QuestionBank, QuestionType, PracticeFilter } from '@exameow/shared'
import { ArrowRightIcon } from '@heroicons/vue/24/outline'
import { matchPracticeFilter } from '@/utils/practiceFilter'

const props = defineProps<{
  bank: QuestionBank
  modelValue: PracticeFilter
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: PracticeFilter): void
  (e: 'confirm'): void
}>()

const i18n = useI18nStore()

const typeOptions = computed(() => {
  const counts: Record<string, number> = {}
  for (const q of props.bank.questions) {
    counts[q.type] = (counts[q.type] || 0) + 1
  }
  const typeKeys: Record<string, string> = {
    single_choice: 'typeSingle',
    multi_choice: 'typeMulti',
    true_false: 'typeTrueFalse',
    fill_blank: 'typeFillBlank',
    short_answer: 'typeShortAnswer',
  }
  return Object.entries(counts).map(([type, count]) => ({
    type: type as QuestionType,
    label: i18n.t(typeKeys[type] as any),
    count,
  }))
})

const subjectOptions = computed(() => {
  const set = new Set<string>()
  for (const q of props.bank.questions) {
    if (q.subject) set.add(q.subject)
  }
  return [...set]
})

const chapterOptions = computed(() => {
  const set = new Set<string>()
  const selSubjects = props.modelValue.subjects ?? []
  for (const q of props.bank.questions) {
    if (!q.chapter) continue
    if (selSubjects.length === 0) {
      set.add(q.chapter)
    } else if (!q.subject) {
      set.add(q.chapter)
    } else if (selSubjects.includes(q.subject)) {
      set.add(q.chapter)
    }
  }
  return [...set]
})

const subjectVisible = computed(() => subjectOptions.value.length > 0)
const chapterVisible = computed(() => chapterOptions.value.length > 0)

const matchedCount = computed(() => {
  const subjects = props.modelValue.subjects ?? []
  const chapters = props.modelValue.chapters ?? []
  const types = props.modelValue.types ?? []
  if (subjects.length === 0 && chapters.length === 0 && types.length === 0) {
    return props.bank.questions.length
  }
  return props.bank.questions.filter(q => matchPracticeFilter(q, props.modelValue)).length
})

const canConfirm = computed(() => matchedCount.value > 0)

function toggle(list: string[] | QuestionType[] | undefined, value: string | QuestionType): string[] | QuestionType[] | undefined {
  const arr = list ? [...list] : []
  const idx = arr.indexOf(value as any)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(value as any)
  return arr.length > 0 ? arr : undefined
}

function toggleType(value: QuestionType) {
  emit('update:modelValue', {
    ...props.modelValue,
    types: toggle(props.modelValue.types, value) as QuestionType[] | undefined,
  })
}

function toggleSubject(value: string) {
  const subjects = toggle(props.modelValue.subjects, value) as string[] | undefined
  emit('update:modelValue', {
    ...props.modelValue,
    subjects,
    chapters: undefined,
  })
}

function toggleChapter(value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    chapters: toggle(props.modelValue.chapters, value) as string[] | undefined,
  })
}

const selectedTypes = computed(() => props.modelValue.types ?? [])
const selectedSubjects = computed(() => props.modelValue.subjects ?? [])
const selectedChapters = computed(() => props.modelValue.chapters ?? [])
</script>

<template>
  <div class="space-y-5">
    <div>
      <h3 class="text-title-md font-bold tracking-tight mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceFilterTitle') }}
      </h3>
      <p class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ props.bank.name }} · {{ i18n.t('practiceQuestionUnit', { n: props.bank.questions.length }) }}
      </p>
    </div>

    <div v-if="typeOptions.length">
      <div class="text-body-sm mb-2" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterTypes') }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="opt in typeOptions"
          :key="opt.type"
          class="chip-filter"
          :class="{ 'chip-filter-active': selectedTypes.includes(opt.type) }"
          @click="toggleType(opt.type)"
        >
          {{ opt.label }} ({{ opt.count }})
        </button>
      </div>
    </div>

    <div v-if="subjectVisible">
      <div class="text-body-sm mb-2" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterSubject') }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in subjectOptions"
          :key="s"
          class="chip-filter"
          :class="{ 'chip-filter-active': selectedSubjects.includes(s) }"
          @click="toggleSubject(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div v-if="chapterVisible">
      <div class="text-body-sm mb-2" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterChapter') }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in chapterOptions"
          :key="c"
          class="chip-filter"
          :class="{ 'chip-filter-active': selectedChapters.includes(c) }"
          @click="toggleChapter(c)"
        >
          {{ c }}
        </button>
      </div>
    </div>

    <div class="flex items-center gap-3 pt-2">
      <div class="flex-1 text-body-sm" :style="{ color: canConfirm ? 'rgb(var(--md-primary))' : 'rgb(var(--md-error))' }">
        {{ canConfirm ? i18n.t('practiceFilterCount', { n: matchedCount }) : i18n.t('practiceFilterEmpty') }}
      </div>
      <button class="btn-filled" :disabled="!canConfirm" @click="emit('confirm')">
        <ArrowRightIcon class="w-4 h-4 rtl:rotate-180" />
        {{ i18n.t('practiceNextBtn') }}
      </button>
    </div>
  </div>
</template>
