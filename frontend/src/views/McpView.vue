<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { useMcpStore } from '@/stores/mcp'
import BaseSwitch from '@/components/common/BaseSwitch.vue'
import { ArrowLeftIcon, ServerStackIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const i18n = useI18nStore()
const mcp = useMcpStore()

const mcpPort = ref(5274)
const mcpAllowLan = ref(false)
const mcpShowToken = ref(false)
const copied = ref('')
const actionError = ref('')

const mcpEndpoint = computed(() => {
  const info = mcp.info
  if (!info) return ''
  return mcpAllowLan.value && info.lan_url ? info.lan_url : info.url
})

const mcpEndpointIsLoopback = computed(() =>
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/i.test(mcpEndpoint.value),
)

const installPrompt = computed(() => {
  const auth = mcpEndpointIsLoopback.value
    ? i18n.t('mcpAuthNone')
    : i18n.t('mcpAuthBearer', { token: mcp.info?.token ?? '' })
  return i18n.t('mcpInstallPrompt', { endpoint: mcpEndpoint.value, auth })
})

async function syncMcpSettings() {
  await mcp.load()
  if (mcp.info) {
    mcpPort.value = mcp.info.port ?? 5274
    mcpAllowLan.value = !!mcp.info.allow_lan
  }
}

async function handleMcpToggle(value: boolean) {
  actionError.value = ''
  try {
    await mcp.setEnabled(value, mcpPort.value, mcpAllowLan.value)
  } catch (e: any) {
    actionError.value = e?.message ?? String(e)
  }
}

async function handleMcpPort() {
  if (!mcp.isNative || !mcp.info?.enabled) return
  actionError.value = ''
  try {
    await mcp.setEnabled(true, mcpPort.value, mcpAllowLan.value)
  } catch (e: any) {
    actionError.value = e?.message ?? String(e)
  }
}

async function handleMcpLan(value: boolean) {
  mcpAllowLan.value = value
  if (!mcp.isNative || !mcp.info?.enabled) return
  actionError.value = ''
  try {
    await mcp.setEnabled(true, mcpPort.value, value)
  } catch (e: any) {
    actionError.value = e?.message ?? String(e)
  }
}

async function handleMcpRegenerate() {
  actionError.value = ''
  try {
    await mcp.regenerateToken()
  } catch (e: any) {
    actionError.value = e?.message ?? String(e)
  }
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

onMounted(syncMcpSettings)
</script>

<template>
  <div>
    <div class="flex items-center gap-2 mb-6">
      <button class="btn-icon" @click="router.push('/mine')">
        <ArrowLeftIcon class="w-5 h-5 rtl:rotate-180" />
      </button>
      <h1 class="text-display-sm">{{ i18n.t('mcpTitle') }}</h1>
    </div>

    <p class="text-body-lg mb-6" style="color: rgb(var(--md-on-surface-variant))">
      {{ i18n.t('mcpEnableHint') }}
    </p>

    <!-- Server -->
    <div class="card-filled p-5 sm:p-6 mb-4">
      <div class="flex items-center justify-between gap-4">
        <label class="text-label-md font-semibold flex items-center gap-2" style="color: rgb(var(--md-on-surface-variant))">
          <ServerStackIcon class="w-4 h-4" />
          {{ i18n.t('mcpEnable') }}
        </label>
        <BaseSwitch
          :model-value="mcp.info?.enabled ?? false"
          :disabled="mcp.loading"
          @update:model-value="handleMcpToggle"
        />
      </div>

      <div v-if="mcp.info?.enabled" class="mt-5 space-y-5">
        <div class="flex items-center justify-between gap-4">
          <span class="text-label-sm">{{ i18n.t('mcpPort') }}</span>
          <input
            v-model.number="mcpPort"
            type="number"
            min="1024"
            max="65535"
            class="w-20 text-center font-bold text-base px-3 py-1.5 rounded-xl border outline-none transition-all duration-200 focus:ring-2 focus:ring-[rgb(var(--md-primary))] no-spinner"
            :style="{
              backgroundColor: 'rgb(var(--md-surface-container-lowest))',
              borderColor: 'rgb(var(--md-outline-variant))',
              color: 'rgb(var(--md-on-surface))',
            }"
            @change="handleMcpPort"
          />
        </div>

        <div class="flex items-start justify-between gap-4">
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
              {{ copied === 'endpoint' ? i18n.t('mcpCopied') : i18n.t('mcpCopy') }}
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
              {{ copied === 'token' ? i18n.t('mcpCopied') : i18n.t('mcpCopy') }}
            </button>
            <button class="btn-outlined text-sm shrink-0" @click="handleMcpRegenerate">
              {{ i18n.t('mcpRegenerate') }}
            </button>
          </div>
          <p class="text-xs mt-1.5" style="color: rgb(var(--md-error))">{{ i18n.t('mcpSecurityHint') }}</p>
        </div>

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

      <p v-if="actionError || mcp.error" class="text-sm mt-3 break-all" style="color: rgb(var(--md-error))">
        {{ actionError || mcp.error }}
      </p>
    </div>

    <!-- Paste-to-install prompt -->
    <div v-if="mcp.info?.enabled" class="card-filled p-5 sm:p-6 mb-4">
      <div class="flex items-center gap-2 mb-2">
        <ClipboardDocumentIcon class="w-4 h-4 shrink-0" style="color: rgb(var(--md-primary))" />
        <label class="text-label-md font-semibold" style="color: rgb(var(--md-on-surface-variant))">
          {{ i18n.t('mcpInstallTitle') }}
        </label>
      </div>
      <p class="text-body-sm mb-3" style="color: rgb(var(--md-on-surface-variant))">
        {{ i18n.t('mcpInstallHint') }}
      </p>
      <textarea
        :value="installPrompt"
        readonly
        rows="4"
        class="input-outlined w-full text-xs leading-5 font-mono resize-none"
      />
      <button class="btn-filled w-full text-sm mt-3" @click="copyToClipboard(installPrompt, 'command')">
        {{ copied === 'command' ? i18n.t('mcpCopied') : i18n.t('mcpCopyCommand') }}
      </button>
    </div>
  </div>
</template>
