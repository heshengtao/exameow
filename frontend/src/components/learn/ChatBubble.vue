<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { renderMarkdown } from '@/utils/markdown'
import type { LearnMessage } from '@/stores/learn'
import { SparklesIcon, UserIcon, AcademicCapIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{ message: LearnMessage }>()

const i18n = useI18nStore()

const isUser = computed(() => props.message.role === 'user')
const isQuestion = computed(() => props.message.kind === 'question')
const html = computed(() => renderMarkdown(props.message.content))
const isThinking = computed(
  () => props.message.streaming === true && props.message.content.trim().length === 0,
)
</script>

<template>
  <div class="flex gap-2.5" :class="isUser ? 'flex-row-reverse' : ''">
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

        <div
          v-if="isUser"
          class="whitespace-pre-wrap"
        >{{ message.content }}</div>
        <div v-else class="learn-markdown" v-html="html" />
      </div>
    </div>
  </div>
</template>
