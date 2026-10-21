<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { examLinkFor } from '@/api/relay'
import ScheduleFields from '@/components/exam/ScheduleFields.vue'
import type { Question } from '@exameow/shared'
import { useExamPublish } from '@/composables/useExamPublish'

const props = defineProps<{ questions: Question[] }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const i18n = useI18nStore()
const { publish } = useExamPublish()

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const title = ref('')
const startAt = ref(toLocalInput(new Date()))
const durationMinutes = ref(60)
const publishing = ref(false)
const error = ref('')
const result = ref<{ code: string; manageUrl: string } | null>(null)
const copied = ref('')

const examLink = computed(() => examLinkFor(result.value?.code ?? ''))

async function handlePublish() {
  error.value = ''
  const start = new Date(startAt.value).getTime()
  if (!title.value.trim() || !start || !(durationMinutes.value > 0)) {
    error.value = i18n.t('pubErrorInvalid')
    return
  }
  publishing.value = true
  try {
    const res = await publish({
      title: title.value,
      questions: props.questions,
      startAt: start,
      durationMinutes: durationMinutes.value,
    })
    result.value = { code: res.code, manageUrl: res.manageUrl }
  } catch (e: any) {
    error.value = e?.code === 'rate_limited'
      ? i18n.t('pubRateLimited')
      : e?.code === 'media_unsupported'
        ? i18n.t('mediaPublishUnsupported')
        : e?.code === 'no_questions'
          ? i18n.t('launchErrorNoQuestions')
          : e.message || String(e)
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
    <div class="card-filled w-full max-w-md sm:max-w-lg p-5 space-y-4">
      <template v-if="!result">
        <h2 class="text-title-lg">{{ i18n.t('pubDialogTitle') }}</h2>
        <ScheduleFields v-model:title="title" v-model:start-at="startAt" v-model:duration-minutes="durationMinutes" />
        <p v-if="error" class="text-sm" style="color: rgb(var(--md-error))">{{ error }}</p>
        <div class="flex gap-2 justify-end">
          <button class="btn-outlined" @click="emit('close')">{{ i18n.t('pubCancel') }}</button>
          <button class="btn-filled" :disabled="publishing" @click="handlePublish">
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
      </template>
    </div>
  </div>
</template>
