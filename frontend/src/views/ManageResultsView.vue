<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { fetchResults, RelayError, examMediaUrl } from '@/api/relay'
import type { ExamResultEntry, ExamResultsResponse, Question } from '@exameow/shared'
import QuestionImages from '@/components/practice/QuestionImages.vue'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'

const route = useRoute()
const router = useRouter()
const i18n = useI18nStore()

const code = (route.params.code as string || '').toUpperCase()
const token = (route.query.token as string || '').trim()

const loading = ref(true)
const unauthorized = ref(false)
const data = ref<ExamResultsResponse | null>(null)
const fromCache = ref(false)
const refreshing = ref(false)
const expanded = ref<Set<number>>(new Set())

const CACHE_KEY = `exameow-results-${code}`

function loadCache(): { data: ExamResultsResponse; fetchedAt: number } | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
  } catch {
    return null
  }
}

const isLive = computed(() => !!data.value && Date.now() < data.value.endAt)

async function refresh() {
  refreshing.value = true
  try {
    const fresh = await fetchResults(code, token)
    data.value = fresh
    fromCache.value = false
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: fresh, fetchedAt: Date.now() }))
  } catch (e) {
    if (!data.value) unauthorized.value = true
  } finally {
    refreshing.value = false
    loading.value = false
  }
}

onMounted(async () => {
  const cache = loadCache()
  if (cache) {
    data.value = cache.data
    fromCache.value = true
    loading.value = false
    if (Date.now() < cache.data.endAt) return
    if (cache.fetchedAt > cache.data.endAt) return
  }
  await refresh()
})

function toggle(i: number) {
  const s = new Set(expanded.value)
  if (s.has(i)) s.delete(i)
  else s.add(i)
  expanded.value = s
}

function detailFor(r: ExamResultEntry, questionId: string): boolean | null | undefined {
  return r.detail?.find((d) => d.questionId === questionId)?.isCorrect ?? null
}

function answerFor(r: ExamResultEntry, q: Question): string {
  const a = r.answers[q.id]
  return typeof a === 'string' && a.trim() ? a : i18n.t('takeUnanswered')
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}
</script>

<template>
  <div>
    <p v-if="loading" class="text-center py-10">{{ i18n.t('takeLoading') }}</p>

    <div v-else-if="unauthorized" class="card-filled p-6 text-center">
      <p class="text-body-lg" style="color: rgb(var(--md-error))">{{ i18n.t('manageUnauthorized') }}</p>
    </div>

    <template v-else-if="data">
      <div class="flex items-center gap-2 mb-1">
        <button class="btn-icon" @click="router.push('/mine/published')">
          <ArrowLeftIcon class="w-5 h-5" />
        </button>
        <h1 class="text-display-sm">{{ i18n.t('manageTitle') }}</h1>
      </div>
      <p class="text-body-lg mb-4" style="color: rgb(var(--md-on-surface-variant))">
        {{ data.title }} · {{ code }}
      </p>

      <div v-if="isLive" class="mb-4 px-4 py-3 rounded-2xl text-sm flex items-center justify-between gap-3" style="background-color: rgba(var(--md-primary) / 0.08); color: rgb(var(--md-primary))">
        <span>{{ i18n.t('manageLiveHint') }}</span>
        <button class="btn-tonal !h-7 !px-3 !text-xs shrink-0" :disabled="refreshing" @click="refresh">
          {{ i18n.t('manageRefresh') }}
        </button>
      </div>
      <div v-else-if="fromCache" class="mb-4 flex justify-end">
        <button class="btn-tonal !h-7 !px-3 !text-xs" :disabled="refreshing" @click="refresh">
          {{ i18n.t('manageRefresh') }}
        </button>
      </div>

      <p v-if="data.results.length === 0" class="text-center py-10" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('manageNoResults') }}
      </p>

      <div v-else class="card-outlined overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left" style="color: rgb(var(--md-on-surface-variant))">
              <th class="p-3">{{ i18n.t('manageColName') }}</th>
              <th class="p-3">{{ i18n.t('manageColScore') }}</th>
              <th class="p-3">{{ i18n.t('manageColCorrect') }}</th>
              <th class="p-3">{{ i18n.t('manageColDuration') }}</th>
              <th class="p-3">{{ i18n.t('manageColTime') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(r, i) in data.results" :key="i">
              <tr class="border-t cursor-pointer" style="border-color: rgb(var(--md-outline-variant))" @click="toggle(i)">
                <td class="p-3">{{ r.name }}</td>
                <td class="p-3 font-bold" style="color: rgb(var(--md-primary))">{{ r.score }}/{{ r.totalScore }}</td>
                <td class="p-3">{{ r.correctCount }}/{{ r.totalCount }}</td>
                <td class="p-3">{{ fmtDuration(r.durationSec) }}</td>
                <td class="p-3">{{ fmtTime(r.submittedAt) }}</td>
              </tr>
              <tr v-if="expanded.has(i)" class="border-t" style="border-color: rgb(var(--md-outline-variant))">
                <td colspan="5" class="p-3">
                  <div class="card-filled p-4 flex flex-col gap-3">
                    <div v-for="(q, qi) in data.questions" :key="q.id" class="flex items-start gap-2">
                      <span
                        v-if="detailFor(r, q.id) === true"
                        class="font-bold"
                        style="color: rgb(46 125 50)"
                      >✓</span>
                      <span
                        v-else-if="detailFor(r, q.id) === false"
                        class="font-bold"
                        style="color: rgb(var(--md-error))"
                      >✗</span>
                      <span v-else class="text-body-sm" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('takePendingShort') }}</span>
                      <div class="flex-1">
                        <p class="font-medium">{{ qi + 1 }}. {{ q.stem }}</p>
                        <QuestionImages :ids="q.images" compact :url-for="(id: string) => examMediaUrl(code, id)" />
                        <p class="text-body-sm" style="color: rgb(var(--md-on-surface-variant))">
                          {{ i18n.t('takeYourAnswer') }}: {{ answerFor(r, q) }} · {{ i18n.t('takeCorrectAnswer') }}: {{ q.answer }}
                        </p>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
