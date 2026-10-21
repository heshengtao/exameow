<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { fetchExam, submitExam, reportExam, RelayError, examMediaUrl } from '@/api/relay'
import QuestionImages from '@/components/practice/QuestionImages.vue'
import { useJoinedStore } from '@/stores/joined'
import type { JoinedRecord } from '@/stores/joined'
import ProgressBar from '@/components/practice/ProgressBar.vue'
import type { PublishedExamInfo, SubmitExamResponse } from '@exameow/shared'
import { CheckIcon, CheckCircleIcon, XCircleIcon, ClockIcon, FlagIcon } from '@heroicons/vue/24/outline'

const route = useRoute()
const router = useRouter()
const i18n = useI18nStore()
const joinedStore = useJoinedStore()

const code = (route.params.code as string || '').toUpperCase()
const studentName = ref((route.query.name as string || '').trim())
const nameInput = ref(studentName.value)
const needsName = ref(false)

const loading = ref(true)
const errorKey = ref<'not_found' | 'not_started' | 'ended' | 'reported' | ''>('')
const notStartedTime = ref('')
const exam = ref<PublishedExamInfo | null>(null)
const answers = ref<Record<string, string>>({})
const remainingSec = ref(0)
const startedAt = ref(0)
const submitting = ref(false)
const submitError = ref('')
const result = ref<SubmitExamResponse | null>(null)
const priorSubmitted = ref<JoinedRecord | null>(null)
const currentIndex = ref(0)
const showSheet = ref(false)
const showSubmitConfirm = ref(false)
const showReport = ref(false)
const reportReason = ref('')
const reportSent = ref(false)

async function sendReport() {
  try {
    await reportExam(code, reportReason.value.trim())
  } catch {}
  reportSent.value = true
  setTimeout(() => {
    showReport.value = false
    reportSent.value = false
    reportReason.value = ''
  }, 1500)
}
let timer: ReturnType<typeof setInterval> | null = null

const optionLabels = 'ABCDEFGH'.split('')
const isMulti = (t: string) => t === 'multi_choice'
const isChoice = (t: string) => ['single_choice', 'multi_choice', 'true_false'].includes(t)

const currentQuestion = computed(() => exam.value?.questions[currentIndex.value] ?? null)
const isFirst = computed(() => currentIndex.value <= 0)
const isLast = computed(() => !!exam.value && currentIndex.value >= exam.value.questions.length - 1)

const answeredCount = computed(() => {
  if (!exam.value) return 0
  return exam.value.questions.filter((q) => (answers.value[q.id] || '').trim()).length
})

const unansweredCount = computed(() => (exam.value ? exam.value.questions.length - answeredCount.value : 0))

const timeText = computed(() => {
  const s = Math.max(0, remainingSec.value)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
})

const typeLabel = (t: string): string => {
  const labels: Record<string, string> = {
    single_choice: i18n.t('typeSingle'),
    multi_choice: i18n.t('typeMulti'),
    true_false: i18n.t('typeTrueFalse'),
    fill_blank: i18n.t('typeFillBlank'),
    short_answer: i18n.t('typeShortAnswer'),
  }
  return labels[t] ?? t
}

function isSelected(qid: string, label: string, multi: boolean): boolean {
  const a = answers.value[qid] || ''
  if (multi) return a.includes(label)
  return a === label
}

function select(qid: string, label: string, multi: boolean) {
  if (result.value) return
  if (!multi) {
    answers.value[qid] = label
    return
  }
  const cur = answers.value[qid] || ''
  const next = cur.includes(label) ? cur.replace(label, '') : (cur + label).split('').sort().join('')
  answers.value[qid] = next
}

function optionStyle(qid: string, label: string, multi: boolean) {
  const sel = isSelected(qid, label, multi)
  return {
    borderColor: sel ? 'rgb(var(--md-primary))' : 'rgb(var(--md-outline-variant))',
    backgroundColor: sel ? 'rgba(var(--md-primary), 0.08)' : 'transparent',
  }
}

function badgeStyle(qid: string, label: string, multi: boolean) {
  const sel = isSelected(qid, label, multi)
  return {
    backgroundColor: sel ? 'rgb(var(--md-primary))' : 'rgb(var(--md-surface-container-highest))',
    color: sel ? 'rgb(var(--md-on-primary))' : 'rgb(var(--md-on-surface-variant))',
  }
}

function goTo(i: number) {
  if (!exam.value) return
  if (i >= 0 && i < exam.value.questions.length) currentIndex.value = i
}

async function doSubmit() {
  if (submitting.value || result.value || priorSubmitted.value || !exam.value) return
  if (timer) clearInterval(timer)
  submitError.value = ''
  submitting.value = true
  try {
    result.value = await submitExam(code, {
      name: studentName.value,
      answers: answers.value,
      durationSec: Math.round((Date.now() - startedAt.value) / 1000),
    })
    joinedStore.markSubmitted(code, studentName.value, exam.value.title, result.value.score, result.value.totalScore, result.value.graded)
    sessionStorage.removeItem(storageKey())
  } catch (e) {
    if (e instanceof RelayError && e.code === 'ended') errorKey.value = 'ended'
    else submitError.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
    showSubmitConfirm.value = false
  }
}

function handleSubmitClick() {
  if (unansweredCount.value > 0) {
    showSubmitConfirm.value = true
  } else {
    doSubmit()
  }
}

function storageKey(): string {
  return `exameow-take-${code}`
}

function saveProgress() {
  if (!exam.value || result.value) return
  try {
    sessionStorage.setItem(storageKey(), JSON.stringify({
      name: studentName.value,
      info: exam.value,
      answers: answers.value,
      startedAt: startedAt.value,
    }))
  } catch {}
}

watch(answers, saveProgress, { deep: true })

function restore(): boolean {
  try {
    const raw = sessionStorage.getItem(storageKey())
    if (!raw) return false
    const saved = JSON.parse(raw)
    if (!saved.info || Date.now() > saved.info.endAt) {
      sessionStorage.removeItem(storageKey())
      return false
    }
    if (studentName.value && saved.name !== studentName.value) return false
    exam.value = saved.info
    answers.value = saved.answers || {}
    startedAt.value = saved.startedAt || Date.now()
    studentName.value = saved.name
    return true
  } catch {
    return false
  }
}

function beginTimer() {
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    if (!exam.value) return
    const elapsed = Math.floor((Date.now() - startedAt.value) / 1000)
    remainingSec.value = Math.min(
      exam.value.durationMinutes * 60 - elapsed,
      Math.floor((exam.value.endAt - Date.now()) / 1000),
    )
    if (remainingSec.value <= 0) doSubmit()
  }, 1000)
}

async function loadExam() {
  loading.value = true
  try {
    const info = await fetchExam(code)
    exam.value = info
    startedAt.value = Date.now()
    saveProgress()
    beginTimer()
  } catch (e) {
    if (e instanceof RelayError) {
      if (e.code === 'not_started') {
        errorKey.value = 'not_started'
        if (e.startAt) notStartedTime.value = new Date(e.startAt).toLocaleString()
      }
      else if (e.code === 'ended') errorKey.value = 'ended'
      else if (e.code === 'reported') errorKey.value = 'reported'
      else errorKey.value = 'not_found'
    } else {
      errorKey.value = 'not_found'
    }
  } finally {
    loading.value = false
  }
}

function checkPriorSubmission(): boolean {
  if (!studentName.value) return false
  const rec = joinedStore.list.find((r) => r.code === code && r.name === studentName.value && r.submittedAt)
  if (!rec) return false
  priorSubmitted.value = rec
  sessionStorage.removeItem(storageKey())
  return true
}

function handleNameSubmit() {
  const n = nameInput.value.trim()
  if (!n) return
  studentName.value = n
  joinedStore.add(code, n)
  needsName.value = false
  if (checkPriorSubmission()) return
  if (restore()) {
    beginTimer()
    return
  }
  loadExam()
}

onMounted(async () => {
  if (!studentName.value) {
    if (restore()) {
      if (checkPriorSubmission()) {
        loading.value = false
        return
      }
      beginTimer()
      loading.value = false
      return
    }
    needsName.value = true
    loading.value = false
    return
  }
  if (checkPriorSubmission()) {
    loading.value = false
    return
  }
  if (restore()) {
    if (checkPriorSubmission()) {
      loading.value = false
      return
    }
    beginTimer()
    loading.value = false
    return
  }
  await loadExam()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div>
    <p v-if="loading" class="text-center py-10">{{ i18n.t('takeLoading') }}</p>

    <div v-else-if="errorKey" class="card-filled p-6 text-center space-y-4">
      <p class="text-body-lg" style="color: rgb(var(--md-error))">
        <template v-if="errorKey === 'not_started'">{{ i18n.t('takeNotStarted', { time: notStartedTime }) }}</template>
        <template v-else-if="errorKey === 'ended'">{{ i18n.t('takeEnded') }}</template>
        <template v-else-if="errorKey === 'reported'">{{ i18n.t('takeReported') }}</template>
        <template v-else>{{ i18n.t('takeNotFound') }}</template>
      </p>
      <button class="btn-tonal" @click="router.push('/')">{{ i18n.t('takeBackHome') }}</button>
    </div>

    <div v-else-if="needsName" class="card-filled p-6 space-y-4 max-w-sm mx-auto">
      <h1 class="text-title-lg">{{ i18n.t('joinDialogTitle') }}</h1>
      <p class="text-sm tracking-[0.3em] font-bold" style="color: rgb(var(--md-primary))">{{ code }}</p>
      <input
        v-model="nameInput"
        class="input-outlined w-full"
        maxlength="50"
        :placeholder="i18n.t('takeEnterName')"
        @keyup.enter="handleNameSubmit"
      />
      <button class="btn-filled w-full" :disabled="!nameInput.trim()" @click="handleNameSubmit">
        {{ i18n.t('joinConfirm') }}
      </button>
    </div>

    <!-- Already Submitted -->
    <div v-else-if="priorSubmitted" class="card-filled p-6 text-center space-y-4 max-w-md mx-auto">
      <div
        class="w-16 h-16 rounded-full flex items-center justify-center mx-auto elevation-1"
        style="background-color: rgb(var(--md-primary))"
      >
        <span class="text-2xl font-bold" style="color: rgb(var(--md-on-primary))">{{ priorSubmitted.score ?? '-' }}</span>
      </div>
      <h2 class="text-headline-sm" style="color: rgb(var(--md-on-surface))">{{ priorSubmitted.title || code }}</h2>
      <p class="text-body-md" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('takeAlreadySubmitted') }}
      </p>
      <p v-if="priorSubmitted.score !== undefined" class="text-body-md" style="color: rgb(var(--md-primary))">
        {{ priorSubmitted.score }} / {{ priorSubmitted.totalScore }}
      </p>
      <div class="flex flex-col sm:flex-row gap-3">
        <button
          v-if="priorSubmitted.graded"
          class="btn-filled flex-1"
          @click="router.push({ path: '/mine/joined/wrong', query: { code, name: studentName } })"
        >
          {{ i18n.t('joinedViewWrong') }}
        </button>
        <button class="btn-tonal flex-1" @click="router.push('/')">{{ i18n.t('takeBackHome') }}</button>
      </div>
    </div>

    <template v-else-if="exam && !result && currentQuestion">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div class="min-w-0">
          <h1 class="text-display-sm mb-1 truncate">{{ exam.title }}</h1>
          <p class="text-body-lg" style="color: rgb(var(--md-on-surface-variant))">{{ studentName }}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="btn-icon !w-8 !h-8"
            :title="i18n.t('reportBtn')"
            style="color: rgb(var(--md-on-surface-variant))"
            @click="showReport = true"
          >
            <FlagIcon class="w-4 h-4" />
          </button>
          <div
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style="background-color: rgb(var(--md-secondary-container)); color: rgb(var(--md-on-secondary-container))"
          >
            <ClockIcon class="w-4 h-4" />
            <span class="text-sm font-bold tabular-nums">{{ timeText }}</span>
          </div>
        </div>
      </div>

      <!-- Progress -->
      <div class="card-outlined p-3 mb-4">
        <ProgressBar
          mode="mock"
          :current="currentIndex + 1"
          :total="exam.questions.length"
          :answered-count="answeredCount"
          @open-sheet="showSheet = true"
        />
      </div>

      <!-- Question Card -->
      <div class="card-elevated p-4 sm:p-6 mb-4" :key="currentIndex">
        <div class="flex items-center gap-2 mb-4">
          <span
            class="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
            style="background-color: rgb(var(--md-primary-container)); color: rgb(var(--md-on-primary-container))"
          >{{ currentIndex + 1 }}</span>
          <span
            class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium"
            style="background-color: rgb(var(--md-secondary-container)); color: rgb(var(--md-on-secondary-container))"
          >{{ typeLabel(currentQuestion.type) }}</span>
        </div>

        <div class="text-body-lg mb-5" style="color: rgb(var(--md-on-surface))">{{ currentQuestion.stem }}</div>

        <QuestionImages
          :ids="currentQuestion.images"
          :url-for="(id: string) => examMediaUrl(code, id)"
        />

        <div v-if="isChoice(currentQuestion.type)" class="space-y-2">
          <button
            v-for="(opt, oi) in currentQuestion.options"
            :key="oi"
            class="w-full text-left p-3 rounded-xl border transition-all duration-200 flex items-center gap-3"
            :style="optionStyle(currentQuestion.id, optionLabels[oi]!, isMulti(currentQuestion.type))"
            @click="select(currentQuestion.id, optionLabels[oi]!, isMulti(currentQuestion.type))"
          >
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              :style="badgeStyle(currentQuestion.id, optionLabels[oi]!, isMulti(currentQuestion.type))"
            >{{ optionLabels[oi] }}</div>
            <span class="text-sm" style="color: rgb(var(--md-on-surface))">{{ opt }}</span>
          </button>
        </div>
        <input
          v-else-if="currentQuestion.type === 'fill_blank'"
          v-model="answers[currentQuestion.id]"
          class="input-outlined w-full"
          :placeholder="i18n.t('practiceInputAnswerShort')"
        />
        <textarea
          v-else
          v-model="answers[currentQuestion.id]"
          rows="4"
          class="input-outlined w-full !min-h-[100px]"
          :placeholder="i18n.t('practiceInputAnswer')"
        />
      </div>

      <!-- Navigation -->
      <div class="flex items-center gap-3 mb-4">
        <button class="btn-tonal flex-1" :disabled="isFirst" @click="goTo(currentIndex - 1)">
          {{ i18n.t('practicePrevBtn') }}
        </button>
        <button v-if="!isLast" class="btn-filled flex-1" @click="goTo(currentIndex + 1)">
          {{ i18n.t('practiceNextBtn') }}
          <span class="text-xs opacity-60">({{ answeredCount }}/{{ exam.questions.length }})</span>
        </button>
        <button v-else class="btn-filled flex-1" :disabled="submitting" @click="handleSubmitClick">
          <CheckIcon class="w-4 h-4" />
          {{ submitting ? i18n.t('takeSubmitting') : i18n.t('takeSubmit') }}
        </button>
      </div>

      <Transition name="scale">
        <div
          v-if="submitError"
          class="mb-4 px-4 py-3 rounded-2xl text-sm"
          style="background-color: rgb(var(--md-error-container)); color: rgb(var(--md-on-error-container))"
        >
          {{ i18n.t('takeSubmitFailed') }}: {{ submitError }}
        </div>
      </Transition>
    </template>

    <!-- Result View -->
    <template v-else-if="result">
      <div class="card-filled p-5 sm:p-6 text-center mb-4">
        <div
          class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 elevation-1"
          style="background-color: rgb(var(--md-primary))"
        >
          <span class="text-2xl font-bold" style="color: rgb(var(--md-on-primary))">{{ result.score }}</span>
        </div>
        <h2 class="text-headline-sm mb-1" style="color: rgb(var(--md-on-surface))">{{ i18n.t('takeScore') }}</h2>
        <p class="text-body-md" style="color: rgb(var(--md-on-surface-variant))">{{ result.score }} / {{ result.totalScore }}</p>
        <p v-if="result.pendingCount > 0" class="text-sm mt-2" style="color: rgb(var(--md-on-surface-variant))">
          {{ i18n.t('takePendingReview', { n: result.pendingCount }) }}
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="card-outlined p-4 text-center">
          <CheckCircleIcon class="w-6 h-6 mx-auto mb-1" style="color: rgb(var(--md-primary))" />
          <div class="text-title-md">{{ result.correctCount }}</div>
          <div class="text-label-sm" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('practiceCorrect') }}</div>
        </div>
        <div class="card-outlined p-4 text-center">
          <XCircleIcon class="w-6 h-6 mx-auto mb-1" style="color: rgb(var(--md-error))" />
          <div class="text-title-md">{{ result.totalCount - result.correctCount - result.pendingCount }}</div>
          <div class="text-label-sm" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('practiceIncorrect') }}</div>
        </div>
      </div>

      <div class="space-y-3 mb-5">
        <div v-for="(g, i) in result.graded" :key="g.question.id" class="card-outlined p-4">
          <div class="flex items-start gap-2 mb-2">
            <span
              class="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
              :style="g.isCorrect === false
                ? { backgroundColor: 'rgb(var(--md-error-container))', color: 'rgb(var(--md-on-error-container))' }
                : { backgroundColor: 'rgb(var(--md-primary-container))', color: 'rgb(var(--md-on-primary-container))' }"
            >{{ i + 1 }}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm mb-2" style="color: rgb(var(--md-on-surface))">{{ g.question.stem }}</div>
              <QuestionImages
                :ids="g.question.images"
                compact
                :url-for="(id: string) => examMediaUrl(code, id)"
              />
              <div class="text-label-sm" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('takeYourAnswer') }}</div>
              <div class="text-sm mb-2" :style="{ color: g.isCorrect === false ? 'rgb(var(--md-error))' : 'rgb(var(--md-on-surface))' }">
                {{ g.userAnswer || i18n.t('takeUnanswered') }}
              </div>
              <div class="text-label-sm" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('takeCorrectAnswer') }}</div>
              <div class="text-sm mb-2" style="color: rgb(var(--md-primary))">{{ g.question.answer }}</div>
              <div v-if="g.question.analysis" class="text-xs" style="color: rgb(var(--md-on-surface-variant))">{{ g.question.analysis }}</div>
            </div>
          </div>
        </div>
      </div>

      <button class="btn-tonal w-full mb-8" @click="router.push('/')">{{ i18n.t('takeBackHome') }}</button>
    </template>

    <!-- Answer Sheet -->
    <Transition name="scale">
      <div v-if="showSheet && exam" class="scrim flex items-center justify-center p-4 z-50" @click.self="showSheet = false">
        <div class="card-elevated w-full max-w-sm p-5">
          <div class="text-title-sm mb-3">{{ i18n.t('practiceAnswerSheet') }}</div>
          <div class="grid grid-cols-6 sm:grid-cols-8 gap-2 mb-4">
            <button
              v-for="(q, i) in exam.questions"
              :key="q.id"
              class="aspect-square rounded-xl text-xs font-bold transition-all"
              :style="[
                (answers[q.id] || '').trim()
                  ? { backgroundColor: 'rgb(var(--md-primary))', color: 'rgb(var(--md-on-primary))' }
                  : { backgroundColor: 'rgb(var(--md-surface-container-highest))', color: 'rgb(var(--md-on-surface-variant))' },
                i === currentIndex ? { outline: '2px solid rgb(var(--md-primary))', outlineOffset: '2px' } : {},
              ]"
              @click="goTo(i); showSheet = false"
            >{{ i + 1 }}</button>
          </div>
          <button class="btn-tonal w-full" @click="showSheet = false">{{ i18n.t('pubClose') }}</button>
        </div>
      </div>
    </Transition>

    <!-- Report Dialog -->
    <Transition name="scale">
      <div v-if="showReport" class="scrim flex items-center justify-center p-4 z-50" @click.self="showReport = false">
        <div class="card-elevated w-full max-w-sm p-5 space-y-3">
          <div class="text-title-sm">{{ i18n.t('reportDialogTitle') }}</div>
          <template v-if="!reportSent">
            <textarea
              v-model="reportReason"
              rows="3"
              class="input-outlined w-full !min-h-[80px]"
              :placeholder="i18n.t('reportReasonPlaceholder')"
            />
            <div class="flex gap-3">
              <button class="btn-outlined flex-1" @click="showReport = false">{{ i18n.t('pubCancel') }}</button>
              <button class="btn-filled flex-1" @click="sendReport">{{ i18n.t('reportSubmit') }}</button>
            </div>
          </template>
          <p v-else class="text-sm text-center py-2" style="color: rgb(var(--md-primary))">{{ i18n.t('reportThanks') }}</p>
        </div>
      </div>
    </Transition>

    <!-- Submit Confirm -->
    <Transition name="scale">
      <div v-if="showSubmitConfirm" class="scrim flex items-center justify-center p-4 z-50" @click.self="showSubmitConfirm = false">
        <div class="card-elevated w-full max-w-sm p-5 text-center">
          <div class="text-title-sm mb-1">{{ i18n.t('takeSubmitConfirm', { n: unansweredCount }) }}</div>
          <div class="flex gap-3 mt-4">
            <button class="btn-outlined flex-1" @click="showSubmitConfirm = false">{{ i18n.t('pubCancel') }}</button>
            <button class="btn-filled flex-1" :disabled="submitting" @click="doSubmit">
              {{ submitting ? i18n.t('takeSubmitting') : i18n.t('takeSubmit') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
