<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { usePracticeStore } from '@/stores/practice'
import { usePublishedStore } from '@/stores/published'
import { publishExam, examLinkFor } from '@/api/relay'
import ScheduleFields from '@/components/exam/ScheduleFields.vue'
import BaseMultiSelect from '@/components/common/BaseMultiSelect.vue'
import { exportQuestionsToWord } from '@/utils/wordExport'
import { QuestionType, type Question } from '@exameow/shared'

const emit = defineEmits<{ (e: 'close'): void }>()

const i18n = useI18nStore()
const practiceStore = usePracticeStore()
const publishedStore = usePublishedStore()

const TYPE_ORDER: QuestionType[] = [
  QuestionType.SingleChoice,
  QuestionType.MultiChoice,
  QuestionType.TrueFalse,
  QuestionType.FillBlank,
  QuestionType.ShortAnswer,
]

const TYPE_LABEL_KEYS: Record<string, 'typeSingle' | 'typeMulti' | 'typeTrueFalse' | 'typeFillBlank' | 'typeShortAnswer'> = {
  single_choice: 'typeSingle',
  multi_choice: 'typeMulti',
  true_false: 'typeTrueFalse',
  fill_blank: 'typeFillBlank',
  short_answer: 'typeShortAnswer',
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]!
    a[i] = a[j]!
    a[j] = t
  }
  return a
}

const selectedBankIds = ref<Set<string>>(new Set())
const counts = ref<Record<string, number>>({})
const points = ref<Record<string, number>>({})
const title = ref('')
const startAt = ref(toLocalInput(new Date()))
const durationMinutes = ref(60)
const publishing = ref(false)
const error = ref('')
const result = ref<{ code: string; manageUrl: string } | null>(null)
const copied = ref('')
const lastComposed = ref<Question[] | null>(null)

const examLink = computed(() => examLinkFor(result.value?.code ?? ''))

const banks = computed(() => practiceStore.banks)

const bankOptions = computed(() =>
  banks.value.map((b) => ({ value: b.id, label: b.name, hint: String(b.questions.length) })),
)

const selectedBanks = computed(() => banks.value.filter((b) => selectedBankIds.value.has(b.id)))

const availableByType = computed(() => {
  const avail: Record<string, number> = {}
  for (const t of TYPE_ORDER) avail[t] = 0
  for (const b of selectedBanks.value) {
    for (const q of b.questions) avail[q.type] = (avail[q.type] ?? 0) + 1
  }
  return avail
})

const activeTypes = computed(() => TYPE_ORDER.filter((t) => (availableByType.value[t] ?? 0) > 0))

watch(selectedBanks, () => {
  const next: Record<string, number> = {}
  const nextPoints: Record<string, number> = {}
  for (const t of activeTypes.value) {
    const prev = counts.value[t]
    const avail = availableByType.value[t] ?? 0
    next[t] = prev !== undefined ? Math.min(prev, avail) : avail
    nextPoints[t] = points.value[t] ?? 1
  }
  counts.value = next
  points.value = nextPoints
})

const totalSelected = computed(() =>
  activeTypes.value.reduce((sum, t) => sum + Math.min(Math.max(0, counts.value[t] ?? 0), availableByType.value[t] ?? 0), 0),
)

function composeQuestions(): Question[] {
  const picked: Question[] = []
  for (const t of TYPE_ORDER) {
    const want = Math.min(Math.max(0, counts.value[t] ?? 0), availableByType.value[t] ?? 0)
    if (want <= 0) continue
    const pool = selectedBanks.value.flatMap((b) => b.questions.filter((q) => q.type === t))
    const pts = Math.max(1, points.value[t] ?? 1)
    picked.push(...shuffle(pool).slice(0, want).map((q) => ({ ...q, score: pts })))
  }
  return picked.map((q, i) => ({ ...q, id: `q${i + 1}` }))
}

async function handlePublish() {
  error.value = ''
  const start = new Date(startAt.value).getTime()
  const end = start + durationMinutes.value * 60000
  if (!title.value.trim() || !start || !(durationMinutes.value > 0)) {
    error.value = i18n.t('pubErrorInvalid')
    return
  }
  const questions = composeQuestions()
  if (questions.length === 0) {
    error.value = i18n.t('launchErrorNoQuestions')
    return
  }
  lastComposed.value = questions
  publishing.value = true
  try {
    const res = await publishExam({
      title: title.value.trim(),
      questions,
      startAt: start,
      endAt: end,
      durationMinutes: durationMinutes.value,
    })
    result.value = { code: res.code, manageUrl: res.manageUrl }
    publishedStore.add({ code: res.code, title: title.value.trim(), manageUrl: res.manageUrl, publishedAt: Date.now() })
  } catch (e: any) {
    error.value = e?.code === 'rate_limited' ? i18n.t('pubRateLimited') : e.message || String(e)
  } finally {
    publishing.value = false
  }
}

async function copy(text: string, which: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = which
    setTimeout(() => (copied.value = ''), 1500)
  } catch {}
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background-color: rgba(0,0,0,0.4)" @click.self="emit('close')">
    <div class="card-filled w-full max-w-md sm:max-w-xl p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
      <template v-if="!result">
        <h2 class="text-title-lg">{{ i18n.t('pubLaunch') }}</h2>

        <div>
          <label class="text-label-sm">{{ i18n.t('launchSelectBanks') }}</label>
          <p v-if="banks.length === 0" class="text-sm mt-1" style="color: rgb(var(--md-on-surface-variant))">
            {{ i18n.t('launchNoBanks') }}
          </p>
          <div v-else class="mt-1">
            <BaseMultiSelect
              :model-value="[...selectedBankIds]"
              :options="bankOptions"
              :placeholder="i18n.t('launchSelectBanks')"
              @update:model-value="selectedBankIds = new Set($event)"
            />
          </div>
        </div>

        <div v-if="activeTypes.length > 0">
          <label class="text-label-sm">{{ i18n.t('launchTypeCounts') }}</label>
          <div class="mt-1 space-y-2">
            <div v-for="t in activeTypes" :key="t" class="flex items-center gap-2">
              <span class="text-sm flex-1">{{ i18n.t(TYPE_LABEL_KEYS[t]!) }}</span>
              <input
                v-model.number="counts[t]"
                type="number"
                min="0"
                :max="availableByType[t]"
                class="input-outlined w-20 text-center no-spinner"
              />
              <span class="text-xs shrink-0" style="color: rgb(var(--md-on-surface-variant))">/ {{ availableByType[t] }}</span>
              <span class="text-xs shrink-0" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('launchPoints') }}</span>
              <input
                v-model.number="points[t]"
                type="number"
                min="1"
                class="input-outlined w-20 text-center no-spinner"
              />
            </div>
          </div>
          <p class="text-xs mt-1" style="color: rgb(var(--md-primary))">{{ i18n.t('launchTotal', { n: totalSelected }) }}</p>
        </div>

        <div class="pt-1">
          <label class="text-label-sm">{{ i18n.t('launchExamSettings') }}</label>
          <div class="mt-2">
            <ScheduleFields v-model:title="title" v-model:start-at="startAt" v-model:duration-minutes="durationMinutes" />
          </div>
        </div>

        <p v-if="error" class="text-sm" style="color: rgb(var(--md-error))">{{ error }}</p>
        <div class="flex gap-2 justify-end">
          <button class="btn-outlined" @click="emit('close')">{{ i18n.t('pubCancel') }}</button>
          <button
            class="btn-tonal"
            :disabled="totalSelected === 0"
            @click="exportQuestionsToWord(title.trim() || '考试试卷', composeQuestions())"
          >
            下载 Word 试卷
          </button>
          <button class="btn-filled" :disabled="publishing || totalSelected === 0" @click="handlePublish">
            {{ publishing ? i18n.t('pubPublishing') : i18n.t('pubConfirm') }}
          </button>
        </div>
      </template>

      <template v-else>
        <h2 class="text-title-lg text-center">{{ i18n.t('pubSuccessTitle') }}</h2>
        <div class="text-center">
          <div class="text-label-sm mb-1">{{ i18n.t('pubCodeLabel') }}</div>
          <div class="text-4xl font-bold tracking-[0.3em]" style="color: rgb(var(--md-primary))">{{ result.code }}</div>
          <button class="btn-tonal text-sm mt-2" @click="copy(result.code, 'code')">
            {{ copied === 'code' ? i18n.t('pubCopied') : i18n.t('pubCopy') }}
          </button>
        </div>
        <div>
          <div class="text-label-sm mb-1">{{ i18n.t('pubExamLink') }}</div>
          <div class="flex gap-2">
            <input :value="examLink" readonly class="input-outlined flex-1 text-xs" />
            <button class="btn-tonal text-sm shrink-0" @click="copy(examLink, 'link')">
              {{ copied === 'link' ? i18n.t('pubCopied') : i18n.t('pubCopy') }}
            </button>
          </div>
        </div>
        <button class="btn-filled w-full" @click="emit('close')">{{ i18n.t('pubClose') }}</button>
        <button
          v-if="lastComposed"
          class="btn-tonal w-full mt-2"
          @click="exportQuestionsToWord(title.trim() || '考试试卷', lastComposed!)"
        >
          下载 Word 试卷(与本次发布完全一致)
        </button>
      </template>
    </div>
  </div>
</template>
