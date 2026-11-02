<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useExamStore } from '@/stores/exam'
import { useI18nStore } from '@/stores/i18n'
import { api } from '@/api'
import { generateCsvContent } from '@/api/http'
import QuestionTable from '@/components/preview/QuestionTable.vue'
import { saveWordDocuments } from '@/composables/useBankExport'
import { ArrowLeftIcon, ArrowDownTrayIcon, DocumentTextIcon, CheckCircleIcon, ShareIcon } from '@heroicons/vue/24/outline'
import { isAndroid } from '@/utils/platform'

const router = useRouter()
const examStore = useExamStore()
const i18n = useI18nStore()
const isTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window
const exportError = ref('')
const exportSuccess = ref('')
const exportFilePath = ref('')
const exporting = ref(false)
const exportingXlsx = ref(false)
const exportingWord = ref(false)

const baseFileName = computed(() => {
  const name = examStore.sourceFileName
  if (name) return name
  return 'exameow_questions'
})

// 试卷标题:去掉源文件扩展名,用作 Word 文档标题与文件名前缀
const paperTitle = computed(() => baseFileName.value.replace(/\.[^.\\/]+$/, '') || 'exameow_paper')

async function saveFile(filename: string, content: string | Uint8Array): Promise<string | null> {
  try {
    const mod: any = await import('@tauri-apps/plugin-dialog')
    const path = await mod.save({ defaultPath: filename, filters: [{ name: 'File', extensions: [filename.split('.').pop() || '*'] }] })
    if (!path) return null
    if (typeof content === 'string') {
      await api.exportCsv(examStore.questions, path)
    } else {
      await api.exportXlsx(examStore.questions, path)
    }
    exportSuccess.value = i18n.t('previewExportSaved') + path
    exportFilePath.value = path
    return path
  } catch {}
  try {
    const b64 = typeof content === 'string' ? btoa(unescape(encodeURIComponent(content))) : btoa(String.fromCharCode(...content))
    const { tauriApi } = await import('@/api/bridge')
    const savedPath = await tauriApi.saveToDownloads(filename, b64)
    exportSuccess.value = i18n.t('previewExportSaved') + savedPath
    exportFilePath.value = savedPath
    return savedPath
  } catch (e: any) {
    exportError.value = 'Export failed: ' + (e.message || String(e))
    return null
  }
}

async function handleShare() {
  try {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(exportFilePath.value!)
  } catch (e: any) {
    exportError.value = 'Open failed: ' + (e.message || String(e))
  }
}

async function handleExport() {
  exportError.value = ''
  exportSuccess.value = ''
  exporting.value = true
  try {
    const defaultName = `${baseFileName.value}.csv`
    if (isTauri) {
      const content = generateCsvContent(examStore.questions, i18n.locale)
      await saveFile(defaultName, content)
    } else {
      await api.exportCsv(examStore.questions, undefined, defaultName)
    }
  } catch (e: any) { exportError.value = e.message || String(e) } finally { exporting.value = false }
}

async function handleExportXlsx() {
  exportError.value = ''
  exportSuccess.value = ''
  exportingXlsx.value = true
  try {
    const defaultName = `${baseFileName.value}.xlsx`
    if (isTauri) {
      const base64 = await api.exportXlsxData(examStore.questions)
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      await saveFile(defaultName, bytes)
    } else {
      await api.exportXlsx(examStore.questions, undefined, defaultName)
    }
  } catch (e: any) { exportError.value = e.message || String(e) } finally { exportingXlsx.value = false }
}

async function handleExportWord() {
  exportError.value = ''
  exportSuccess.value = ''
  exportingWord.value = true
  try {
    const files = await saveWordDocuments(paperTitle.value, examStore.questions, i18n.locale)
    exportSuccess.value = i18n.t('previewExportSaved') + files.join('、')
    exportFilePath.value = files[0] ?? ''
  } catch (e: any) {
    exportError.value = e.message || String(e)
  } finally {
    exportingWord.value = false
  }
}

function handleNewBatch() { examStore.reset(); router.push('/generate') }
</script>

<template>
  <div>
    <!-- Empty State -->
    <div v-if="!examStore.generated">
      <h1 class="text-display-sm mb-1">{{ i18n.t('previewTitle') }}</h1>
      <p class="text-body-lg mb-6" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('previewSubtitleEmpty') }}</p>
      <div class="card-outlined text-center py-14 px-6">
        <div class="w-[72px] h-[72px] rounded-[28px] flex items-center justify-center mx-auto mb-5 elevation-1"
             style="background: linear-gradient(135deg, rgb(var(--md-primary)), rgb(var(--md-tertiary)))">
          <DocumentTextIcon class="w-9 h-9 text-white" />
        </div>
        <h3 class="text-title-lg mb-2">{{ i18n.t('previewEmptyTitle') }}</h3>
        <p class="text-body-md mb-6" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('previewEmptyText') }}</p>
        <button class="btn-filled" @click="router.push('/generate')">
          {{ i18n.t('previewGotoGenerate') }}
        </button>
      </div>
    </div>

    <!-- Results -->
    <div v-else>
      <div class="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 mb-6">
        <div class="flex-1">
          <h1 class="text-display-sm mb-1">{{ i18n.t('previewTitle') }}</h1>
          <p class="text-body-lg" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('previewQuestionCount', { n: examStore.questions.length }) }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-tonal text-sm" @click="handleNewBatch">
            <ArrowLeftIcon class="w-4 h-4" /> {{ i18n.t('previewNewBatch') }}
          </button>
          <button class="btn-tonal text-sm" :disabled="exporting" @click="handleExport">
            <ArrowDownTrayIcon class="w-4 h-4" /> CSV
          </button>
          <button class="btn-tonal text-sm" :disabled="exportingWord" @click="handleExportWord">
            <ArrowDownTrayIcon class="w-4 h-4" /> {{ exportingWord ? '...' : 'Word' }}
          </button>
          <button class="btn-filled text-sm" :disabled="exportingXlsx" @click="handleExportXlsx">
            <ArrowDownTrayIcon class="w-4 h-4" /> {{ exportingXlsx ? '...' : 'XLSX' }}
          </button>
        </div>
      </div>

      <Transition name="scale">
        <div
          v-if="exportError"
          class="mb-4 px-4 py-3 rounded-2xl text-sm"
          style="background-color: rgb(var(--md-error-container)); color: rgb(var(--md-on-error-container))"
        >
          {{ exportError }}
        </div>
      </Transition>

      <Transition name="scale">
        <div
          v-if="exportSuccess"
          class="mb-4 px-4 py-3 rounded-2xl text-sm flex items-center gap-2 break-all"
          style="background-color: rgba(var(--md-primary) / 0.12); color: rgb(var(--md-primary))"
        >
          <CheckCircleIcon class="w-5 h-5 shrink-0" />
          <span class="flex-1 min-w-0">{{ exportSuccess }}</span>
          <button
            v-if="exportFilePath && isAndroid()"
            class="btn-tonal !h-7 !px-3 !text-xs shrink-0"
            @click="handleShare"
          >
            <ShareIcon class="w-3.5 h-3.5" /> {{ i18n.t('previewExportShare') }}
          </button>
        </div>
      </Transition>

      <QuestionTable :questions="examStore.questions" />
    </div>
  </div>
</template>
