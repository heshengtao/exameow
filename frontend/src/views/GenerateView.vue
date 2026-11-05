<script setup lang="ts">
import { ref, computed } from 'vue'
import { useExamStore } from '@/stores/exam'
import { useConfigStore } from '@/stores/config'
import { useI18nStore } from '@/stores/i18n'
import FileUploader from '@/components/generate/FileUploader.vue'
import ParamForm from '@/components/generate/ParamForm.vue'
import QuestionTable from '@/components/preview/QuestionTable.vue'
import { saveWordDocuments } from '@/composables/useBankExport'
import { getFileInputs, fileInputsRef } from '@/stores/fileInput'
import { api } from '@/api'
import { generateCsvContent } from '@/api/http'
import { isAndroid } from '@/utils/platform'
import PublishExamDialog from '@/components/exam/PublishExamDialog.vue'
import JoinExamDialog from '@/components/exam/JoinExamDialog.vue'
import LaunchExamDialog from '@/components/exam/LaunchExamDialog.vue'
import AiConfigNotice from '@/components/common/AiConfigNotice.vue'
import { SparklesIcon, ArrowDownTrayIcon, CheckCircleIcon, ShareIcon } from '@heroicons/vue/24/outline'

const examStore = useExamStore()
const configStore = useConfigStore()
const i18n = useI18nStore()

const isTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window
const exportError = ref('')
const exportSuccess = ref('')
const exportFilePath = ref('')
const exporting = ref(false)
const exportingXlsx = ref(false)
const exportingWord = ref(false)
const showPublish = ref(false)
const showJoin = ref(false)
const showLaunch = ref(false)

const baseFileName = computed(() => examStore.sourceFileName || 'exameow_questions')

// 试卷标题:去掉源文件扩展名,用作 Word 文档标题与文件名前缀
const paperTitle = computed(() => baseFileName.value.replace(/\.[^.\\/]+$/, '') || 'exameow_paper')

const canGenerate = computed(() =>
  fileInputsRef.value.length > 0 && examStore.questionTypes.length > 0 && examStore.totalCount > 0 && configStore.configured && !examStore.generating,
)

const progressPercent = computed(() => {
  const p = examStore.progress
  if (!p.total) return 0
  return Math.round((p.current / p.total) * 100)
})

const isBatched = computed(() => examStore.progress.total > 0)

const detailsCopied = ref(false)
const appVersion = import.meta.env.VITE_APP_VERSION || ''

const inlineFailureReason = computed(() => {
  const text = examStore.lastFailure.trim()
  if (!text) return ''
  return text.length > 400 ? `${text.slice(0, 400)}…` : text
})

const failureDump = computed(() =>
  examStore.failureDetails
    .map((f) => `[${f.batch}/${f.total}] ${f.message}`)
    .join('\n\n'),
)

const hasFailures = computed(() => examStore.failureDetails.length > 0)

async function copyFailureDetails() {
  if (!hasFailures.value) return
  const platform = isTauri ? 'Tauri' : import.meta.env.VITE_CLOUDFLARE === 'true' ? 'Cloudflare' : 'Web'
  const config = configStore.getConfig()
  const header = [
    `Exameow v${appVersion} · ${platform}`,
    `endpoint: ${config.endpoint || '(server env)'}`,
    `model: ${config.model || '(empty)'}`,
    `ua: ${navigator.userAgent}`,
    '',
    '',
  ].join('\n')
  try {
    await navigator.clipboard.writeText(header + failureDump.value)
    detailsCopied.value = true
    setTimeout(() => { detailsCopied.value = false }, 2000)
  } catch {
    detailsCopied.value = false
  }
}

async function handleGenerate() {
  const inputs = getFileInputs()
  if (inputs.length === 0) return
  try {
    await examStore.generate(inputs)
  } catch (_e) {}
}

async function handleExportWord() {
  exportError.value = ''
  exportSuccess.value = ''
  exportingWord.value = true
  try {
    const files = await saveWordDocuments(paperTitle.value, examStore.questions, i18n.locale)
    exportSuccess.value = i18n.t('previewExportSaved') + files.join('、')
    exportFilePath.value = files[0] ?? ''
  } catch (e: any) { exportError.value = e.message || String(e) } finally { exportingWord.value = false }
}

function handleNewBatch() { examStore.reset() }

async function saveFile(filename: string, content: string | Uint8Array): Promise<string | null> {
  exportError.value = ''
  exportSuccess.value = ''
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

async function handleExportCsv() {
  exporting.value = true
  try {
    const defaultName = `${baseFileName.value}.csv`
    if (isTauri) {
      await saveFile(defaultName, generateCsvContent(examStore.questions, i18n.locale))
    } else {
      await api.exportCsv(examStore.questions, undefined, defaultName)
    }
  } catch (e: any) { exportError.value = e.message || String(e) } finally { exporting.value = false }
}

async function handleExportXlsx() {
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

async function handleShare() {
  try {
    const { shareFile } = await import('@choochmeque/tauri-plugin-sharekit-api')
    const mime = exportFilePath.value!.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv'
    await shareFile('file://' + exportFilePath.value!, { mimeType: mime, title: exportFilePath.value!.split('/').pop() || 'File' })
  } catch (_e) {}
}
</script>

<template>
  <div>
    <h1 class="text-display-sm mb-1">{{ i18n.t('genTitle') }}</h1>
    <p class="text-body-lg mb-6" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('genSubtitle') }}</p>
    <div class="mb-6 flex justify-end gap-2">
      <button class="btn-filled text-sm" @click="showLaunch = true">{{ i18n.t('pubLaunch') }}</button>
      <button class="btn-tonal text-sm" @click="showJoin = true">{{ i18n.t('pubJoin') }}</button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-6">
      <!-- File Upload Card -->
      <div class="card-outlined min-h-[180px] sm:min-h-[240px] flex items-center justify-center p-3 sm:p-4">
        <FileUploader :is-tauri="isTauri" />
      </div>
      <ParamForm />
    </div>

    <!-- Progress -->
    <Transition name="scale">
      <div v-if="!examStore.error && examStore.generating" class="card-filled p-5 mb-6">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-title-sm">{{ examStore.progress.message || i18n.t('genGenerating') }}</span>
          <span v-if="isBatched" class="text-sm font-bold tabular-nums" style="color: rgb(var(--md-primary))">
            {{ examStore.progress.current }}/{{ examStore.progress.total }}
          </span>
        </div>
        <div v-if="!isBatched && examStore.generating" class="progress-indeterminate" />
        <div v-else class="w-full h-1 rounded-full overflow-hidden" :style="{ backgroundColor: 'rgba(var(--md-primary) / 0.12)' }">
          <div
            class="h-full rounded-full transition-all duration-500 ease-out"
            :style="{ backgroundColor: 'rgb(var(--md-primary))', width: progressPercent + '%' }"
          />
        </div>
        <div v-if="isBatched" class="mt-2 text-body-sm" style="color: rgb(var(--md-on-surface-variant))">
          {{ i18n.t('genProgressGeneratingBatch', { current: examStore.progress.current, total: examStore.progress.total }) }}
        </div>
        <p
          v-if="inlineFailureReason"
          class="mt-2 text-body-sm break-all whitespace-pre-wrap"
          style="color: rgb(var(--md-error))"
        >
          {{ i18n.t('genErrorReason') }}: {{ inlineFailureReason }}
        </p>
        <button
          class="btn-outlined mt-3 text-sm !h-10"
          @click="examStore.cancelGeneration()"
        >
          {{ i18n.t('genCancel') }}
        </button>
      </div>
    </Transition>

    <!-- Error -->
    <Transition name="scale">
      <div v-if="examStore.error && !examStore.generating" class="card-filled p-4 mb-6 border" :style="{ backgroundColor: 'rgba(var(--md-error) / 0.08)', borderColor: 'rgb(var(--md-error))' }">
        <p class="text-body-md break-all whitespace-pre-wrap" style="color: rgb(var(--md-error))">{{ examStore.error }}</p>
      </div>
    </Transition>

    <!-- Shortfall warning -->
    <Transition name="scale">
      <div
        v-if="examStore.summary && !examStore.generating"
        class="card-filled p-4 mb-6 border"
        style="background-color: rgba(var(--md-error) / 0.06); border-color: rgb(var(--md-error))"
      >
        <p class="text-body-md font-semibold mb-1" style="color: rgb(var(--md-error))">
          {{ examStore.summary.generated === 0 ? i18n.t('genAllFailedTitle') : i18n.t('genShortfallTitle') }}
        </p>
        <p class="text-body-md" style="color: rgb(var(--md-on-surface-variant))">
          <template v-if="examStore.summary.generated === 0">{{ i18n.t('genAllFailedBody') }}</template>
          <template v-else>{{ i18n.t('genShortfallBody', { generated: examStore.summary.generated, skipped: examStore.summary.skipped }) }}</template>
        </p>
        <details v-if="hasFailures" class="mt-3" :open="examStore.summary.generated === 0">
          <summary class="cursor-pointer text-body-sm font-semibold select-none" style="color: rgb(var(--md-error))">
            {{ i18n.t('genErrorDetailsTitle') }}
          </summary>
          <p class="mt-2 text-body-sm" style="color: rgb(var(--md-on-surface-variant))">
            {{ i18n.t('genErrorDetailsHint') }}
          </p>
          <pre
            class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl p-3 text-xs font-mono"
            style="background-color: rgb(var(--md-surface-container-high)); color: rgb(var(--md-on-surface))"
          >{{ failureDump }}</pre>
          <button class="btn-tonal text-sm mt-2 !h-9" @click="copyFailureDetails">
            {{ detailsCopied ? i18n.t('genDetailsCopied') : i18n.t('genCopyDetails') }}
          </button>
        </details>
      </div>
    </Transition>

    <!-- Generate Button -->
    <AiConfigNotice v-if="!configStore.configured" class="max-w-md mx-auto mb-4" />
    <div class="flex flex-wrap items-center justify-center gap-2">
      <button
        class="btn-filled text-base !px-10 !h-12"
        :disabled="!canGenerate"
        @click="handleGenerate"
      >
        <SparklesIcon v-if="!examStore.generating" class="w-5 h-5" />
        <svg v-else class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        {{ examStore.generating ? i18n.t('genGenerating') : i18n.t('genGenerateBtn') }}
      </button>
      <button
        v-if="examStore.generated"
        class="btn-tonal text-sm !h-12"
        @click="handleNewBatch"
      >
        {{ i18n.t('previewNewBatch') }}
      </button>
    </div>

    <!-- Export & Preview -->
    <template v-if="examStore.generated && !examStore.generating">
      <div class="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-body-lg" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('previewQuestionCount', { n: examStore.questions.length }) }}</p>
        <div class="flex flex-wrap gap-2">
          <button class="btn-tonal text-sm" :disabled="exporting" @click="handleExportCsv">
            <ArrowDownTrayIcon class="w-4 h-4" /> CSV
          </button>
          <button class="btn-tonal text-sm" :disabled="exportingWord" @click="handleExportWord">
            <ArrowDownTrayIcon class="w-4 h-4" /> {{ exportingWord ? '...' : 'Word' }}
          </button>
          <button class="btn-filled text-sm" :disabled="exportingXlsx" @click="handleExportXlsx">
            <ArrowDownTrayIcon class="w-4 h-4" /> {{ exportingXlsx ? '...' : 'XLSX' }}
          </button>
          <button class="btn-tonal text-sm" @click="showPublish = true">
            {{ i18n.t('pubPublish') }}
          </button>
        </div>
      </div>

      <Transition name="scale">
        <div v-if="exportError" class="mb-4 px-4 py-3 rounded-2xl text-sm" style="background-color: rgb(var(--md-error-container)); color: rgb(var(--md-on-error-container))">{{ exportError }}</div>
      </Transition>
      <Transition name="scale">
        <div v-if="exportSuccess" class="mb-4 px-4 py-3 rounded-2xl text-sm flex items-center gap-2 break-all" style="background-color: rgba(var(--md-primary) / 0.12); color: rgb(var(--md-primary))">
          <CheckCircleIcon class="w-5 h-5 shrink-0" />
          <span class="flex-1 min-w-0">{{ exportSuccess }}</span>
          <button v-if="exportFilePath && isAndroid()" class="btn-tonal !h-7 !px-3 !text-xs shrink-0" @click="handleShare">
            <ShareIcon class="w-3.5 h-3.5" /> {{ i18n.t('previewExportShare') }}
          </button>
        </div>
      </Transition>

      <QuestionTable :questions="examStore.questions" />
    </template>
    <PublishExamDialog v-if="showPublish" :questions="examStore.questions" @close="showPublish = false" />
    <JoinExamDialog v-if="showJoin" @close="showJoin = false" />
    <LaunchExamDialog v-if="showLaunch" @close="showLaunch = false" />
  </div>
</template>
