<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useWrongQuestionsStore } from '@/stores/wrongQuestions'
import { exportBank, type BankExportFormat } from '@/composables/useBankExport'
import type { QuestionBank } from '@exameow/shared'
import {
  ClockIcon,
  DocumentTextIcon,
  TrashIcon,
  ArrowRightIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline'
import { isAndroid } from '@/utils/platform'

const props = defineProps<{
  banks: QuestionBank[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'delete', id: string): void
  (e: 'import'): void
  (e: 'manageWrong', bankId: string): void
}>()

const i18n = useI18nStore()
const wrongStore = useWrongQuestionsStore()

const templateExportSuccess = ref('')
const templateExportFilePath = ref('')
const templateExportError = ref('')
const downloadingTemplate = ref(false)

const exportMenuFor = ref<string | null>(null)
const exportingBank = ref(false)
let menuPinned = false

function openExportMenu(id: string) {
  exportMenuFor.value = id
}

function closeExportMenu() {
  if (!menuPinned) exportMenuFor.value = null
}

function toggleExportMenu(id: string) {
  if (exportMenuFor.value === id && menuPinned) {
    exportMenuFor.value = null
    menuPinned = false
  } else {
    exportMenuFor.value = id
    menuPinned = true
  }
}

function handleDocClick() {
  if (menuPinned) {
    exportMenuFor.value = null
    menuPinned = false
  }
}

onMounted(() => document.addEventListener('click', handleDocClick))
onBeforeUnmount(() => document.removeEventListener('click', handleDocClick))

async function handleExportBank(bank: QuestionBank, format: BankExportFormat) {
  exportMenuFor.value = null
  menuPinned = false
  if (exportingBank.value) return
  exportingBank.value = true
  templateExportSuccess.value = ''
  templateExportError.value = ''
  templateExportFilePath.value = ''
  try {
    const result = await exportBank(bank, format)
    if (result.ok && result.path) {
      templateExportSuccess.value = i18n.t('previewExportSaved') + result.path
      templateExportFilePath.value = result.path
    } else if (!result.cancelled) {
      templateExportError.value = 'Export failed: ' + (result.error ?? 'unknown')
    }
  } finally {
    exportingBank.value = false
  }
}

const sourceLabel = (source: string): string => {
  if (source === 'ai-generated') return i18n.t('practiceSourceAI')
  return i18n.t('practiceSourceImport')
}

const formatDate = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const typeCounts = (bank: QuestionBank) => {
  const counts: Record<string, number> = {}
  for (const q of bank.questions) {
    counts[q.type] = (counts[q.type] || 0) + 1
  }
  return counts
}

async function handleDownloadTemplate() {
  templateExportSuccess.value = ''
  templateExportError.value = ''
  templateExportFilePath.value = ''
  downloadingTemplate.value = true

  try {
    const XLSX = await import('xlsx')
    const isZh = i18n.locale === 'zh'
    const sample = isZh
      ? {
          '题型 （必填）': '单选题',
          '题干（必填）': 'Exameow 的 AI 接口协议是什么类型？',
          '选项 A': 'OpenAI 兼容 API',
          '选项 B': 'WebSocket',
          '选项 C': 'gRPC',
          '选项 D': 'GraphQL',
          '选项 E': '',
          '选项 F': '',
          '选项 G': '',
          '选项 H': '',
          '正确答案': 'A',
          '解析': 'Exameow 兼容所有 OpenAI 格式的 API，支持对接任何 OpenAI 兼容的服务商。',
          '学科': '',
          '章节': '',
          '难度': '',
        }
      : {
          'Type (required)': 'Single Choice',
          'Question (required)': 'What type of AI API protocol does Exameow use?',
          'Option A': 'OpenAI-compatible API',
          'Option B': 'WebSocket',
          'Option C': 'gRPC',
          'Option D': 'GraphQL',
          'Option E': '',
          'Option F': '',
          'Option G': '',
          'Option H': '',
          'Answer': 'A',
          'Analysis': 'Exameow works with any OpenAI-compatible API provider.',
          'Subject': '',
          'Chapter': '',
          'Difficulty': '',
        }
    const ws = XLSX.utils.json_to_sheet([sample])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    const isTauriPlatform = '__TAURI__' in window || '__TAURI_INTERNALS__' in window
    const filename = 'exameow_template.xlsx'

    if (isTauriPlatform) {
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      const b64 = btoa(binary)
      const { tauriApi } = await import('@/api/bridge')

      try {
        const mod: any = await import('@tauri-apps/plugin-dialog')
        const path = await mod.save({ defaultPath: filename, filters: [{ name: 'Excel File', extensions: ['xlsx'] }] })
        if (path === null) {
          return
        }
        await tauriApi.writeFile(path, b64)
        templateExportSuccess.value = i18n.t('previewExportSaved') + path
        templateExportFilePath.value = path
        return
      } catch {}

      try {
        const savedPath = await tauriApi.saveToDownloads(filename, b64)
        templateExportSuccess.value = i18n.t('previewExportSaved') + savedPath
        templateExportFilePath.value = savedPath
      } catch (e: any) {
        templateExportError.value = 'Template download failed: ' + String(e?.message ?? e)
      }
    } else {
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      templateExportSuccess.value = i18n.t('previewExportSaved') + filename
      templateExportFilePath.value = filename
    }
  } catch (e: any) {
    templateExportError.value = 'Template download failed: ' + String(e?.message ?? e)
  } finally {
    downloadingTemplate.value = false
  }
}

async function handleShareTemplate() {
  try {
    const { shareFile } = await import('@choochmeque/tauri-plugin-sharekit-api')
    await shareFile('file://' + templateExportFilePath.value!, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      title: templateExportFilePath.value!.split('/').pop() || 'exameow_template.xlsx',
    })
  } catch (_e) {}
}

const hasExportMessage = computed(() => templateExportSuccess.value || templateExportError.value)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-title-sm" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceSelectBank') }}
      </h3>
      <div class="flex items-center gap-2">
        <button class="btn-text text-sm" :disabled="downloadingTemplate" @click="handleDownloadTemplate">
          <ArrowDownTrayIcon class="w-4 h-4" />
          {{ i18n.t('practiceDownloadTemplate') }}
        </button>
        <button class="btn-text text-sm" @click="emit('import')">
          {{ i18n.t('practiceImportBtn') }}
        </button>
      </div>
    </div>

    <Transition name="scale">
      <div
        v-if="hasExportMessage"
        class="px-4 py-3 rounded-2xl text-sm flex items-center gap-2 break-all"
        :style="{
          backgroundColor: templateExportError ? 'rgba(var(--md-error) / 0.12)' : 'rgba(var(--md-primary) / 0.12)',
          color: templateExportError ? 'rgb(var(--md-error))' : 'rgb(var(--md-primary))',
        }"
      >
        <CheckCircleIcon v-if="templateExportSuccess" class="w-5 h-5 shrink-0" />
        <ExclamationTriangleIcon v-else class="w-5 h-5 shrink-0" />
        <span class="flex-1 min-w-0">{{ templateExportSuccess || templateExportError }}</span>
        <button
          v-if="templateExportFilePath && isAndroid()"
          class="btn-tonal !h-7 !px-3 !text-xs shrink-0"
          @click="handleShareTemplate"
        >
          <ShareIcon class="w-3.5 h-3.5" /> {{ i18n.t('previewExportShare') }}
        </button>
      </div>
    </Transition>

    <!-- Empty State -->
    <div
      v-if="banks.length === 0"
      class="card-outlined p-8 text-center"
    >
      <DocumentTextIcon class="w-12 h-12 mx-auto mb-3" :style="{ color: 'rgb(var(--md-on-surface-muted))' }" />
      <div class="text-title-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceEmptyTitle') }}
      </div>
      <div class="text-body-sm mb-5" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ i18n.t('practiceEmptyHint') }}
      </div>
      <button class="btn-filled" @click="emit('import')">
        {{ i18n.t('practiceImportBtn') }}
      </button>
    </div>

    <!-- Bank Cards -->
    <button
      v-for="bank in banks"
      :key="bank.id"
      class="w-full text-left card-elevated p-3 sm:p-5 transition-all duration-200 group"
      :style="
        selectedId === bank.id
          ? { outline: '2px solid rgb(var(--md-primary))', outlineOffset: '1px' }
          : {}
      "
      @click="emit('select', bank.id)"
    >
      <div class="flex items-start gap-3 sm:gap-4">
        <div
          class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0"
          :style="{ backgroundColor: 'rgb(var(--md-primary-container))' }"
        >
          <DocumentTextIcon class="w-5 h-5 sm:w-6 sm:h-6" :style="{ color: 'rgb(var(--md-on-primary-container))' }" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="text-title-sm truncate" :style="{ color: 'rgb(var(--md-on-surface))' }">{{ bank.name }}</div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            <span>{{ i18n.t('practiceQuestions', { n: bank.questions.length }) }}</span>
            <span class="w-1 h-1 rounded-full hidden sm:block" :style="{ backgroundColor: 'rgb(var(--md-on-surface-muted))' }" />
            <span>{{ sourceLabel(bank.source) }}</span>
            <span class="w-1 h-1 rounded-full hidden sm:block" :style="{ backgroundColor: 'rgb(var(--md-on-surface-muted))' }" />
            <span class="flex items-center gap-1">
              <ClockIcon class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              {{ formatDate(bank.createdAt) }}
            </span>
          </div>
        </div>

        <ArrowRightIcon
          class="w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-1.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
          :style="{ color: 'rgb(var(--md-on-surface-muted))' }"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-3">
        <div
          class="relative shrink-0"
          @mouseenter="openExportMenu(bank.id)"
          @mouseleave="closeExportMenu"
        >
          <button
            class="btn-icon !w-7 !h-7 sm:!w-8 sm:!h-8"
            :disabled="exportingBank"
            :title="i18n.t('practiceExportBank')"
            @click.stop="toggleExportMenu(bank.id)"
          >
            <ArrowDownTrayIcon class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <Transition name="scale">
            <div
              v-if="exportMenuFor === bank.id"
              class="absolute left-0 bottom-full mb-1 z-20 rounded-xl overflow-hidden elevation-2 min-w-[96px]"
              :style="{ backgroundColor: 'rgb(var(--md-surface-container-high))' }"
            >
              <button
                class="w-full px-4 py-2 text-left text-sm hover:bg-[rgb(var(--md-primary)/0.08)] transition-colors"
                :style="{ color: 'rgb(var(--md-on-surface))' }"
                @click.stop="handleExportBank(bank, 'xlsx')"
              >
                XLSX
              </button>
              <button
                class="w-full px-4 py-2 text-left text-sm hover:bg-[rgb(var(--md-primary)/0.08)] transition-colors"
                :style="{ color: 'rgb(var(--md-on-surface))' }"
                @click.stop="handleExportBank(bank, 'csv')"
              >
                CSV
              </button>
            </div>
          </Transition>
        </div>
        <button
          class="btn-icon !w-7 !h-7 sm:!w-8 sm:!h-8 shrink-0"
          :style="{ color: 'rgb(var(--md-error))' }"
          @click.stop="emit('delete', bank.id)"
        >
          <TrashIcon class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <div class="flex items-center gap-2 ml-auto flex-wrap">
          <button
            v-if="wrongStore.hasWrongQuestions(bank.id)"
            class="btn-tonal !h-8 sm:!h-9 text-xs sm:text-sm !px-3 sm:!px-4 shrink-0 max-w-full"
            :style="{ borderColor: 'rgb(var(--md-error))', color: 'rgb(var(--md-error))' }"
            @click.stop="emit('manageWrong', bank.id)"
          >
            <ExclamationTriangleIcon class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span class="truncate">{{ i18n.t('practiceWrongPractice') }}</span>
          </button>
          <button
            class="btn-filled !h-8 sm:!h-9 text-xs sm:text-sm !px-3 sm:!px-4 shrink-0 max-w-full"
            @click.stop="emit('select', bank.id)"
          >
            <ArrowRightIcon class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 rtl:rotate-180" />
            <span class="truncate">{{ i18n.t('practiceEnterBank') }}</span>
          </button>
        </div>
      </div>
    </button>
  </div>
</template>
