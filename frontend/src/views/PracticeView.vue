<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { usePracticeStore } from '@/stores/practice'
import { useWrongQuestionsStore } from '@/stores/wrongQuestions'
import { useConfigStore } from '@/stores/config'
import { api } from '@/api'
import { isCloudflare } from '@/utils/platform'
import { matchPracticeFilter, reconcileMockConfig, reconcileMockTypeCounts } from '@/utils/practiceFilter'
import type { JudgeResult, ExplainResult } from '@exameow/shared'
import { useSwipeNavigation } from '@/composables/useSwipeNavigation'
import type { PracticeMode, MockExamConfig, WrongSort, PracticeFilter, QuestionType } from '@exameow/shared'
import type { PracticeDifficulty, PracticeFilterComparison } from '@/utils/practiceFilter'
import BankListCard from '@/components/practice/BankListCard.vue'
import FilterBar from '@/components/practice/FilterBar.vue'
import ImportDialog from '@/components/practice/ImportDialog.vue'
import ModeSelector from '@/components/practice/ModeSelector.vue'
import MockExamConfigComponent from '@/components/practice/MockExamConfig.vue'
import QuestionCard from '@/components/practice/QuestionCard.vue'
import ProgressBar from '@/components/practice/ProgressBar.vue'
import PracticeResult from '@/components/practice/PracticeResult.vue'
import AnswerSheet from '@/components/practice/AnswerSheet.vue'
import WrongQuestionsSortDialog from '@/components/practice/WrongQuestionsSortDialog.vue'
import PracticeModeToggle from '@/components/practice/PracticeModeToggle.vue'
import {
  ArrowLeftIcon,
  CheckIcon,
  XMarkIcon,
  PlayIcon,
  TrashIcon,
  ClockIcon,
  QueueListIcon,
  ArrowPathRoundedSquareIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline'

const i18n = useI18nStore()
const practiceStore = usePracticeStore()
const wrongStore = useWrongQuestionsStore()
const configStore = useConfigStore()

type ViewState = 'browse' | 'settings' | 'practice' | 'result'

const viewState = ref<ViewState>('browse')
const selectedBankId = ref<string | null>(null)
const practiceFilter = ref<PracticeFilterComparison>({})
const selectedMode = ref<PracticeMode | null>(null)
const mockConfig = ref<MockExamConfig>({ typeCounts: {} })
const showImportDialog = ref(false)
const showDeleteConfirm = ref(false)
const showClearSessionConfirm = ref(false)
const deleteBankId = ref<string | null>(null)
const showSubmitConfirm = ref(false)
const showAnswerSheet = ref(false)
const autoAdvancing = ref(false)
const aiJudging = ref(false)
const aiFeedback = ref<string | null>(null)
const aiJudgeError = ref<string | null>(null)
let judgeAbort: AbortController | null = null
const aiExplaining = ref(false)
const aiExplainError = ref<string | null>(null)
let explainAbort: AbortController | null = null
const elapsedText = ref('')
const showWrongSortDialog = ref(false)
const wrongSort = ref<WrongSort>('count-desc')
const wrongToast = ref<string | null>(null)
const savedMainSession = ref<any>(null)
const flashcardMode = ref<'exam' | 'flashcard'>('exam')
const swipeContainer = ref<HTMLElement | null>(null)

let pendingDirection: 'next' | 'prev' | null = null

function isView(state: ViewState) {
  return viewState.value === state
}

function doNavigate(dir: 'next' | 'prev') {
  if (animating.value) return
  if (dir === 'prev') {
    if (practiceStore.isFirstQuestion) return
    practiceStore.prevQuestion()
  } else {
    if (practiceStore.isLastQuestion) {
      showSubmitConfirm.value = true
      return
    }
    practiceStore.nextQuestion()
  }
}

function triggerNav(dir: 'next' | 'prev', fromGesture: boolean) {
  if (animating.value) return
  if (dir === 'prev' && practiceStore.isFirstQuestion) return
  if (dir === 'next' && practiceStore.isLastQuestion) {
    showSubmitConfirm.value = true
    return
  }
  if (fromGesture) {
    pendingDirection = dir
  } else {
    doNavigate(dir)
    pendingDirection = null
  }
}

function goPrev() {
  if (practiceStore.isFirstQuestion) return
  triggerNav('prev', true)
  triggerSlide('prev', 0)
}

function goNext() {
  if (practiceStore.isLastQuestion) {
    showSubmitConfirm.value = true
    return
  }
  triggerNav('next', true)
  triggerSlide('next', 0)
}

const { slideOffset, animating, triggerSlide, finishAnimation, attach, detach } = useSwipeNavigation(
  (dir) => triggerNav(dir, true),
  (direction, offset, width) => {
    const target = direction === 'next'
      ? -width
      : width
    slideOffset.value = offset
    void (swipeContainer.value?.offsetWidth)
    slideOffset.value = target
  },
)

function onTransitionEnd() {
  if (animating.value && pendingDirection) {
    const dir = pendingDirection
    pendingDirection = null
    finishAnimation()
    doNavigate(dir)
  } else {
    finishAnimation()
  }
}

const isMockMode = computed(() => practiceStore.session?.mode === 'mock')

const sessionBankName = computed(() => {
  if (!practiceStore.session) return ''
  const bank = practiceStore.getBank(practiceStore.session.bankId)
  return bank?.name ?? i18n.t('practiceUnknownBank')
})

const sessionProgressText = computed(() => {
  if (!practiceStore.session) return ''
  const answered = practiceStore.session.questions.filter(q => q.submitted).length
  return i18n.t('practiceAnsweredCount', { a: answered, t: practiceStore.progress.total })
})

const sessionModeIcon = computed(() => {
  if (!practiceStore.session) return null
  switch (practiceStore.session.mode) {
    case 'sequential': return QueueListIcon
    case 'random': return ArrowPathRoundedSquareIcon
    case 'mock': return ClockIcon
    case 'wrong': return ExclamationTriangleIcon
  }
})

const isWrongMode = computed(() => practiceStore.session?.mode === 'wrong')

const sessionBankId = computed(() => practiceStore.session?.bankId ?? null)

const currentWrongCount = computed(() => {
  if (!practiceStore.session || !practiceStore.currentQuestion) return undefined
  if (practiceStore.session.mode !== 'wrong') return undefined
  const originalId = practiceStore.currentQuestion.question.id.replace(/-s\d+$/, '')
  return wrongStore.getWrongEntry(practiceStore.session.bankId, originalId)?.wrongCount
})

const resumeSessionHasWrong = computed(() => {
  if (!practiceStore.session) return false
  return wrongStore.hasWrongQuestions(practiceStore.session.bankId)
})

onMounted(() => {
  if (!configStore.configured) configStore.loadSaved()
  if (practiceStore.session) {
    wrongStore.syncSession(practiceStore.session)
  }
})

watch([viewState, () => practiceStore.session], ([state]) => {
  nextTick(() => {
    if (swipeContainer.value) {
      detach(swipeContainer.value)
    }
    if (state === 'practice' && swipeContainer.value) {
      attach(swipeContainer.value)
    }
  })
})

watch(
  [() => practiceStore.session?.currentIndex, () => practiceStore.session?.startedAt],
  () => {
    judgeAbort?.abort()
    judgeAbort = null
    aiJudging.value = false
    aiFeedback.value = null
    aiJudgeError.value = null
    explainAbort?.abort()
    explainAbort = null
    aiExplaining.value = false
    aiExplainError.value = null
  },
)

onUnmounted(() => {
  judgeAbort?.abort()
  explainAbort?.abort()
  if (swipeContainer.value) {
    detach(swipeContainer.value)
  }
})

function resumeSession() {
  if (practiceStore.session?.filter) {
    practiceFilter.value = practiceStore.session.filter
  }
  viewState.value = 'practice'
  autoAdvancing.value = false
}

function confirmClearSession() {
  practiceStore.clearSession()
  showClearSessionConfirm.value = false
  viewState.value = 'browse'
  selectedBankId.value = null
  selectedMode.value = null
}

const sortedBanks = computed(() => {
  return [...practiceStore.banks].sort((a, b) => b.createdAt - a.createdAt)
})

const filteredQuestions = computed(() => {
  if (!selectedBankId.value) return []
  const bank = practiceStore.getBank(selectedBankId.value)
  if (!bank) return []
  return bank.questions.filter(q => matchPracticeFilter(q, practiceFilter.value))
})

const availableTypes = computed(() => {
  const counts: Record<string, number> = {}
  for (const q of filteredQuestions.value) {
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
    type: type as any,
    label: i18n.t(typeKeys[type] as any),
    count,
  }))
})

watch(availableTypes, (types) => {
  const reconciled = reconcileMockTypeCounts(mockConfig.value, types)
  if (JSON.stringify(reconciled.typeCounts) !== JSON.stringify(mockConfig.value.typeCounts)) {
    mockConfig.value = reconciled
  }
})

const effectiveMockConfig = computed(() => reconcileMockTypeCounts(mockConfig.value, availableTypes.value))

const canStartMockExam = computed(() => {
  return Object.values(effectiveMockConfig.value.typeCounts).some(c => c > 0)
})

const canStartSelectedMode = computed(() => {
  if (!selectedMode.value) return false
  if (selectedMode.value === 'wrong') return selectedBankId.value !== null && wrongStore.hasWrongQuestions(selectedBankId.value)
  return filteredQuestions.value.length > 0 && (selectedMode.value !== 'mock' || canStartMockExam.value)
})

function selectBank(id: string) {
  selectedBankId.value = id
  const bank = practiceStore.getBank(id)
  const types = [...new Set(bank?.questions.map(q => q.type) ?? [])] as QuestionType[]
  practiceFilter.value = { types }
  selectedMode.value = null
  mockConfig.value = { typeCounts: {} }
  viewState.value = 'settings'
}

function handleModeSelect(mode: PracticeMode) {
  selectedMode.value = mode
  if (mode === 'wrong') {
    showWrongSortDialog.value = true
  }
}

function startSettingsPractice() {
  if (!selectedMode.value) return
  if (selectedMode.value === 'wrong') {
    showWrongSortDialog.value = true
  } else if (selectedMode.value === 'mock') {
    if (canStartMockExam.value) startPractice('mock')
  } else {
    startPractice(selectedMode.value)
  }
}

function startPractice(mode: PracticeMode) {
  if (!selectedBankId.value) return
  const started = practiceStore.startSession(selectedBankId.value, mode, mode === 'mock' ? effectiveMockConfig.value : undefined, undefined, practiceFilter.value as PracticeFilter)
  if (!started) return
  viewState.value = 'practice'
  autoAdvancing.value = false
}

function handleStartWrongPractice(sort: WrongSort) {
  showWrongSortDialog.value = false
  startWrongPractice(sort)
}

function startWrongPractice(sort: WrongSort) {
  if (!selectedBankId.value) return
  const wrongQs = wrongStore.getWrongQuestions(selectedBankId.value, sort)
  if (wrongQs.length === 0) return
  if (practiceStore.session && practiceStore.session.mode !== 'wrong') {
    savedMainSession.value = JSON.parse(JSON.stringify(practiceStore.session))
  }
  wrongSort.value = sort
  practiceStore.startSession(selectedBankId.value, 'wrong', undefined, wrongQs)
  viewState.value = 'practice'
  autoAdvancing.value = false
  selectedMode.value = 'wrong'
}

function handleWrongPracticeFromCard() {
  if (!practiceStore.session) return
  selectedBankId.value = practiceStore.session.bankId
  showWrongSortDialog.value = true
}

function handleRemoveWrong() {
  if (!practiceStore.session || !practiceStore.currentQuestion) return
  const originalId = practiceStore.currentQuestion.question.id.replace(/-s\d+$/, '')
  wrongStore.removeWrong(practiceStore.session.bankId, originalId)
  showToast('wrongRemoved')
  const isEmpty = practiceStore.removeCurrentQuestion()
  if (isEmpty) {
    elapsedText.value = practiceStore.formatTime(practiceStore.getElapsedTime())
    viewState.value = 'result'
  }
}

function handleManageWrong(bankId: string) {
  selectedBankId.value = bankId
  showWrongSortDialog.value = true
}

function showToast(msg: string) {
  wrongToast.value = msg
  setTimeout(() => {
    if (wrongToast.value === msg) {
      wrongToast.value = null
    }
  }, 2500)
}

function handleImportDone(count: number) {
  showImportDialog.value = false
  if (count > 0) {
    showToast(i18n.t('practiceImportSuccess', { n: count }))
  }
}

function handleSelect(answer: string | null) {
  practiceStore.setAnswer(answer)
}

function handleSubmit(answer: string | null) {
  const isCorrect = practiceStore.submitAnswer(answer)

  if (practiceStore.currentQuestion && sessionBankId.value) {
    const originalId = practiceStore.currentQuestion.question.id.replace(/-s\d+$/, '')
    if (isCorrect === true) {
      const removed = wrongStore.recordCorrect(sessionBankId.value, originalId)
      if (removed) {
        showToast('wrongAutoRemoved')
      }
    } else if (isCorrect === false) {
      wrongStore.recordWrong(sessionBankId.value, originalId)
    }
  }

  if (isCorrect === true && !isMockMode.value) {
    autoAdvancing.value = true
    setTimeout(() => {
      autoAdvancing.value = false
      if (practiceStore.isLastQuestion) {
        finalizeSession()
      } else {
        goNext()
      }
    }, 600)
  }
}

function applyGrade(correct: boolean) {
  practiceStore.selfCheck(correct)

  if (practiceStore.currentQuestion && sessionBankId.value) {
    const originalId = practiceStore.currentQuestion.question.id.replace(/-s\d+$/, '')
    if (correct) {
      const removed = wrongStore.recordCorrect(sessionBankId.value, originalId)
      if (removed) {
        showToast('wrongAutoRemoved')
      }
    } else {
      wrongStore.recordWrong(sessionBankId.value, originalId)
    }
  }
}

function handleSelfCheck(correct: boolean) {
  applyGrade(correct)

  if (correct && !isMockMode.value) {
    autoAdvancing.value = true
    setTimeout(() => {
      autoAdvancing.value = false
      if (practiceStore.isLastQuestion) {
        finalizeSession()
      } else {
        goNext()
      }
    }, 600)
  }
}

function handleRegrade(correct: boolean) {
  applyGrade(correct)
}

function handleAiCancel() {
  judgeAbort?.abort()
  explainAbort?.abort()
}

async function handleAiExplain() {
  const item = practiceStore.currentQuestion
  if (!item || !item.submitted || aiExplaining.value) return

  if (!configStore.configured) {
    await configStore.loadSaved()
    if (!configStore.configured) {
      aiExplainError.value = i18n.t('searchNotConfigured')
      return
    }
  }

  aiExplaining.value = true
  aiExplainError.value = null
  explainAbort = new AbortController()
  const language = i18n.locale === 'zh' ? 'Chinese' : 'English'
  const qIndex = practiceStore.session?.currentIndex
  const q = item.question
  const optionsText = q.options.length
    ? '\n' + q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
    : ''
  const params = {
    stem: q.stem + optionsText,
    reference_answer: q.answer,
    analysis: q.analysis || undefined,
  }

  try {
    const config = configStore.getConfig()
    let result: ExplainResult
    if (isCloudflare() && configStore.aiProvider === 'custom') {
      const { explainViaCustomAI } = await import('@/utils/answerClient')
      result = await explainViaCustomAI(params, language, config, explainAbort.signal)
    } else {
      result = await api.explainQuestion(params, language, config, explainAbort.signal)
    }
    if (practiceStore.session?.currentIndex !== qIndex) return
    practiceStore.saveAiAnalysis(q.id, result.explanation)
  } catch (e: any) {
    if (e?.name !== 'AbortError') aiExplainError.value = e?.message || String(e)
  } finally {
    aiExplaining.value = false
    explainAbort = null
  }
}

async function handleAiJudge() {
  const item = practiceStore.currentQuestion
  if (!item || !item.userAnswer || aiJudging.value || item.submitted) return

  if (!configStore.configured) {
    await configStore.loadSaved()
    if (!configStore.configured) {
      aiJudgeError.value = i18n.t('searchNotConfigured')
      return
    }
  }

  aiJudging.value = true
  aiJudgeError.value = null
  aiFeedback.value = null
  judgeAbort = new AbortController()
  const language = i18n.locale === 'zh' ? 'Chinese' : 'English'
  const qIndex = practiceStore.session?.currentIndex
  const q = item.question
  const params = {
    stem: q.stem,
    reference_answer: q.answer,
    analysis: q.analysis || undefined,
    user_answer: item.userAnswer,
  }

  try {
    const config = configStore.getConfig()
    let result: JudgeResult
    if (isCloudflare() && configStore.aiProvider === 'custom') {
      const { judgeViaCustomAI } = await import('@/utils/answerClient')
      result = await judgeViaCustomAI(params, language, config, judgeAbort.signal)
    } else {
      result = await api.judgeAnswer(params, language, config, judgeAbort.signal)
    }
    if (practiceStore.session?.currentIndex !== qIndex) return
    aiFeedback.value = result.feedback
    applyGrade(result.correct)
  } catch (e: any) {
    if (e?.name !== 'AbortError') aiJudgeError.value = e?.message || String(e)
  } finally {
    aiJudging.value = false
    judgeAbort = null
  }
}

function finalizeSession() {
  practiceStore.finishSession()
  elapsedText.value = practiceStore.formatTime(practiceStore.getElapsedTime())
  viewState.value = 'result'
}

function handleSubmitAll() {
  finalizeSession()
  showSubmitConfirm.value = false
}

function handleRetry() {
  const s = practiceStore.session
  if (!s) return
  if (s.mode === 'wrong') {
    practiceStore.clearSession()
    startWrongPractice(wrongSort.value)
    return
  }
  practiceStore.clearSession()
  const bank = practiceStore.getBank(s.bankId)
  const retryPool = bank?.questions.filter(q => matchPracticeFilter(q, s.filter)) ?? []
  const retryMockConfig = s.mode === 'mock' && s.mockConfig
    ? reconcileMockConfig(s.mockConfig, retryPool)
    : s.mockConfig
  const started = practiceStore.startSession(s.bankId, s.mode, retryMockConfig, undefined, s.filter)
  if (!started) return
  viewState.value = 'practice'
  autoAdvancing.value = false
}

function handleHome() {
  practiceStore.clearSession()
  if (savedMainSession.value) {
    practiceStore.session = savedMainSession.value
    localStorage.setItem('exameow-practice-session', JSON.stringify(savedMainSession.value))
    savedMainSession.value = null
  }
  selectedBankId.value = null
  selectedMode.value = null
  mockConfig.value = { typeCounts: {} }
  practiceFilter.value = {}
  showWrongSortDialog.value = false
  viewState.value = 'browse'
}

function handleDelete(id: string) {
  deleteBankId.value = id
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (deleteBankId.value) {
    practiceStore.removeBank(deleteBankId.value)
    if (selectedBankId.value === deleteBankId.value) {
      selectedBankId.value = null
    }
  }
  showDeleteConfirm.value = false
  deleteBankId.value = null
}

function handleBack() {
  if (viewState.value === 'settings') {
    viewState.value = 'browse'
    selectedBankId.value = null
    practiceFilter.value = {}
    return
  }
  if (viewState.value === 'practice') {
    if (practiceStore.session?.mode === 'wrong') {
      practiceStore.session = null
      if (savedMainSession.value) {
        practiceStore.session = savedMainSession.value
        localStorage.setItem('exameow-practice-session', JSON.stringify(savedMainSession.value))
        savedMainSession.value = null
      }
    }
    viewState.value = 'browse'
    selectedBankId.value = null
    selectedMode.value = null
  } else if (viewState.value === 'result') {
    viewState.value = 'browse'
    selectedBankId.value = null
    selectedMode.value = null
  }
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-display-sm mb-1">{{ i18n.t('practiceTitle') }}</h1>
        <p class="text-body-lg" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ viewState === 'browse'
            ? i18n.t('practiceSubtitle')
            : viewState === 'result'
              ? i18n.t('practiceResultTitle')
              : practiceStore.session && practiceStore.progress.total > 0
                ? i18n.t('practiceProgress', { c: practiceStore.progress.current, t: practiceStore.progress.total })
                : ''
          }}
        </p>
      </div>
      <button
        v-if="viewState !== 'browse'"
        class="btn-icon"
        @click="handleBack"
      >
        <ArrowLeftIcon class="w-5 h-5 rtl:rotate-180" />
      </button>
    </div>

    <!-- Browse View -->
    <template v-if="viewState === 'browse'">
      <!-- Resume Session Card -->
      <div
        v-if="practiceStore.hasSession"
        class="card-elevated p-3 sm:p-5 mb-4 border-2 transition-all duration-200"
        :style="{ borderColor: 'rgb(var(--md-primary) / 0.3)' }"
      >
        <div class="flex items-start gap-3 sm:gap-4">
          <div
            class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0"
            :style="{ backgroundColor: 'rgb(var(--md-primary-container))' }"
          >
            <component :is="sessionModeIcon" class="w-5 h-5 sm:w-6 sm:h-6" :style="{ color: 'rgb(var(--md-on-primary-container))' }" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-title-sm truncate" :style="{ color: 'rgb(var(--md-on-surface))' }">
              {{ i18n.t('practiceContinuePractice') }}
            </div>
            <div class="text-body-sm mt-0.5 truncate" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ sessionBankName }} · {{ sessionProgressText }}
            </div>
            <div class="h-1.5 rounded-full overflow-hidden mt-2 w-full" :style="{ backgroundColor: 'rgba(var(--md-primary) / 0.12)' }">
              <div
                class="h-full rounded-full transition-all"
                :style="{
                  backgroundColor: 'rgb(var(--md-primary))',
                  width: `${practiceStore.session ? Math.round((practiceStore.session.questions.filter(q => q.submitted).length / practiceStore.progress.total) * 100) : 0}%`,
                }"
              />
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 mt-3">
          <button
            class="btn-icon !w-7 !h-7 sm:!w-8 sm:!h-8 shrink-0"
            :style="{ color: 'rgb(var(--md-on-surface-variant))' }"
            @click="showClearSessionConfirm = true"
          >
            <TrashIcon class="w-4 h-4" />
          </button>
          <div class="flex items-center gap-2 ml-auto flex-wrap">
            <button
              v-if="resumeSessionHasWrong"
              class="btn-tonal !h-8 sm:!h-9 text-xs sm:text-sm !px-3 sm:!px-4 shrink-0 max-w-full"
              :style="{
                borderColor: 'rgb(var(--md-error))',
                color: 'rgb(var(--md-error))',
              }"
              @click="handleWrongPracticeFromCard"
            >
              <ExclamationTriangleIcon class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span class="truncate">{{ i18n.t('practiceWrongPractice') }}</span>
            </button>
            <button class="btn-filled !h-8 sm:!h-9 text-xs sm:text-sm !px-3 sm:!px-4 shrink-0 max-w-full" @click="resumeSession">
              <PlayIcon class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span class="truncate">{{ i18n.t('practiceContinue') }}</span>
            </button>
          </div>
        </div>
      </div>

      <BankListCard
        :banks="sortedBanks"
        :selected-id="selectedBankId"
        @select="selectBank"
        @delete="handleDelete"
        @import="showImportDialog = true"
        @manage-wrong="handleManageWrong"
      />
    </template>

    <!-- Practice Settings -->
    <template v-if="isView('settings') && selectedBankId">
      <div class="mb-4">
        <div class="text-sm truncate" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ practiceStore.getBank(selectedBankId)?.name }}
        </div>
        <div class="text-title-md truncate" :style="{ color: 'rgb(var(--md-on-surface))' }">
          {{ i18n.t('practiceQuestionUnit', { n: practiceStore.getBank(selectedBankId)!.questions.length }) }}
        </div>
      </div>
      <div class="grid gap-4 lg:grid-cols-2 items-start">
        <ModeSelector
          v-model="selectedMode"
          :has-wrong-questions="wrongStore.hasWrongQuestions(selectedBankId)"
        />
        <FilterBar
          :bank="practiceStore.getBank(selectedBankId)!"
          v-model="practiceFilter"
        />
      </div>
      <div v-if="selectedMode === 'mock'" class="mt-4">
        <MockExamConfigComponent
          :available-types="availableTypes"
          :config="mockConfig"
          @update:config="mockConfig = $event"
        />
      </div>
      <button
        class="btn-filled w-full mt-4 !h-12 !text-base !font-semibold"
        :disabled="!canStartSelectedMode"
        @click="startSettingsPractice"
      >
        <PlayIcon class="w-5 h-5" />
        {{ i18n.t('practiceStartBtn') }}
      </button>
    </template>

    <!-- Practice View -->
    <template v-if="isView('practice') && practiceStore.session && practiceStore.currentQuestion">
      <div ref="swipeContainer" class="space-y-4 cursor-grab select-none">
        <!-- Progress Bar + Mode Toggle -->
        <div class="card-outlined p-3">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <ProgressBar
              :mode="practiceStore.session.mode"
              :current="practiceStore.progress.current"
              :total="practiceStore.progress.total"
              :answered-count="practiceStore.answeredCount"
              @open-sheet="showAnswerSheet = true"
              class="flex-1 min-w-0"
            />
            <PracticeModeToggle
              v-model="flashcardMode"
            />
          </div>
        </div>

        <!-- Question Card -->
        <div
          :style="{
            transform: `translateX(${slideOffset}px)`,
            transition: animating ? 'transform 0.28s cubic-bezier(0.2, 0, 0, 1)' : 'none',
          }"
          @transitionend="onTransitionEnd"
        >
          <QuestionCard
            :key="practiceStore.session.currentIndex"
            :question="practiceStore.currentQuestion.question"
            :mode="practiceStore.session.mode"
            :user-answer="practiceStore.currentQuestion.userAnswer"
            :is-correct="practiceStore.currentQuestion.isCorrect"
            :submitted="practiceStore.currentSubmitted"
            :question-number="practiceStore.progress.current"
            :auto-advancing="autoAdvancing"
            :wrong-count="currentWrongCount"
            :is-wrong-mode="isWrongMode"
            :flashcard-mode="flashcardMode === 'flashcard'"
            :ai-configured="configStore.configured"
            :ai-judging="aiJudging"
            :ai-feedback="aiFeedback"
            :ai-judge-error="aiJudgeError"
            :ai-explaining="aiExplaining"
            :ai-explain-error="aiExplainError"
            @ai-judge="handleAiJudge"
            @ai-cancel="handleAiCancel"
            @ai-explain="handleAiExplain"
            @regrade="handleRegrade"
            @submit="handleSubmit"
            @select="handleSelect"
            @self-check="handleSelfCheck"
            @remove-wrong="handleRemoveWrong"
          />
        </div>

        <!-- Navigation -->
        <div class="flex items-center gap-3">
          <button
            class="btn-tonal flex-1"
            :disabled="practiceStore.isFirstQuestion"
            @click="goPrev"
          >
            {{ i18n.t('practicePrevBtn') }}
          </button>

          <button class="btn-filled flex-1" @click="goNext" :disabled="autoAdvancing">
            <template v-if="practiceStore.isLastQuestion">
              <CheckIcon class="w-4 h-4" />
              {{ i18n.t('practiceSubmitBtn') }}
            </template>
            <template v-else>
              {{ i18n.t('practiceNextBtn') }}
              <span class="text-xs opacity-60">({{ practiceStore.answeredCount }}/{{ practiceStore.progress.total }})</span>
            </template>
          </button>
        </div>
      </div>
    </template>

    <!-- Result View -->
    <template v-if="isView('result') && practiceStore.session">
      <PracticeResult
        :session="practiceStore.session"
        :score="practiceStore.score"
        :auto-graded-count="practiceStore.autoGradedCount"
        :elapsed-text="elapsedText"
        @retry="handleRetry"
        @home="handleHome"
      />
    </template>

    <!-- Import Dialog -->
    <Transition name="scale">
      <div v-if="showImportDialog" class="scrim flex items-center justify-center p-4" @click.self="showImportDialog = false">
        <div class="card-elevated w-full max-w-lg max-h-[80vh] overflow-y-auto p-5">
          <ImportDialog @close="showImportDialog = false" @imported="handleImportDone" />
        </div>
      </div>
    </Transition>

    <!-- Answer Sheet -->
    <Transition name="scale">
      <AnswerSheet
        v-if="showAnswerSheet"
        @close="showAnswerSheet = false"
      />
    </Transition>

    <!-- Wrong Questions Sort Dialog -->
    <WrongQuestionsSortDialog
      v-if="showWrongSortDialog"
      :wrong-count="selectedBankId ? wrongStore.getWrongCount(selectedBankId) : 0"
      @start="handleStartWrongPractice"
      @close="showWrongSortDialog = false"
    />

    <!-- Toast -->
    <Transition name="scale">
      <div
        v-if="wrongToast"
        class="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] sm:bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium z-50 shadow-lg"
        :style="{
          backgroundColor: 'rgb(var(--md-inverse-surface))',
          color: 'rgb(var(--md-inverse-on-surface))',
        }"
      >
        {{ wrongToast }}
      </div>
    </Transition>

    <!-- Delete Confirm Dialog -->
    <Transition name="scale">
      <div v-if="showDeleteConfirm" class="scrim flex items-center justify-center p-4" @click.self="showDeleteConfirm = false">
        <div class="card-elevated w-full max-w-sm p-5 text-center">
          <XMarkIcon class="w-10 h-10 mx-auto mb-3" :style="{ color: 'rgb(var(--md-error))' }" />
          <div class="text-title-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
            {{ i18n.t('practiceDeleteConfirm') }}
          </div>
          <div class="flex gap-3 mt-4">
            <button class="btn-outlined flex-1" @click="showDeleteConfirm = false">{{ i18n.t('btnBack') }}</button>
            <button class="btn-filled flex-1" :style="{ backgroundColor: 'rgb(var(--md-error))', color: 'rgb(var(--md-on-error))' }" @click="confirmDelete">
              {{ i18n.t('practiceDeleteBank') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Clear Session Dialog -->
    <Transition name="scale">
      <div v-if="showClearSessionConfirm" class="scrim flex items-center justify-center p-4" @click.self="showClearSessionConfirm = false">
        <div class="card-elevated w-full max-w-sm p-5 text-center">
          <TrashIcon class="w-10 h-10 mx-auto mb-3" :style="{ color: 'rgb(var(--md-error))' }" />
          <div class="text-title-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
            {{ i18n.t('practiceClearProgress') }}
          </div>
          <p class="text-body-sm mb-4" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('practiceClearProgressMsg') }}
          </p>
          <div class="flex gap-3">
            <button class="btn-outlined flex-1" @click="showClearSessionConfirm = false">{{ i18n.t('practiceCancel') }}</button>
            <button
              class="btn-filled flex-1"
              :style="{ backgroundColor: 'rgb(var(--md-error))', color: 'rgb(var(--md-on-error))' }"
              @click="confirmClearSession"
            >
               {{ i18n.t('practiceClear') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Submit Confirm Dialog -->
    <Transition name="scale">
      <div v-if="showSubmitConfirm" class="scrim flex items-center justify-center p-4" @click.self="showSubmitConfirm = false">
        <div class="card-elevated w-full max-w-sm p-5 text-center">
          <div class="text-title-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
            {{ i18n.t('practiceSubmitConfirm') }}
          </div>
          <div v-if="practiceStore.hasUnanswered" class="text-body-sm mt-2 mb-3" :style="{ color: 'rgb(var(--md-error))' }">
            {{ i18n.t('practiceUnansweredCount', { n: practiceStore.progress.total - practiceStore.answeredCount }) }}
          </div>
          <p class="text-body-sm mb-4" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('practiceSubmitConfirmMsg') }}
          </p>
          <div class="flex gap-3">
            <button class="btn-outlined flex-1" @click="showSubmitConfirm = false">{{ i18n.t('btnBack') }}</button>
            <button class="btn-filled flex-1" @click="handleSubmitAll">
              <CheckIcon class="w-4 h-4" />
              {{ i18n.t('practiceSubmitBtn') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
