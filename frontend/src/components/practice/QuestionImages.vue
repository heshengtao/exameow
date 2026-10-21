<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { getCachedLocalMediaUrl, resolveLocalMediaUrl } from '@/composables/useMediaUrl'

const props = withDefaults(
  defineProps<{
    ids?: string[]
    /** Optional resolver for relay-hosted exams. Return null/undefined for local storage. */
    urlFor?: (id: string) => string | undefined
    compact?: boolean
  }>(),
  { ids: () => [], compact: false },
)

const i18n = useI18nStore()
const urls = ref<Record<string, string>>({})
const failed = ref<Record<string, boolean>>({})

async function load() {
  const ids = props.ids ?? []
  const next: Record<string, string> = {}
  const nextFailed: Record<string, boolean> = {}

  await Promise.all(
    ids.map(async (id) => {
      const remote = props.urlFor?.(id)
      if (remote) {
        next[id] = remote
        return
      }
      const cached = getCachedLocalMediaUrl(id)
      if (cached) {
        next[id] = cached
        return
      }
      const url = await resolveLocalMediaUrl(id)
      if (url) next[id] = url
      else nextFailed[id] = true
    }),
  )

  urls.value = { ...urls.value, ...next }
  failed.value = nextFailed
}

watch(
  () => props.ids?.join('|') ?? '',
  () => {
    void load()
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="(ids ?? []).length > 0" class="space-y-2" :class="compact ? 'mt-2' : 'mt-3 mb-4'">
    <template v-for="id in ids" :key="id">
      <img
        v-if="urls[id]"
        :src="urls[id]"
        loading="lazy"
        class="rounded-xl border object-contain bg-white"
        :class="compact ? 'max-h-32' : 'max-h-[360px] w-auto max-w-full'"
        :style="{ borderColor: 'rgb(var(--md-outline-variant))' }"
        alt=""
      />
      <div
        v-else-if="failed[id]"
        class="rounded-xl border px-3 py-2 text-xs"
        :style="{
          borderColor: 'rgb(var(--md-outline-variant))',
          color: 'rgb(var(--md-on-surface-variant))',
        }"
      >
        {{ i18n.t('mediaMissing') }}
      </div>
    </template>
  </div>
</template>
