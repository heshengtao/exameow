<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { renderMarkdown } from '@/utils/markdown'
import type { LearnMessage } from '@/stores/learn'
import type { Question } from '@exameow/shared'
import { SparklesIcon, UserIcon, AcademicCapIcon, GlobeAltIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  message: LearnMessage
  question?: Question | null
  disabled?: boolean
}>()

const emit = defineEmits<{ (e: 'answer', text: string): void }>()

const i18n = useI18nStore()
const optionLabels = 'ABCDEFGH'.split('')
const selected = ref<string[]>([])

const isUser = computed(() => props.message.role === 'user')
const isQuestion = computed(() => props.message.kind === 'question')
const isSearch = computed(() => props.message.kind === 'search')
const isTool = computed(() => props.message.kind === 'tool')
const html = computed(() => renderMarkdown(props.message.content))
const isThinking = computed(
  () => props.message.streaming === true && props.message.content.trim().length === 0,
)
const isChoiceQuestion = computed(() => {
  const type = props.question?.type
  return (
    isQuestion.value &&
    (type === 'single_choice' || type === 'multi_choice' || type === 'true_false')
  )
})
const isMultiChoice = computed(() => props.question?.type === 'multi_choice')
const displayOptions = computed(() => {
  const q = props.question
  if (!q) return []
  if (q.type === 'true_false' && q.options.length === 0) return ['True', 'False']
  return q.options
})
const searchLabel = computed(() => {
  if (props.message.searchStatus === 'searching') return i18n.t('learnSearching')
  if (props.message.searchStatus === 'error') return i18n.t('learnSearchFailed')
  return i18n.t('learnSearchChip', { n: props.message.searchCount ?? 0 })
})

const toolLabel = computed(() => {
  if (props.message.toolName === 'fallback') return i18n.t('learnToolFallback')
  if (props.message.toolStatus === 'error') return i18n.t('learnToolFailed')
  const running = props.message.toolStatus === 'running'
  switch (props.message.toolName) {
    case 'web_search':
      return running
        ? i18n.t('learnToolSearching')
        : i18n.t('learnToolSearched', { n: props.message.toolCount ?? 0 })
    case 'web_fetch':
      return running ? i18n.t('learnToolFetching') : i18n.t('learnToolFetched')
    case 'web_crawl':
      return running
        ? i18n.t('learnToolCrawling')
        : i18n.t('learnToolCrawled', { n: props.message.toolCount ?? 0 })
    default:
      return running ? i18n.t('learnThinking') : i18n.t('learnToolFetched')
  }
})

function choose(letter: string) {
  if (props.disabled) return
  if (isMultiChoice.value) {
    selected.value = selected.value.includes(letter)
      ? selected.value.filter((l) => l !== letter)
      : [...selected.value, letter]
    return
  }
  submit([letter])
}

function submit(letters: string[]) {
  if (props.disabled || letters.length === 0) return
  const text = [...letters]
    .sort()
    .map((letter) => {
      const option = displayOptions.value[letter.charCodeAt(0) - 65]
      return option ? `${letter}. ${option}` : letter
    })
    .join('\n')
  emit('answer', text)
  selected.value = []
}

function optionStyle(letter: string) {
  const on = selected.value.includes(letter)
  return {
    borderColor: on ? 'rgb(var(--md-primary))' : 'rgb(var(--md-outline-variant))',
    backgroundColor: on ? 'rgb(var(--md-primary) / 0.08)' : 'transparent',
  }
}

function badgeStyle(letter: string) {
  const on = selected.value.includes(letter)
  return {
    backgroundColor: on
      ? 'rgb(var(--md-primary))'
      : 'rgb(var(--md-surface-container-highest))',
    color: on ? 'rgb(var(--md-on-primary))' : 'rgb(var(--md-on-surface-variant))',
  }
}
</script>

<template>
  <div v-if="isSearch" class="flex justify-center py-0.5">
    <span
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-label-sm"
      :style="{
        backgroundColor: 'rgb(var(--md-surface-container-high))',
        color: 'rgb(var(--md-on-surface-variant))',
      }"
    >
      <GlobeAltIcon
        class="w-3.5 h-3.5"
        :class="{ 'animate-pulse': message.searchStatus === 'searching' }"
      />
      {{ searchLabel }}
    </span>
  </div>

  <div v-else-if="isTool" class="flex justify-center py-0.5">
    <span
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-label-sm max-w-full"
      :class="{ 'animate-pulse': message.toolStatus === 'running' }"
      :style="{
        backgroundColor: 'rgb(var(--md-surface-container-high))',
        color: 'rgb(var(--md-on-surface-variant))',
      }"
      :title="message.toolDetail"
    >
      <GlobeAltIcon v-if="message.toolName === 'web_search'" class="w-3.5 h-3.5 shrink-0" />
      <DocumentTextIcon v-else class="w-3.5 h-3.5 shrink-0" />
      <span class="truncate">{{ toolLabel }}</span>
    </span>
  </div>

  <div v-else class="flex gap-2.5" :class="isUser ? 'flex-row-reverse' : ''">
    <div
      class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
      :style="{
        backgroundColor: isUser
          ? 'rgb(var(--md-secondary-container))'
          : 'rgb(var(--md-primary-container))',
      }"
    >
      <UserIcon
        v-if="isUser"
        class="w-4 h-4"
        :style="{ color: 'rgb(var(--md-on-secondary-container))' }"
      />
      <SparklesIcon v-else class="w-4 h-4" :style="{ color: 'rgb(var(--md-on-primary-container))' }" />
    </div>

    <div class="max-w-[85%] sm:max-w-[76%] min-w-0">
      <div
        v-if="isThinking"
        class="px-4 py-3 rounded-2xl rounded-tl-sm text-sm animate-pulse"
        :style="{
          backgroundColor: 'rgb(var(--md-surface-container-high))',
          color: 'rgb(var(--md-on-surface-variant))',
        }"
      >
        {{ i18n.t('learnThinking') }}
      </div>

      <div
        v-else
        class="px-4 py-3 rounded-2xl text-sm break-words"
        :class="isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'"
        :style="
          isUser
            ? {
                backgroundColor: 'rgb(var(--md-secondary-container))',
                color: 'rgb(var(--md-on-secondary-container))',
              }
            : isQuestion
              ? {
                  backgroundColor: 'rgb(var(--md-surface-container-low))',
                  border: '1px solid rgb(var(--md-outline-variant) / 0.5)',
                  color: 'rgb(var(--md-on-surface))',
                }
              : {
                  backgroundColor: 'rgb(var(--md-surface-container-high))',
                  color: 'rgb(var(--md-on-surface))',
                }
        "
      >
        <div
          v-if="isQuestion"
          class="flex items-center gap-1.5 mb-2 text-label-sm"
          :style="{ color: 'rgb(var(--md-on-surface-variant))' }"
        >
          <AcademicCapIcon class="w-3.5 h-3.5" />
          {{ i18n.t('learnQuestionLabel') }}
        </div>

        <div v-if="isUser" class="whitespace-pre-wrap">{{ message.content }}</div>
        <div v-else-if="isQuestion && question">
          <div class="whitespace-pre-wrap">{{ question.stem }}</div>

          <div v-if="isChoiceQuestion" class="mt-3 space-y-2">
            <button
              v-for="(option, idx) in displayOptions"
              :key="idx"
              type="button"
              class="w-full text-left p-2.5 rounded-2xl border flex items-center gap-2.5 transition-all duration-150"
              :class="disabled ? 'cursor-default opacity-80' : 'cursor-pointer active:scale-[0.98]'"
              :style="optionStyle(optionLabels[idx]!)"
              :disabled="disabled"
              @click="choose(optionLabels[idx]!)"
            >
              <span
                class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors duration-150"
                :style="badgeStyle(optionLabels[idx]!)"
              >{{ optionLabels[idx] }}</span>
              <span
                class="text-sm flex-1 break-words"
                :style="{ color: 'rgb(var(--md-on-surface))' }"
              >{{ option }}</span>
            </button>

            <button
              v-if="isMultiChoice"
              type="button"
              class="btn-filled !h-9 w-full text-sm"
              :disabled="disabled || selected.length === 0"
              @click="submit(selected)"
            >
              {{ i18n.t('practiceConfirmAnswer') }}
            </button>

            <p
              v-else
              class="text-xs text-center pt-0.5"
              :style="{ color: 'rgb(var(--md-on-surface-variant))' }"
            >
              {{ i18n.t('practiceClickToSubmit') }}
            </p>
          </div>
        </div>
        <div v-else class="learn-markdown" v-html="html" />
      </div>
    </div>
  </div>
</template>
