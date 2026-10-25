<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { useMcpStore } from '@/stores/mcp'
import { useIntegrationStore } from '@/stores/integration'
import { SUPPORTED_LOCALES } from '@/i18n/locales'
import { useTheme, type Theme, type AccentColor } from '@/composables/useTheme'
import { useDesktopUpdater } from '@/composables/useDesktopUpdater'
import { isTauri, isMobileDevice, isDesktopTauri } from '@/utils/platform'
import BaseSelect from '@/components/common/BaseSelect.vue'
import BaseSwitch from '@/components/common/BaseSwitch.vue'
import {
  ArrowLeftIcon,
  LanguageIcon,
  SunIcon,
  ArrowPathIcon,
  CheckIcon,
  SwatchIcon,
  SparklesIcon,
  ServerStackIcon,
  CommandLineIcon,
} from '@heroicons/vue/24/outline'

const router = useRouter()
const i18n = useI18nStore()
const { theme, accent, setTheme, setAccent } = useTheme()
const version = import.meta.env.VITE_APP_VERSION

const themeOptions: { value: Theme; key: 'themeSystem' | 'themeLight' | 'themeDark' }[] = [
  { value: 'system', key: 'themeSystem' },
  { value: 'light', key: 'themeLight' },
  { value: 'dark', key: 'themeDark' },
]

const accentOptions: {
  value: AccentColor
  key: 'accentBlue' | 'accentGreen' | 'accentCoral' | 'accentPurple' | 'accentAmber'
  primary: string
  container: string
}[] = [
  { value: 'blue', key: 'accentBlue', primary: '#266CFF', container: '#DBE1FF' },
  { value: 'green', key: 'accentGreen', primary: '#2E7D4F', container: '#C6F6D5' },
  { value: 'coral', key: 'accentCoral', primary: '#E05642', container: '#FFDBD6' },
  { value: 'purple', key: 'accentPurple', primary: '#8A49E2', container: '#EDDDFF' },
  { value: 'amber', key: 'accentAmber', primary: '#BD8900', container: '#FFDF96' },
]

// Mobile OTA
const showOta = isTauri() && isMobileDevice()
const otaBundle = ref('')
const otaMessage = ref('')
const otaBusy = ref(false)

// Desktop updater
const showDesktopUpdate = isDesktopTauri()
const updater = useDesktopUpdater()

// MCP
const mcp = useMcpStore()
const mcpPort = ref(5274)
const mcpAllowLan = ref(false)
const mcpShowToken = ref(false)
const mcpCopied = ref('')
const mcpActionError = ref('')

const mcpEndpoint = computed(() => {
  const info = mcp.info
  if (!info) return ''
  return mcpAllowLan.value && info.lan_url ? info.lan_url : info.url
})

const mcpEndpointIsLoopback = computed(() =>
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/i.test(mcpEndpoint.value),
)

const mcpCommand = computed(() => {
  const endpoint = mcpEndpoint.value
  if (mcpEndpointIsLoopback.value) {
    // Local desktop: keyless.
    return `claude mcp add --transport http exameow ${endpoint}`
  }
  return `claude mcp add --transport http exameow ${endpoint} --header "Authorization: Bearer ${mcp.info?.token ?? ''}"`
})

async function syncMcpSettings() {
  await mcp.load()
  if (mcp.info) {
    mcpPort.value = mcp.info.port ?? 5274
    mcpAllowLan.value = !!mcp.info.allow_lan
  }
}

async function handleMcpToggle(value: boolean) {
  mcpActionError.value = ''
  try {
    await mcp.setEnabled(value, mcpPort.value, mcpAllowLan.value)
  } catch (e: any) {
    mcpActionError.value = e?.message ?? String(e)
  }
}

async function handleMcpPort() {
  if (!mcp.isNative || !mcp.info?.enabled) return
  mcpActionError.value = ''
  try {
    await mcp.setEnabled(true, mcpPort.value, mcpAllowLan.value)
  } catch (e: any) {
    mcpActionError.value = e?.message ?? String(e)
  }
}

async function handleMcpLan(value: boolean) {
  mcpAllowLan.value = value
  if (!mcp.isNative || !mcp.info?.enabled) return
  mcpActionError.value = ''
  try {
    await mcp.setEnabled(true, mcpPort.value, value)
  } catch (e: any) {
    mcpActionError.value = e?.message ?? String(e)
  }
}

async function handleMcpRegenerate() {
  mcpActionError.value = ''
  try {
    await mcp.regenerateToken()
  } catch (e: any) {
    mcpActionError.value = e?.message ?? String(e)
  }
}

async function copyToClipboard(text: string, key: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    mcpCopied.value = key
    window.setTimeout(() => {
      if (mcpCopied.value === key) mcpCopied.value = ''
    }, 1500)
  } catch {}
}

// CLI / skills
const integration = useIntegrationStore()
const SKILL_REPO_URL = 'https://github.com/heshengtao/exameow/tree/main/skills/exameow'

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

const skillsOn = computed(() => !!integration.skills?.installed)

const skillsToggleable = computed(
  () => !!integration.skills && !integration.skills.unsupported,
)

async function handleCliToggle(value: boolean) {
  try {
    if (value) await integration.installCli()
    else await integration.uninstallCli()
  } catch {}
}

async function handleSkillsToggle(value: boolean) {
  try {
    if (value) await integration.installSkills()
    else await integration.uninstallSkills()
  } catch {}
}

onMounted(async () => {
  await syncMcpSettings()
  await integration.load()
  if (!showOta) return
  try {
    const { tauriApi } = await import('@/api/bridge')
    const cur = await tauriApi.otaCurrent()
    otaBundle.value = cur.status === 'ota' && cur.version ? `v${cur.version}` : i18n.t('otaBuiltin')
  } catch {}
})

async function handleOtaCheck() {
  if (otaBusy.value) return
  otaBusy.value = true
  otaMessage.value = i18n.t('otaChecking')
  try {
    const { tauriApi } = await import('@/api/bridge')
    const r = await tauriApi.otaDownload()
    if (r.status === 'staged' || r.status === 'alreadyStaged') {
      otaMessage.value = i18n.t('otaStaged', { version: r.version ?? '' })
    } else if (r.status === 'shellTooOld') {
      otaMessage.value = i18n.t('otaShellTooOld', { version: r.version ?? '' })
    } else if (r.status === 'upToDate' || r.status === 'downloading') {
      otaMessage.value = i18n.t('otaUpToDate')
    } else {
      otaMessage.value = i18n.t('otaFailed') + (r.error ? `: ${r.error}` : '')
    }
  } catch (e: any) {
    otaMessage.value = i18n.t('otaFailed') + ': ' + (e?.message ?? String(e))
  } finally {
    otaBusy.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex items-center gap-2 mb-6">
      <button class="btn-icon" @click="router.push('/mine')">
        <ArrowLeftIcon class="w-5 h-5 rtl:rotate-180" />
      </button>
      <h1 class="text-display-sm">{{ i18n.t('settingsTitle') }}</h1>
    </div>

    <!-- Language -->
    <div class="card-filled p-5 mb-4">
      <label class="text-label-md flex items-center justify-center gap-1.5 mb-4" style="color: rgb(var(--md-on-surface-variant))">
        <LanguageIcon class="w-4 h-4" />
        {{ i18n.t('settingsLanguage') }}
      </label>
      <div class="max-w-[280px] mx-auto">
        <BaseSelect
          :model-value="i18n.locale"
          :options="SUPPORTED_LOCALES.map(l => ({ value: l.code, label: l.nativeName }))"
          @update:model-value="i18n.setLocale($event)"
        />
      </div>
    </div>

    <!-- Theme Mode & Pixel Accent Palette -->
    <div class="card-filled p-5 sm:p-6 mb-4">
      <div class="flex items-center justify-between gap-4 mb-5">
        <label class="text-label-md font-semibold flex items-center gap-2" style="color: rgb(var(--md-on-surface-variant))">
          <SunIcon class="w-4 h-4" />
          {{ i18n.t('settingsTheme') }}
        </label>
        <div class="w-[160px]">
          <BaseSelect
            :model-value="theme"
            :options="themeOptions.map(o => ({ value: o.value, label: i18n.t(o.key) }))"
            @update:model-value="setTheme($event)"
          />
        </div>
      </div>

      <div class="divider my-5" />

      <!-- Material You Dynamic Accent Palette Picker -->
      <div>
        <label class="text-label-sm font-bold flex items-center gap-2 mb-4" style="color: rgb(var(--md-on-surface))">
          <SwatchIcon class="w-5 h-5 shrink-0" style="color: rgb(var(--md-primary))" />
          {{ i18n.t('settingsAccentColor') }}
        </label>

        <!-- Pixel Live UI Preview Widget -->
        <div class="p-4 sm:p-5 rounded-[28px] border border-[rgb(var(--md-outline-variant)/0.3)] bg-[rgb(var(--md-surface-container))] mb-5 overflow-hidden transition-all duration-300 shadow-inner">
          <div class="text-[11px] font-bold uppercase tracking-widest mb-3 text-center" style="color: rgb(var(--md-on-surface-variant))">
            ✨ Material You Live Preview
          </div>
          <div class="flex flex-wrap items-center justify-center gap-3">
            <button class="btn-filled !h-9 text-xs !px-4 gap-1.5 shadow-sm pointer-events-none">
              <SparklesIcon class="w-4 h-4" />
              <span>Exameow AI</span>
            </button>
            <div class="chip-filter chip-filter-active !h-9 !px-3.5 text-xs font-semibold !rounded-full pointer-events-none shadow-xs">
              <span>{{ i18n.t('typeSingle') }}</span>
            </div>
            <span
              class="inline-flex items-center px-3.5 h-7 rounded-full text-xs font-bold pointer-events-none"
              :style="{ backgroundColor: 'rgb(var(--md-primary-container))', color: 'rgb(var(--md-on-primary-container))' }"
            >
              {{ i18n.t('diffMedium') }}
            </span>
          </div>
        </div>

        <!-- 5 Dual-Tone Material You Color Wheels -->
        <div class="grid grid-cols-5 gap-1.5 sm:gap-3">
          <button
            v-for="a in accentOptions"
            :key="a.value"
            class="group relative flex flex-col items-center justify-center gap-1.5 p-2 sm:p-3.5 rounded-2xl sm:rounded-[24px] border transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-95 cursor-pointer"
            :style="{
              backgroundColor: accent === a.value ? 'rgb(var(--md-surface-container-highest))' : 'rgb(var(--md-surface-container-low))',
              borderColor: accent === a.value ? 'rgb(var(--md-primary))' : 'rgb(var(--md-outline-variant)/0.3)',
              boxShadow: accent === a.value ? '0 4px 16px rgba(var(--md-primary) / 0.18)' : 'none',
            }"
            :title="i18n.t(a.key)"
            @click="setAccent(a.value)"
          >
            <!-- Dual-Tone Concentric Circle Swatch -->
            <div
              class="w-9 h-9 sm:w-12 sm:h-12 rounded-full relative flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shadow-md overflow-hidden shrink-0"
              :style="{ backgroundColor: a.primary }"
            >
              <div
                class="w-4 h-4 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shadow-xs"
                :style="{ backgroundColor: a.container }"
              >
                <CheckIcon v-if="accent === a.value" class="w-3 h-3 sm:w-4 sm:h-4 text-black stroke-[3]" />
              </div>
            </div>

            <!-- Hide text label on mobile, show on sm desktop screens -->
            <span
              class="hidden sm:block text-xs font-bold tracking-tight truncate w-full text-center"
              :style="{ color: accent === a.value ? 'rgb(var(--md-primary))' : 'rgb(var(--md-on-surface-variant))' }"
            >
              {{ i18n.t(a.key) }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- MCP / AI client access -->
    <div v-if="mcp.available" class="card-filled p-5 sm:p-6 mb-4">
      <div class="flex items-center justify-between gap-4">
        <label class="text-label-md font-semibold flex items-center gap-2" style="color: rgb(var(--md-on-surface-variant))">
          <ServerStackIcon class="w-4 h-4" />
          {{ i18n.t('mcpTitle') }}
        </label>
        <BaseSwitch
          v-if="mcp.isNative"
          :model-value="mcp.info?.enabled ?? false"
          :disabled="mcp.loading"
          @update:model-value="handleMcpToggle"
        />
      </div>
      <p class="text-body-sm mt-2" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('mcpEnableHint') }}
      </p>

      <div v-if="mcp.info?.enabled" class="mt-5 space-y-5">
        <div v-if="mcp.isNative" class="flex items-center justify-between gap-4">
          <span class="text-label-sm">{{ i18n.t('mcpPort') }}</span>
          <input
            v-model.number="mcpPort"
            type="number"
            min="1024"
            max="65535"
            class="input-outlined w-28 text-center no-spinner"
            @change="handleMcpPort"
          />
        </div>

        <div v-if="mcp.isNative" class="flex items-start justify-between gap-4">
          <div>
            <div class="text-label-sm">{{ i18n.t('mcpLan') }}</div>
            <p class="text-xs mt-1" style="color: rgb(var(--md-on-surface-variant))">
              {{ i18n.t('mcpLanHint') }}
            </p>
          </div>
          <BaseSwitch :model-value="mcpAllowLan" @update:model-value="handleMcpLan" />
        </div>

        <div>
          <div class="text-label-sm mb-1.5">{{ i18n.t('mcpEndpoint') }}</div>
          <div class="flex gap-2">
            <input :value="mcpEndpoint" readonly class="input-outlined flex-1 text-xs" />
            <button class="btn-tonal text-sm shrink-0" @click="copyToClipboard(mcpEndpoint, 'endpoint')">
              {{ mcpCopied === 'endpoint' ? i18n.t('mcpCopied') : i18n.t('mcpCopy') }}
            </button>
          </div>
          <input
            v-if="mcpAllowLan && mcp.info?.lan_url"
            :value="mcp.info.url"
            readonly
            class="input-outlined w-full text-xs mt-2"
          />
        </div>

        <div>
          <div class="text-label-sm mb-1.5">{{ i18n.t('mcpToken') }}</div>
          <div class="flex flex-wrap gap-2">
            <input
              :value="mcpShowToken ? mcp.info?.token : '••••••••••••••••'"
              readonly
              class="input-outlined flex-1 min-w-[160px] text-xs font-mono"
            />
            <button class="btn-outlined text-sm shrink-0" @click="mcpShowToken = !mcpShowToken">
              {{ mcpShowToken ? i18n.t('mcpHideToken') : i18n.t('mcpShowToken') }}
            </button>
            <button class="btn-outlined text-sm shrink-0" @click="copyToClipboard(mcp.info?.token ?? '', 'token')">
              {{ mcpCopied === 'token' ? i18n.t('mcpCopied') : i18n.t('mcpCopy') }}
            </button>
            <button v-if="mcp.isNative" class="btn-outlined text-sm shrink-0" @click="handleMcpRegenerate">
              {{ i18n.t('mcpRegenerate') }}
            </button>
          </div>
          <p class="text-xs mt-1.5" style="color: rgb(var(--md-error))">{{ i18n.t('mcpSecurityHint') }}</p>
        </div>

        <button class="btn-tonal w-full text-sm" @click="copyToClipboard(mcpCommand, 'command')">
          {{ mcpCopied === 'command' ? i18n.t('mcpCopied') : i18n.t('mcpCopyCommand') }}
        </button>

        <div class="flex flex-wrap items-center justify-between gap-2 text-xs" style="color: rgb(var(--md-on-surface-variant))">
          <span>{{ i18n.t('mcpClients') }}: {{ mcp.info?.sessions ?? 0 }}</span>
          <span>
            {{ i18n.t('mcpBridge') }}:
            <span :style="{ color: mcp.connected ? 'rgb(var(--md-primary))' : 'rgb(var(--md-on-surface-variant))' }">
              {{ mcp.connected ? i18n.t('mcpConnected') : i18n.t('mcpDisconnected') }}
            </span>
          </span>
        </div>
      </div>

      <p v-else-if="!mcp.isNative" class="text-body-sm mt-3" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('mcpServerManaged') }}
      </p>

      <p v-if="mcpActionError || mcp.error" class="text-sm mt-3 break-all" style="color: rgb(var(--md-error))">
        {{ mcpActionError || mcp.error }}
      </p>
    </div>

    <!-- Command line (exameow) -->
    <div v-if="integration.available" class="card-filled p-5 sm:p-6 mb-4">
      <div class="flex items-center justify-between gap-4">
        <label class="text-label-md font-semibold flex items-center gap-2" style="color: rgb(var(--md-on-surface-variant))">
          <CommandLineIcon class="w-4 h-4" />
          {{ i18n.t('cliTitle') }}
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
            {{ mcpCopied === 'cli-full' ? i18n.t('cliCopied') : i18n.t('cliCopy') }}
          </button>
        </div>

        <div v-if="integration.cli?.manual_command" class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="text-label-sm">{{ i18n.t('cliManual') }}</div>
            <div class="text-xs font-mono break-all mt-1">{{ integration.cli.manual_command }}</div>
          </div>
          <button class="btn-outlined text-sm shrink-0" @click="copyToClipboard(integration.cli?.manual_command ?? '', 'cli-manual')">
            {{ mcpCopied === 'cli-manual' ? i18n.t('cliCopied') : i18n.t('cliCopy') }}
          </button>
        </div>
      </div>

      <p v-if="integration.error" class="text-sm mt-3 break-all" style="color: rgb(var(--md-error))">
        {{ integration.error }}
      </p>
    </div>

    <!-- AI skills -->
    <div v-if="integration.available" class="card-filled p-5 sm:p-6 mb-4">
      <div class="flex items-center justify-between gap-4">
        <label class="text-label-md font-semibold flex items-center gap-2" style="color: rgb(var(--md-on-surface-variant))">
          <SparklesIcon class="w-4 h-4" />
          {{ i18n.t('skillsTitle') }}
        </label>
        <BaseSwitch
          :model-value="skillsOn"
          :disabled="integration.loading || !skillsToggleable"
          @update:model-value="handleSkillsToggle"
        />
      </div>
      <p class="text-body-sm mt-2" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('skillsHint') }}
      </p>

      <div v-if="integration.skills" class="mt-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <span class="text-label-sm">{{ i18n.t('skillsStatus') }}</span>
          <span class="text-sm font-mono">
            {{ integration.loading
              ? i18n.t('skillsBusy')
              : skillsOn ? i18n.t('skillsInstalled') : i18n.t('skillsNotInstalled') }}
          </span>
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="text-label-sm">{{ i18n.t('skillsVersion') }}</span>
          <span class="text-sm font-mono">v{{ integration.skills.version }}</span>
        </div>

        <p v-if="integration.skills.update_available" class="text-sm" style="color: rgb(var(--md-primary))">
          {{ i18n.t('skillsUpdateAvailable') }}
        </p>
        <p v-if="integration.skills.unsupported" class="text-sm" style="color: rgb(var(--md-error))">
          {{ i18n.t('skillsUnsupported') }}
        </p>

        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="text-label-sm">{{ i18n.t('skillsSource') }}</div>
            <div class="text-xs font-mono break-all mt-1">{{ SKILL_REPO_URL }}</div>
          </div>
          <button class="btn-outlined text-sm shrink-0" @click="copyToClipboard(SKILL_REPO_URL, 'skills-repo')">
            {{ mcpCopied === 'skills-repo' ? i18n.t('cliCopied') : i18n.t('cliCopy') }}
          </button>
        </div>

        <div>
          <div class="text-label-sm mb-1.5">{{ i18n.t('skillsTargets') }}</div>
          <div
            v-for="target in integration.skills.targets"
            :key="target.path"
            class="text-xs font-mono break-all leading-5"
            :style="{ color: target.installed ? 'rgb(var(--md-primary))' : 'rgb(var(--md-on-surface-variant))' }"
          >
            {{ target.installed ? '✓' : '·' }} {{ target.path }}
          </div>
        </div>

        <p class="text-xs" style="color: rgb(var(--md-on-surface-variant))">
          {{ i18n.t('skillsRestartHint') }}
        </p>
      </div>

      <p v-if="integration.error" class="text-sm mt-3 break-all" style="color: rgb(var(--md-error))">
        {{ integration.error }}
      </p>
    </div>

    <!-- Version update -->
    <div v-if="showDesktopUpdate || showOta" class="card-filled p-5 mb-4 text-center">
      <label class="text-label-md flex items-center justify-center gap-1.5 mb-1" style="color: rgb(var(--md-on-surface-variant))">
        <ArrowPathIcon class="w-4 h-4" />
        {{ i18n.t('settingsUpdate') }}
      </label>
      <p class="text-body-sm mb-4" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('settingsCurrentVersion') }}: v{{ version }}<template v-if="showOta && otaBundle"> · {{ i18n.t('otaCurrentBundle') }}: {{ otaBundle }}</template>
      </p>

      <!-- Desktop -->
      <div v-if="showDesktopUpdate" class="flex flex-col items-center gap-3">
        <div class="flex items-center justify-center gap-3">
          <button
            class="btn-outlined text-sm !px-5"
            :disabled="updater.stage.value === 'downloading'"
            @click="updater.checkForUpdate(true)"
          >
            <ArrowPathIcon class="w-4 h-4" />
            {{ i18n.t('updateCheckBtn') }}
          </button>
          <button
            v-if="updater.stage.value === 'available'"
            class="btn-filled text-sm !px-5"
            @click="updater.startUpdate"
          >
            {{ i18n.t('updateNow') }}
          </button>
          <button
            v-else-if="updater.stage.value === 'ready'"
            class="btn-filled text-sm !px-5"
            @click="updater.restart"
          >
            {{ i18n.t('updateRestart') }}
          </button>
        </div>
        <div class="text-body-sm" style="color: rgb(var(--md-on-surface-variant))">
          <template v-if="updater.stage.value === 'available'">
            {{ i18n.t('updateAvailableTitle', { version: updater.version.value }) }}
          </template>
          <template v-else-if="updater.stage.value === 'downloading'">
            {{ i18n.t('updateDownloading') }} {{ updater.progress.value }}%
          </template>
          <template v-else-if="updater.stage.value === 'ready'">{{ i18n.t('updateReady') }}</template>
          <template v-else-if="updater.stage.value === 'upToDate'">{{ i18n.t('updateUpToDate') }}</template>
          <template v-else-if="updater.stage.value === 'failed'">
            <span style="color: rgb(var(--md-error))">{{ i18n.t('updateFailed') }}</span>
            <span v-if="updater.error.value" class="block text-xs mt-1 break-all">{{ updater.error.value }}</span>
          </template>
        </div>
      </div>

      <!-- Mobile OTA -->
      <div v-else-if="showOta" class="flex flex-col items-center gap-3">
        <button class="btn-outlined text-sm !px-5" :disabled="otaBusy" @click="handleOtaCheck">
          <ArrowPathIcon class="w-4 h-4" />
          {{ i18n.t('otaCheckUpdate') }}
        </button>
        <p v-if="otaMessage" class="text-body-sm" style="color: rgb(var(--md-on-surface-variant))">{{ otaMessage }}</p>
      </div>
    </div>
  </div>
</template>
