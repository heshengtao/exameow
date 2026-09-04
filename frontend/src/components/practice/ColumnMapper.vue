<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import type { ColumnMapping, ImportAnalysis } from '@/utils/importParser'
import { splitOptionsCell } from '@/utils/importParser'
import BaseSelect from '@/components/common/BaseSelect.vue'
import { ExclamationCircleIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  analysis: ImportAnalysis
}>()

const emit = defineEmits<{
  (e: 'apply', mapping: ColumnMapping): void
  (e: 'cancel'): void
}>()

const i18n = useI18nStore()

const m = props.analysis.mapping
const stem = ref<number | null>(m.stem)
const type = ref<number | null>(m.type)
const answer = ref<number | null>(m.answer)
const analysisCol = ref<number | null>(m.analysis)
const subjectCol = ref<number | null>(m.subject)
const chapterCol = ref<number | null>(m.chapter)
const difficultyCol = ref<number | null>(m.difficulty)
const optionCols = ref<number[]>([...m.options])
const combinedCol = ref<number | null>(m.combinedOptions)
const delimiter = ref(m.optionsDelimiter)
const mode = ref<'multi' | 'combined'>(m.combinedOptions !== null ? 'combined' : 'multi')

const missing = computed(() => new Set(props.analysis.missing))

const firstDataRow = computed(() => props.analysis.rows[0] ?? [])

function columnLabel(i: number): string {
  const header = props.analysis.headers[i] ?? `Column ${i + 1}`
  const sample = (firstDataRow.value[i] ?? '').trim()
  const short = sample.length > 24 ? sample.slice(0, 24) + '…' : sample
  return short ? `${header} — ${short}` : header
}

const columnOptions = computed(() =>
  props.analysis.headers.map((_, i) => ({ index: i, label: columnLabel(i) }))
)

const colSelectOptions = computed(() => [
  { value: null, label: i18n.t('practiceMapNone') },
  ...columnOptions.value.map((c) => ({ value: c.index, label: c.label })),
])

const canApply = computed(() => {
  if (stem.value === null || answer.value === null) return false
  if (mode.value === 'combined') return combinedCol.value !== null
  return true
})

const splitPreview = computed(() => {
  if (mode.value !== 'combined' || combinedCol.value === null) return []
  for (const row of props.analysis.rows.slice(0, 10)) {
    const cell = (row[combinedCol.value] ?? '').trim()
    if (cell) return splitOptionsCell(cell, delimiter.value || undefined)
  }
  return []
})

function toggleOptionCol(i: number) {
  const idx = optionCols.value.indexOf(i)
  if (idx >= 0) {
    optionCols.value.splice(idx, 1)
  } else {
    optionCols.value.push(i)
    optionCols.value.sort((a, b) => a - b)
  }
}

function handleApply() {
  emit('apply', {
    stem: stem.value,
    type: type.value,
    options: mode.value === 'multi' ? [...optionCols.value] : [],
    combinedOptions: mode.value === 'combined' ? combinedCol.value : null,
    optionsDelimiter: mode.value === 'combined' ? delimiter.value : '',
    answer: answer.value,
    analysis: analysisCol.value,
    subject: subjectCol.value,
    chapter: chapterCol.value,
    difficulty: difficultyCol.value,
  })
}

const selectClass = 'w-full px-3 py-2 rounded-xl text-sm bg-transparent outline-none'
const selectStyle = {
  border: '1px solid rgb(var(--md-outline-variant))',
  color: 'rgb(var(--md-on-surface))',
  backgroundColor: 'rgb(var(--md-surface-container-low))',
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h4 class="text-title-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceMapTitle') }}
      </h4>
      <p class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ i18n.t('practiceMapHint') }}
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label class="block">
        <span class="flex items-center gap-1 text-body-sm mb-1" :style="{ color: missing.has('stem') ? 'rgb(var(--md-error))' : 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceImportColStem') }}
          <span class="text-[11px]">({{ i18n.t('practiceMapRequired') }})</span>
          <ExclamationCircleIcon v-if="missing.has('stem')" class="w-3.5 h-3.5" />
        </span>
        <BaseSelect v-model="stem" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>

      <label class="block">
        <span class="flex items-center gap-1 text-body-sm mb-1" :style="{ color: missing.has('answer') ? 'rgb(var(--md-error))' : 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceImportColAnswer') }}
          <span class="text-[11px]">({{ i18n.t('practiceMapRequired') }})</span>
          <ExclamationCircleIcon v-if="missing.has('answer')" class="w-3.5 h-3.5" />
        </span>
        <BaseSelect v-model="answer" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>

      <label class="block">
        <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceImportColType') }}
        </span>
        <BaseSelect v-model="type" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>

      <label class="block">
        <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceImportColAnalysis') }}
        </span>
        <BaseSelect v-model="analysisCol" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>

      <label class="block">
        <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceImportColSubject') }}
        </span>
        <BaseSelect v-model="subjectCol" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>

      <label class="block">
        <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceImportColChapter') }}
        </span>
        <BaseSelect v-model="chapterCol" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>

      <label class="block">
        <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('genDifficulty') }}
        </span>
        <BaseSelect v-model="difficultyCol" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>
    </div>

    <div>
      <div class="flex items-center gap-1 text-body-sm mb-2" :style="{ color: missing.has('options') ? 'rgb(var(--md-error))' : 'rgb(var(--md-on-surface-variant))' }">
        {{ i18n.t('practiceMapFieldOptions') }}
        <ExclamationCircleIcon v-if="missing.has('options')" class="w-3.5 h-3.5" />
      </div>

      <div class="flex gap-4 mb-3">
        <label class="flex items-center gap-1.5 text-sm cursor-pointer" :style="{ color: 'rgb(var(--md-on-surface))' }">
          <input type="radio" value="multi" v-model="mode" class="accent-[rgb(var(--md-primary))]" />
          {{ i18n.t('practiceMapMultiColumn') }}
        </label>
        <label class="flex items-center gap-1.5 text-sm cursor-pointer" :style="{ color: 'rgb(var(--md-on-surface))' }">
          <input type="radio" value="combined" v-model="mode" class="accent-[rgb(var(--md-primary))]" />
          {{ i18n.t('practiceMapCombinedColumn') }}
        </label>
      </div>

      <div v-if="mode === 'multi'" class="flex flex-wrap gap-2">
        <button
          v-for="c in columnOptions"
          :key="c.index"
          class="px-3 py-1.5 rounded-full text-xs transition-colors max-w-full truncate"
          :style="optionCols.includes(c.index)
            ? { backgroundColor: 'rgb(var(--md-primary))', color: 'rgb(var(--md-on-primary))' }
            : { backgroundColor: 'rgb(var(--md-surface-container))', color: 'rgb(var(--md-on-surface-variant))' }"
          @click="toggleOptionCol(c.index)"
        >
          {{ c.label }}
        </button>
      </div>

      <div v-else class="space-y-3">
        <label class="block">
          <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('practiceMapFieldCombined') }}
          </span>
          <BaseSelect v-model="combinedCol" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
        </label>

        <label class="block">
          <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('practiceMapDelimiter') }}
          </span>
          <input
            v-model="delimiter"
            type="text"
            :class="selectClass"
            :style="selectStyle"
            :placeholder="i18n.t('practiceMapDelimiterAuto')"
          />
        </label>

        <div v-if="splitPreview.length > 0">
          <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('practiceMapSplitPreview') }}
          </span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="(opt, i) in splitPreview"
              :key="i"
              class="inline-block px-2 py-1 rounded-lg text-xs max-w-full truncate"
              :style="{ backgroundColor: 'rgb(var(--md-secondary-container))', color: 'rgb(var(--md-on-secondary-container))' }"
            >
              {{ String.fromCharCode(65 + i) }}. {{ opt }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <button class="btn-text flex-1" @click="emit('cancel')">
        {{ i18n.t('practiceRemoveFile') }}
      </button>
      <button class="btn-filled flex-1" :disabled="!canApply" @click="handleApply">
        {{ i18n.t('practiceMapApply') }}
      </button>
    </div>
  </div>
</template>
