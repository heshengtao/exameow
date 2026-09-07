<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { usePracticeStore } from '@/stores/practice'
import { groupChapters } from '@/utils/chapters'
import ColumnMapper from '@/components/practice/ColumnMapper.vue'
import type { ColumnMapping } from '@/utils/importParser'
import {
  XMarkIcon,
  DocumentArrowUpIcon,
} from '@heroicons/vue/24/outline'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', count: number): void
}>()

const i18n = useI18nStore()
const practiceStore = usePracticeStore()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const parsing = ref(false)
const parseError = ref('')
const chapterGroups = computed(() => groupChapters(practiceStore.importPreview ?? []))

const previewHeaders = computed(() => {
  const qs = practiceStore.importPreview
  if (!qs || qs.length === 0) return null
  const first = qs[0]
  const headers: string[] = []
  if (first) {
    headers.push(i18n.t('practiceImportColStem'))
    if (first.options.length > 0) headers.push(i18n.t('tableOptions'))
    headers.push(i18n.t('practiceImportColAnswer'))
    if (first.analysis) headers.push(i18n.t('practiceImportColAnalysis'))
  }
  return headers
})

const previewData = computed(() => {
  const qs = practiceStore.importPreview
  if (!qs) return []
  return qs.slice(0, 5).map(q => {
    const typeLabels: Record<string, string> = {
      single_choice: '单选',
      multi_choice: '多选',
      true_false: '判断',
      fill_blank: '填空',
      short_answer: '简答',
    }
    return {
      type: typeLabels[q.type] ?? q.type,
      stem: q.stem.length > 40 ? q.stem.slice(0, 40) + '...' : q.stem,
      options: q.options.join(' / '),
      answer: q.answer.length > 20 ? q.answer.slice(0, 20) + '...' : q.answer,
      analysis: q.analysis.length > 20 ? q.analysis.slice(0, 20) + '...' : q.analysis,
    }
  })
})

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  parseError.value = ''

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
    parseError.value = 'Unsupported file type'
    return
  }

  selectedFile.value = file
  parsing.value = true

  try {
    const buffer = await file.arrayBuffer()
    if (ext === 'csv') {
      const text = new TextDecoder().decode(buffer)
      await practiceStore.importCSV(text, file.name)
    } else {
      await practiceStore.importExcelFile(buffer, file.name)
    }
  } catch {
    parseError.value = i18n.t('practiceImportFail')
  } finally {
    parsing.value = false
  }
}

function removeFile() {
  selectedFile.value = null
  parseError.value = ''
  practiceStore.cancelImport()
  if (fileInput.value) fileInput.value.value = ''
}

function handleMappingApply(mapping: ColumnMapping) {
  practiceStore.applyImportMapping(mapping)
}

function handleConfirm() {
  const count = practiceStore.importPreview?.length ?? 0
  practiceStore.confirmImport()
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
  emit('imported', count)
}

</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-title-sm" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceImportDialogTitle') }}
      </h3>
      <button class="btn-icon !w-8 !h-8" @click="$emit('close')">
        <XMarkIcon class="w-5 h-5" />
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".csv,.xlsx,.xls"
      class="hidden"
      @change="handleFileSelect"
    />

    <div
      v-if="!selectedFile"
      class="card-outlined p-6 text-center cursor-pointer hover:border-[rgb(var(--md-primary))] transition-colors"
      @click="fileInput?.click()"
    >      <DocumentArrowUpIcon class="w-10 h-10 mx-auto mb-3" :style="{ color: 'rgb(var(--md-on-surface-muted))' }" />
      <div class="text-title-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceChooseFile') }}
      </div>
      <div class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ i18n.t('practiceFileHint') }}
      </div>
    </div>

    <div v-if="parsing" class="text-center py-4">
      <div class="progress-indeterminate mb-3" />
      <span class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ i18n.t('practiceImportParsing') }}
      </span>
    </div>

    <div v-if="parseError" class="card-outlined p-3 text-center" :style="{ borderColor: 'rgb(var(--md-error))', color: 'rgb(var(--md-error))' }">
      {{ parseError }}
    </div>

    <ColumnMapper
      v-if="practiceStore.importAnalysis && !parsing"
      :analysis="practiceStore.importAnalysis"
      @apply="handleMappingApply"
      @cancel="removeFile"
    />

    <div
      v-else-if="selectedFile && !parsing && practiceStore.importPreview && practiceStore.importPreview.length === 0"
      class="card-outlined p-3 text-center"
      :style="{ borderColor: 'rgb(var(--md-error))', color: 'rgb(var(--md-error))' }"
    >
      {{ i18n.t('practiceImportFail') }}
    </div>

    <p class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceChapterImportHint') }}</p>

    <template v-if="practiceStore.importPreview && practiceStore.importPreview.length > 0 && !parsing">
      <div class="flex items-center justify-between">
        <span class="text-title-sm" :style="{ color: 'rgb(var(--md-on-surface))' }">
           {{ i18n.t('practiceImportCount', { n: practiceStore.importPreview.length }) }}
        </span>
        <button class="btn-text text-sm" :style="{ color: 'rgb(var(--md-error))' }" @click="removeFile">
          {{ i18n.t('practiceRemoveFile') }}
        </button>
      </div>

      <div v-if="chapterGroups.some(group => group.chapter !== null)" class="flex flex-wrap gap-2 text-body-sm">
        <span v-for="group in chapterGroups" :key="JSON.stringify(group.chapter)" class="rounded-xl px-3 py-2 break-words max-w-full"
          :style="{ backgroundColor: 'rgb(var(--md-surface-container-low))' }">
          {{ group.chapter ?? i18n.t('practiceUnchaptered') }} · {{ group.count }}
        </span>
      </div>

      <div class="overflow-x-auto rounded-xl" :style="{ border: '1px solid rgb(var(--md-outline-variant))' }">
        <table class="w-full text-sm">
          <thead :style="{ backgroundColor: 'rgb(var(--md-surface-container-low))' }">
            <tr>
              <th class="p-2 text-left text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">#</th>
              <th class="p-2 text-left text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceImportColType') }}</th>
              <th class="p-2 text-left text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceImportColStem') }}</th>
              <th class="p-2 text-left text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceImportColAnswer') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in previewData"
              :key="i"
              :style="{ borderTop: '1px solid rgb(var(--md-outline-variant) / 0.4)' }"
            >
              <td class="p-2 text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-muted))'}">{{ i + 1 }}</td>
              <td class="p-2">
                <span
                  class="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium"
                  :style="{
                    backgroundColor: 'rgb(var(--md-secondary-container))',
                    color: 'rgb(var(--md-on-secondary-container))',
                  }"
                >{{ row.type }}</span>
              </td>
              <td class="p-2 text-body-sm" :style="{ color: 'rgb(var(--md-on-surface))' }">{{ row.stem }}</td>
              <td class="p-2 text-body-sm" :style="{ color: 'rgb(var(--md-on-surface))' }">{{ row.answer }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <button class="btn-filled w-full" @click="handleConfirm">
        {{ i18n.t('practiceImportConfirm') }}
      </button>
    </template>
  </div>
</template>
