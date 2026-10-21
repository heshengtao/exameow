<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import type { PracticeSession } from '@exameow/shared'
import QuestionImages from '@/components/practice/QuestionImages.vue'
import { allMediaIds } from '@/utils/questionMedia'
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/vue/24/outline'

const props = defineProps<{
  session: PracticeSession
  score: number
  autoGradedCount: number
  elapsedText: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'home'): void
}>()

const i18n = useI18nStore()

const total = computed(() => props.session.questions.length)
const accuracy = computed(() => {
  if (props.autoGradedCount === 0) return 0
  return Math.round((props.score / props.autoGradedCount) * 100)
})

const wrongQuestions = computed(() => {
  return props.session.questions
    .map((q, i) => ({ ...q, originalIndex: i }))
    .filter(q => q.isCorrect === false)
})

const correctCount = computed(() => {
  return props.session.questions.filter(q => q.isCorrect === true).length
})

const wrongCount = computed(() => {
  return wrongQuestions.value.length
})

const typeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    single_choice: i18n.t('typeSingle'),
    multi_choice: i18n.t('typeMulti'),
    true_false: i18n.t('typeTrueFalse'),
    fill_blank: i18n.t('typeFillBlank'),
    short_answer: i18n.t('typeShortAnswer'),
  }
  return labels[type] ?? type
}
</script>

<template>
  <div class="space-y-5">
    <!-- Score Card -->
    <div class="card-filled p-5 sm:p-6 text-center">
      <div
        class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 elevation-1"
        :style="{ backgroundColor: 'rgb(var(--md-primary))' }"
      >
        <span class="text-2xl font-bold" :style="{ color: 'rgb(var(--md-on-primary))' }">{{ score }}</span>
      </div>
      <h2 class="text-headline-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceResultTitle') }}
      </h2>
      <p class="text-body-md" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ score }} / {{ total }}
      </p>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 gap-3">
      <div class="card-outlined p-4 text-center">
        <CheckCircleIcon class="w-6 h-6 mx-auto mb-1" :style="{ color: 'rgb(var(--md-primary))' }" />
        <div class="text-title-md" :style="{ color: 'rgb(var(--md-on-surface))' }">{{ correctCount }}</div>
        <div class="text-label-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceCorrect') }}
        </div>
      </div>
      <div class="card-outlined p-4 text-center">
        <XCircleIcon class="w-6 h-6 mx-auto mb-1" :style="{ color: 'rgb(var(--md-error))' }" />
        <div class="text-title-md" :style="{ color: 'rgb(var(--md-on-surface))' }">{{ wrongCount }}</div>
        <div class="text-label-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceIncorrect') }}
        </div>
      </div>
    </div>

    <!-- Accuracy & Time -->
    <div class="card-outlined p-4 flex items-center justify-between">
      <div class="text-center flex-1">
        <div class="text-display-sm font-bold" :style="{ color: 'rgb(var(--md-primary))' }">
          {{ autoGradedCount > 0 ? accuracy + '%' : '--' }}
        </div>
        <div class="text-label-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceAccuracy') }}
        </div>
      </div>
      <div class="w-px h-10 mx-2" :style="{ backgroundColor: 'rgb(var(--md-outline-variant))' }" />
      <div class="text-center flex-1 flex items-center justify-center gap-2">
        <ClockIcon class="w-5 h-5" :style="{ color: 'rgb(var(--md-on-surface-variant))' }" />
        <div>
          <div class="text-title-md" :style="{ color: 'rgb(var(--md-on-surface))' }">{{ elapsedText }}</div>
          <div class="text-label-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
            {{ i18n.t('practiceElapsed') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Wrong Questions Review -->
    <div v-if="wrongQuestions.length > 0" class="space-y-3">
      <h3 class="text-title-sm" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceReviewTitle') }} ({{ wrongQuestions.length }})
      </h3>

      <div
        v-for="item in wrongQuestions"
        :key="item.originalIndex"
        class="card-outlined p-4"
      >
        <div class="flex items-start gap-2 mb-2">
          <span
            class="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
            :style="{
              backgroundColor: 'rgb(var(--md-error-container))',
              color: 'rgb(var(--md-on-error-container))',
            }"
          >{{ item.originalIndex + 1 }}</span>
          <div class="flex-1">
            <div class="text-sm mb-2" :style="{ color: 'rgb(var(--md-on-surface))' }">{{ item.question.stem }}</div>
            <QuestionImages :ids="allMediaIds(item.question.media)" compact />

            <div class="text-label-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ i18n.t('practiceReviewYourAnswer') }}
            </div>
            <div class="text-sm mb-2" :style="{ color: 'rgb(var(--md-error))' }">
              {{ item.userAnswer || i18n.t('practiceUnanswered') }}
            </div>

            <div class="text-label-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ i18n.t('practiceReviewCorrectAnswer') }}
            </div>
            <div class="text-sm mb-2" :style="{ color: 'rgb(var(--md-primary))' }">
              {{ item.question.answer }}
            </div>

            <div v-if="item.question.analysis" class="text-xs mt-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
              {{ item.question.analysis }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3 pt-2">
      <button class="btn-tonal flex-1" @click="emit('retry')">
        {{ i18n.t('practiceRetryBtn') }}
      </button>
      <button class="btn-outlined flex-1" @click="emit('home')">
        {{ i18n.t('practiceBackToBanks') }}
      </button>
    </div>
  </div>
</template>
