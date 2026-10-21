<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { useConfigStore } from '@/stores/config'
import { usePracticeStore } from '@/stores/practice'
import { useLearnStore } from '@/stores/learn'
import ChatBubble from '@/components/learn/ChatBubble.vue'
import ChatComposer from '@/components/learn/ChatComposer.vue'
import { ArrowLeftIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, GlobeAltIcon, QueueListIcon, SparklesIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const i18n = useI18nStore()
const configStore = useConfigStore()
const practiceStore = usePracticeStore()
const learn = useLearnStore()

const listEl = ref<HTMLElement | null>(null)
const showLlmDialog = ref(false)
const showSearchDialog = ref(false)
const SEARCH_TIP_KEY = 'exameow-learn-search-tip-dismissed'

const visibleMessages = computed(() => learn.messages.filter((m) => !m.hidden))
const notConfigured = computed(() => !configStore.configured)
const errorMessage = computed(() =>
  learn.error && learn.error !== 'not-configured' ? learn.error : '',
)
const progressText = computed(() =>
  i18n.t('practiceProgress', { c: learn.progress.current, t: learn.progress.total }),
)

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(
  () => learn.messages.map((m) => m.content.length).join(','),
  scrollToBottom,
)

onMounted(async () => {
  if (!configStore.configured) await configStore.loadSaved()
  if (!learn.hasSession) {
    router.replace('/practice')
    return
  }
  if (!configStore.configured) {
    showLlmDialog.value = true
  } else if (!configStore.searchConfigured && !localStorage.getItem(SEARCH_TIP_KEY)) {
    showSearchDialog.value = true
  }
  scrollToBottom()
})

onUnmounted(() => {
  learn.stop()
})

function handleSend(text: string) {
  void learn.send(text)
}

function toggleSearch() {
  if (!configStore.searchConfigured) {
    showSearchDialog.value = true
    return
  }
  learn.webSearchEnabled = !learn.webSearchEnabled
}

function toggleThinking() {
  learn.deepThinkingEnabled = !learn.deepThinkingEnabled
}

function goBack() {
  router.push('/practice')
}

/** Switch to normal practice, positioned on the question currently being studied. */
function backToPractice() {
  const bankId = learn.bankId
  const target = learn.currentQuestion
  if (!bankId || !target) {
    router.push('/practice')
    return
  }
  const existing = practiceStore.session
  const aligned =
    existing !== null &&
    existing.bankId === bankId &&
    existing.questions[learn.currentIndex]?.question.stem === target.stem
  if (aligned) {
    practiceStore.goToQuestion(learn.currentIndex)
  } else {
    const started = practiceStore.startSession(
      bankId,
      'sequential',
      undefined,
      learn.questions.slice(),
      undefined,
    )
    if (!started) {
      router.push('/practice')
      return
    }
    practiceStore.goToQuestion(learn.currentIndex)
  }
  router.push({ path: '/practice', query: { resume: '1' } })
}

function goConfig() {
  showLlmDialog.value = false
  showSearchDialog.value = false
  router.push('/mine/config')
}

function goSearchConfig() {
  showSearchDialog.value = false
  localStorage.setItem(SEARCH_TIP_KEY, '1')
  router.push({ path: '/mine/config', query: { section: 'search' } })
}

function dismissSearchTip() {
  showSearchDialog.value = false
  localStorage.setItem(SEARCH_TIP_KEY, '1')
}
</script>

<template>
  <div class="flex flex-col h-[calc(100dvh-11rem)] sm:h-[calc(100dvh-9rem)]">
    <!-- Header -->
    <div class="shrink-0 flex items-center gap-2 mb-3">
      <button class="btn-icon" @click="goBack">
        <ArrowLeftIcon class="w-5 h-5 rtl:rotate-180" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-title-md truncate" :style="{ color: 'rgb(var(--md-on-surface))' }">
          {{ i18n.t('learnTitle') }}
        </div>
        <div class="text-body-sm truncate" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ learn.bankName }} · {{ progressText }}
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          class="btn-icon"
          :title="i18n.t('learnRestart')"
          :aria-label="i18n.t('learnRestart')"
          @click="learn.restart()"
        >
          <ArrowPathIcon class="w-4 h-4" />
        </button>
        <button
          class="btn-outlined !h-9 !px-3 shrink-0"
          :title="i18n.t('practiceModeSequential')"
          @click="backToPractice"
        >
          <QueueListIcon class="w-4 h-4" />
          <span class="hidden lg:inline">{{ i18n.t('practiceModeSequential') }}</span>
        </button>
        <button class="btn-tonal !h-9 !px-3" :disabled="learn.isFirst" @click="learn.prev()">
          <ChevronLeftIcon class="w-4 h-4 rtl:rotate-180" />
          <span class="hidden sm:inline">{{ i18n.t('practicePrevBtn') }}</span>
        </button>
        <button class="btn-tonal !h-9 !px-3" :disabled="learn.isLast" @click="learn.next()">
          <span class="hidden sm:inline">{{ i18n.t('practiceNextBtn') }}</span>
          <ChevronRightIcon class="w-4 h-4 rtl:rotate-180" />
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div ref="listEl" class="flex-1 overflow-y-auto space-y-4 py-1 pr-1">
      <ChatBubble
        v-for="m in visibleMessages"
        :key="m.id"
        :message="m"
        :question="m.kind === 'question' ? learn.currentQuestion : null"
        :disabled="learn.streaming || notConfigured"
        @answer="handleSend"
      />
    </div>

    <!-- Error -->
    <div
      v-if="errorMessage"
      class="shrink-0 mt-2 p-3 rounded-xl text-sm flex items-center justify-between gap-2"
      :style="{ backgroundColor: 'rgba(var(--md-error), 0.08)', color: 'rgb(var(--md-error))' }"
    >
      <span class="min-w-0 break-words">{{ errorMessage }}</span>
      <button class="btn-tonal !h-7 !px-3 text-xs shrink-0" @click="learn.retry()">
        {{ i18n.t('searchRetry') }}
      </button>
    </div>

    <!-- Not configured -->
    <div v-if="notConfigured" class="shrink-0 mt-2 text-center">
      <button class="text-sm underline" :style="{ color: 'rgb(var(--md-error))' }" @click="goConfig">
        {{ i18n.t('searchNotConfigured') }}
      </button>
    </div>

    <!-- Composer -->
    <div class="shrink-0 mt-3">
      <ChatComposer
        :streaming="learn.streaming"
        :awaiting-answer="learn.awaitingAnswer"
        :disabled="notConfigured"
        :search-enabled="learn.webSearchEnabled"
        :thinking-enabled="learn.deepThinkingEnabled"
        @send="handleSend"
        @stop="learn.stop()"
        @toggle-search="toggleSearch"
        @toggle-thinking="toggleThinking"
      />
    </div>

    <Transition name="scale">
      <div v-if="showLlmDialog" class="scrim flex items-center justify-center p-4">
        <div class="card-elevated w-full max-w-sm p-6 text-center">
          <div
            class="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            :style="{ backgroundColor: 'rgb(var(--md-primary-container))' }"
          >
            <SparklesIcon class="w-6 h-6" :style="{ color: 'rgb(var(--md-on-primary-container))' }" />
          </div>
          <div class="text-title-md mb-2" :style="{ color: 'rgb(var(--md-on-surface))' }">
            {{ i18n.t('learnNeedLlmTitle') }}
          </div>
          <p class="text-body-sm mb-5" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('learnNeedLlmDesc') }}
          </p>
          <div class="flex gap-3">
            <button class="btn-outlined flex-1" @click="goBack">{{ i18n.t('btnBack') }}</button>
            <button class="btn-filled flex-1" @click="goConfig">{{ i18n.t('learnNeedLlmCta') }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="scale">
      <div
        v-if="showSearchDialog"
        class="scrim flex items-center justify-center p-4"
        @click.self="dismissSearchTip"
      >
        <div class="card-elevated w-full max-w-sm p-6 text-center">
          <div
            class="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            :style="{ backgroundColor: 'rgb(var(--md-secondary-container))' }"
          >
            <GlobeAltIcon class="w-6 h-6" :style="{ color: 'rgb(var(--md-on-secondary-container))' }" />
          </div>
          <div class="text-title-md mb-2" :style="{ color: 'rgb(var(--md-on-surface))' }">
            {{ i18n.t('learnSearchTipTitle') }}
          </div>
          <p class="text-body-sm mb-5" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('learnSearchTipDesc') }}
          </p>
          <div class="flex gap-3">
            <button class="btn-outlined flex-1" @click="dismissSearchTip">
              {{ i18n.t('learnSearchTipDismiss') }}
            </button>
            <button class="btn-filled flex-1" @click="goSearchConfig">
              {{ i18n.t('learnSearchTipCta') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
