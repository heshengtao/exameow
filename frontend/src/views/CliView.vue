<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { useIntegrationStore } from '@/stores/integration'
import BaseSwitch from '@/components/common/BaseSwitch.vue'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const i18n = useI18nStore()
const integration = useIntegrationStore()
const copied = ref('')

const cliStateLabel = computed(() => {
  const state = integration.cli?.state
  if (state === 'installed') return i18n.t('cliStateInstalled')
  if (state === 'conflict') return i18n.t('cliStateConflict')
  if (state === 'system') return i18n.t('cliStateSystem')
  if (state === 'unsupported') return i18n.t('cliStateUnsupported')
  return i18n.t('cliStateMissing')
})

const cliMessage = computed(() => {
  const status = integration.cli
  if (!status) return i18n.t('cliHint')
  if (status.hint === 'dev_build') return i18n.t('cliHintDevBuild')
  if (status.hint === 'appimage') return i18n.t('cliHintAppImage')
  if (status.hint === 'needs_manual') return i18n.t('cliHintNeedsManual')
  return i18n.t('cliHint')
})

const cliOn = computed(
  () => integration.cli?.state === 'installed' || integration.cli?.state === 'system',
)

const cliToggleable = computed(() => {
  const state = integration.cli?.state
  return state === 'missing' || state === 'conflict' || state === 'installed'
})

async function handleCliToggle(value: boolean) {
  try {
    if (value) await integration.installCli()
    else await integration.uninstallCli()
  } catch {}
}

async function copyToClipboard(text: string, key: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    window.setTimeout(() => {
      if (copied.value === key) copied.value = ''
    }, 1500)
  } catch {}
}

onMounted(() => integration.load())
</script>

<template>
  <div>
    <div class="flex items-center gap-2 mb-6">
      <button class="btn-icon" @click="router.push('/mine')">
        <ArrowLeftIcon class="w-5 h-5 rtl:rotate-180" />
      </button>
      <h1 class="text-display-sm">{{ i18n.t('cliTitle') }}</h1>
    </div>

    <p class="text-body-lg mb-6" style="color: rgb(var(--md-on-surface-variant))">
      {{ i18n.t('cliHint') }}
    </p>

    <div class="card-filled p-5 sm:p-6 mb-4">
      <div class="flex items-center justify-between gap-4">
        <label class="text-label-md font-semibold" style="color: rgb(var(--md-on-surface-variant))">
          {{ i18n.t('cliMount') }}
        </label>
        <BaseSwitch
          :model-value="cliOn"
          :disabled="integration.loading || !cliToggleable"
          @update:model-value="handleCliToggle"
        />
      </div>
      <p class="text-body-sm mt-2" style="color: rgb(var(--md-on-surface-variant))">
        {{ cliMessage }}
      </p>

      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <span class="text-label-sm">{{ i18n.t('cliState') }}</span>
          <span class="text-sm font-mono">
            {{ integration.loading ? i18n.t('cliBusy') : cliStateLabel }}
          </span>
        </div>

        <div v-if="integration.cli?.target" class="flex items-start justify-between gap-3">
          <span class="text-label-sm shrink-0">{{ i18n.t('cliCommand') }}</span>
          <span class="text-xs font-mono break-all text-right">{{ integration.cli.target }}</span>
        </div>

        <div v-if="integration.cli?.conflict" class="flex items-start justify-between gap-3">
          <span class="text-label-sm shrink-0">{{ i18n.t('cliConflict') }}</span>
          <span class="text-xs font-mono break-all text-right">{{ integration.cli.conflict }}</span>
        </div>

        <div v-if="integration.cli?.full_path" class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="text-label-sm">{{ i18n.t('cliFullPath') }}</div>
            <div class="text-xs font-mono break-all mt-1">{{ integration.cli.full_path }}</div>
          </div>
          <button class="btn-outlined text-sm shrink-0" @click="copyToClipboard(integration.cli?.full_path ?? '', 'cli-full')">
            {{ copied === 'cli-full' ? i18n.t('cliCopied') : i18n.t('cliCopy') }}
          </button>
        </div>

        <div v-if="integration.cli?.manual_command" class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="text-label-sm">{{ i18n.t('cliManual') }}</div>
            <div class="text-xs font-mono break-all mt-1">{{ integration.cli.manual_command }}</div>
          </div>
          <button class="btn-outlined text-sm shrink-0" @click="copyToClipboard(integration.cli?.manual_command ?? '', 'cli-manual')">
            {{ copied === 'cli-manual' ? i18n.t('cliCopied') : i18n.t('cliCopy') }}
          </button>
        </div>
      </div>

      <p v-if="integration.error" class="text-sm mt-3 break-all" style="color: rgb(var(--md-error))">
        {{ integration.error }}
      </p>
    </div>
  </div>
</template>
