<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { isMobileDevice } from '@/utils/platform'
import { ArrowUpIcon, StopIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  streaming: boolean
  awaitingAnswer: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'stop'): void
}>()

const i18n = useI18nStore()
const text = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)

const placeholder = computed(() =>
  props.awaitingAnswer ? i18n.t('learnPlaceholderAnswer') : i18n.t('learnPlaceholderAsk'),
)
const canSend = computed(
  () => !props.disabled && !props.streaming && text.value.trim().length > 0,
)

function autoGrow() {
  nextTick(() => {
    const el = inputEl.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  })
}

watch(text, autoGrow)

function submit() {
  if (!canSend.value) return
  const value = text.value.trim()
  if (!value) return
  emit('send', value)
  text.value = ''
  autoGrow()
}

function onInput(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value
}

function onKeydown(e: KeyboardEvent) {
  // Enter sends on hardware keyboards; touch users use the send button (Enter = newline).
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobileDevice()) {
    e.preventDefault()
    submit()
  }
}
</script>

<template>
  <div class="learn-composer" :class="{ 'is-disabled': disabled }">
    <textarea
      ref="inputEl"
      class="learn-composer__input"
      rows="1"
      :value="text"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @keydown="onKeydown"
    />
    <div class="learn-composer__bar">
      <span class="learn-composer__hint">{{ i18n.t('learnComposerHint') }}</span>
      <button
        v-if="streaming"
        class="learn-composer__action learn-composer__action--stop"
        :title="i18n.t('learnStop')"
        :aria-label="i18n.t('learnStop')"
        @click="emit('stop')"
      >
        <StopIcon class="w-5 h-5" />
      </button>
      <button
        v-else
        class="learn-composer__action"
        :class="{ 'is-ready': canSend }"
        :disabled="!canSend"
        :title="i18n.t('learnSend')"
        :aria-label="i18n.t('learnSend')"
        @click="submit"
      >
        <ArrowUpIcon class="w-5 h-5" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.learn-composer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 12px 10px 18px;
  border-radius: 28px;
  border: 1px solid rgb(var(--md-outline-variant) / 0.7);
  background-color: rgb(var(--md-surface-container-high));
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.learn-composer:focus-within {
  border-color: rgb(var(--md-primary));
  background-color: rgb(var(--md-surface-container));
  box-shadow: var(--md-elevation-1);
}

.learn-composer.is-disabled {
  opacity: 0.6;
}

.learn-composer__input {
  width: 100%;
  min-height: 24px;
  max-height: 200px;
  padding: 0;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: rgb(var(--md-on-surface));
  font-size: 15px;
  line-height: 1.55;
  overflow-y: auto;
}

.learn-composer__input::placeholder {
  color: rgb(var(--md-on-surface-muted));
}

.learn-composer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.learn-composer__hint {
  font-size: 11px;
  line-height: 1;
  color: rgb(var(--md-on-surface-muted));
  user-select: none;
  padding-left: 2px;
}

.learn-composer__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  background-color: rgb(var(--md-surface-container-highest));
  color: rgb(var(--md-on-surface-muted));
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.learn-composer__action.is-ready {
  background-color: rgb(var(--md-primary));
  color: rgb(var(--md-on-primary));
  box-shadow: var(--md-elevation-1);
}

.learn-composer__action.is-ready:hover {
  box-shadow: 0 4px 12px rgba(var(--md-primary) / 0.3);
  background-image: linear-gradient(
    rgba(var(--md-on-primary) / var(--md-state-hover-alpha)),
    rgba(var(--md-on-primary) / var(--md-state-hover-alpha))
  );
}

.learn-composer__action:active {
  transform: scale(0.92);
}

.learn-composer__action:focus-visible {
  outline: 2px solid rgb(var(--md-primary));
  outline-offset: 2px;
}

.learn-composer__action:disabled {
  cursor: default;
}

.learn-composer__action--stop {
  background-color: rgb(var(--md-error-container));
  color: rgb(var(--md-on-error-container));
}

@media (max-width: 639px) {
  .learn-composer__hint {
    display: none;
  }
  .learn-composer__bar {
    justify-content: flex-end;
  }
}
</style>
