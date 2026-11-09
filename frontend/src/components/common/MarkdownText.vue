<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { isTauri } from '@/utils/platform'
import { renderInlineMarkdown, renderMarkdown } from '@/utils/markdown'
import { decodeDiagramSource, renderMermaid } from '@/utils/mermaid'

/**
 * Renders AI-authored Markdown (GFM + KaTeX + Mermaid) as sanitized HTML.
 * Use `inline` inside buttons, option rows and other phrasing contexts.
 */
const props = defineProps<{
  text: string
  /** True while a chat reply is still streaming. */
  streaming?: boolean
  /** Inline (span) rendering without block wrappers. */
  inline?: boolean
}>()

const i18n = useI18nStore()
const rootEl = ref<HTMLElement | null>(null)

const html = computed(() => {
  const labels = {
    copyLabel: i18n.t('mdCopy'),
    copiedLabel: i18n.t('mdCopied'),
  }
  return props.inline
    ? renderInlineMarkdown(props.text, labels)
    : renderMarkdown(props.text, { ...labels, streaming: props.streaming })
})

let diagramGeneration = 0
let themeTimer: number | null = null
let themeObserver: MutationObserver | null = null

/** Mermaid is async and heavy: render only the placeholders added by this pass. */
async function renderDiagrams() {
  const root = rootEl.value
  if (!root) return
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.md-mermaid')).filter(
    (block) => block.dataset.state !== 'ready' && block.dataset.state !== 'pending',
  )
  if (blocks.length === 0) return
  const generation = ++diagramGeneration
  for (const block of blocks) {
    const encoded = block.dataset.mermaid
    if (!encoded) continue
    block.dataset.state = 'pending'
    try {
      const svg = await renderMermaid(decodeDiagramSource(encoded))
      if (generation !== diagramGeneration) return
      block.innerHTML = svg
      block.dataset.state = 'ready'
    } catch {
      if (generation !== diagramGeneration) return
      block.dataset.state = 'error'
      block.textContent = ''
      const message = document.createElement('div')
      message.className = 'md-mermaid-error'
      message.textContent = i18n.t('mdDiagramFailed')
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = decodeDiagramSource(encoded)
      pre.appendChild(code)
      block.append(message, pre)
    }
  }
}

function scheduleRenderDiagrams() {
  void nextTick(() => {
    void renderDiagrams()
  })
}

function rerenderForTheme() {
  const root = rootEl.value
  if (!root) return
  root.querySelectorAll<HTMLElement>('.md-mermaid').forEach((block) => {
    delete block.dataset.state
    block.textContent = ''
  })
  scheduleRenderDiagrams()
}

async function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return

  const copyButton = target.closest<HTMLElement>('[data-code-copy]')
  if (copyButton) {
    event.preventDefault()
    event.stopPropagation()
    const code = copyButton.closest('.md-code-block')?.querySelector('code')?.textContent ?? ''
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      const original = copyButton.textContent
      copyButton.textContent = copyButton.dataset.copyLabel ?? i18n.t('mdCopied')
      window.setTimeout(() => {
        copyButton.textContent = original
      }, 1600)
    } catch {
      /* clipboard unavailable */
    }
    return
  }

  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  if (!anchor) return
  const href = anchor.getAttribute('href') ?? ''
  if (!/^https?:\/\//i.test(href)) return
  // A link inside an option button must not also pick that option.
  event.stopPropagation()
  if (isTauri()) {
    event.preventDefault()
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(href)
    } catch {
      /* ignore */
    }
  }
}

watch(html, scheduleRenderDiagrams, { flush: 'post' })

onMounted(() => {
  scheduleRenderDiagrams()
  themeObserver = new MutationObserver(() => {
    if (themeTimer !== null) window.clearTimeout(themeTimer)
    themeTimer = window.setTimeout(() => {
      themeTimer = null
      rerenderForTheme()
    }, 150)
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-accent'],
  })
})

onBeforeUnmount(() => {
  diagramGeneration += 1
  if (themeTimer !== null) window.clearTimeout(themeTimer)
  themeObserver?.disconnect()
  themeObserver = null
})
</script>

<template>
  <component
    :is="inline ? 'span' : 'div'"
    ref="rootEl"
    class="markdown-body"
    :class="{ 'markdown-inline': inline }"
    v-html="html"
    @click="handleClick"
  />
</template>
