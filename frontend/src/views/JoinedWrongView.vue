<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { useJoinedStore } from '@/stores/joined'
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/vue/24/outline'
import MarkdownText from '@/components/common/MarkdownText.vue'

const route = useRoute()
const router = useRouter()
const i18n = useI18nStore()
const joinedStore = useJoinedStore()

const code = (route.query.code as string || '').toUpperCase()
const name = (route.query.name as string || '').trim()

const rec = computed(() => joinedStore.list.find((r) => r.code === code && r.name === name))
const wrongList = computed(() =>
  (rec.value?.graded ?? [])
    .map((g, i) => ({ g, index: i }))
    .filter(({ g }) => g.isCorrect === false),
)

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
</script>

<template>
  <div>
    <div class="flex items-center gap-2 mb-6">
      <button class="btn-icon" @click="router.push('/mine/joined')">
        <ArrowLeftIcon class="w-5 h-5" />
      </button>
      <div class="min-w-0">
        <h1 class="text-display-sm">{{ i18n.t('joinedWrongTitle') }}</h1>
        <p v-if="rec" class="text-body-sm truncate" style="color: rgb(var(--md-on-surface-variant))">
          {{ rec.title || rec.code }} · {{ rec.name }} · {{ rec.code }}
        </p>
      </div>
      <div v-if="rec?.submittedAt" class="ml-auto text-xl font-bold shrink-0" style="color: rgb(var(--md-primary))">
        {{ rec.score }}/{{ rec.totalScore }}
      </div>
    </div>

    <div v-if="wrongList.length === 0" class="card-filled p-8 text-center space-y-2">
      <CheckCircleIcon class="w-10 h-10 mx-auto" style="color: rgb(var(--md-primary))" />
      <p class="text-body-lg" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('joinedNoWrong') }}</p>
    </div>

    <div v-else class="space-y-3 pb-8">
      <div v-for="{ g, index } in wrongList" :key="g.question.id" class="card-outlined p-4 sm:p-5">
        <div class="flex items-start gap-2">
          <span
            class="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 mt-0.5"
            style="background-color: rgb(var(--md-error-container)); color: rgb(var(--md-on-error-container))"
          >{{ index + 1 }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                style="background-color: rgb(var(--md-secondary-container)); color: rgb(var(--md-on-secondary-container))"
              >{{ typeLabel(g.question.type) }}</span>
            </div>
            <div class="text-sm mb-2" style="color: rgb(var(--md-on-surface))">
              <MarkdownText :text="g.question.stem" />
            </div>
            <div class="text-label-sm" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('takeYourAnswer') }}</div>
            <div class="text-sm mb-2" style="color: rgb(var(--md-error))">
              {{ g.userAnswer || i18n.t('takeUnanswered') }}
            </div>
            <div class="text-label-sm" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('takeCorrectAnswer') }}</div>
            <div class="text-sm mb-2" style="color: rgb(var(--md-primary))">
              <MarkdownText inline :text="g.question.answer" />
            </div>
            <div v-if="g.question.analysis" class="text-xs" style="color: rgb(var(--md-on-surface-variant))">
              <MarkdownText :text="g.question.analysis" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
