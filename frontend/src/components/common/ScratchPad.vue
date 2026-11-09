<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import {
  ArrowUturnLeftIcon,
  BackspaceIcon,
  PencilSquareIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'

/**
 * Floating scratch paper shared by practice and tutor screens.
 *
 * Drawings are kept per question (keyed by `storageKey`) in module memory so
 * stepping back to a question restores its working, while nothing is written
 * to disk. Strokes store semantic color tokens, so switching theme recolors
 * the existing ink instead of leaving it unreadable.
 */

export interface ScratchPoint {
  x: number
  y: number
}

export interface ScratchStroke {
  /** CSS custom property name holding the ink color. */
  color: string
  width: number
  erase: boolean
  points: ScratchPoint[]
}

const drawings = new Map<string, ScratchStroke[]>()

function drawingFor(key: string): ScratchStroke[] {
  let list = drawings.get(key)
  if (!list) {
    list = []
    drawings.set(key, list)
  }
  return list
}

const props = defineProps<{
  /** Identifies the drawing bucket, e.g. `practice:<bank>:<question>`. */
  storageKey: string
}>()

const emit = defineEmits<{ (e: 'update:open', open: boolean): void }>()

const i18n = useI18nStore()

const open = ref(false)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const strokes = ref<ScratchStroke[]>(drawingFor(props.storageKey))
const tool = ref<'pen' | 'eraser'>('pen')
const color = ref('--md-on-surface')
const penWidth = ref(4)
const themeTick = ref(0)
const viewportTick = ref(0)

const dragPos = ref<{ left: number; top: number } | null>(null)
const sheetHeight = ref<number | null>(null)
let dragOffset = { x: 0, y: 0 }
let dragStartY = 0
let dragStartHeight = 0
let dragPointer: number | null = null

const panelStyle = computed(() => {
  void viewportTick.value
  const style: Record<string, string> = {}
  if (dragPos.value) {
    style.left = `${dragPos.value.left}px`
    style.top = `${dragPos.value.top}px`
    style.right = 'auto'
    style.bottom = 'auto'
  }
  if (sheetHeight.value !== null && window.innerWidth < 640) {
    style.height = `${sheetHeight.value}px`
    style.maxHeight = 'none'
  }
  return Object.keys(style).length ? style : undefined
})

const isEmpty = computed(() => strokes.value.length === 0)
const canClear = computed(() => strokes.value.length > 0)

const COLORS = [
  { token: '--md-on-surface', label: 'ink' },
  { token: '--md-primary', label: 'primary' },
  { token: '--md-error', label: 'red' },
  { token: '--sp-green', label: 'green' },
] as const

const WIDTHS = [2, 4, 7] as const

const ERASER_WIDTH = 22

let ctx: CanvasRenderingContext2D | null = null
let active: ScratchStroke | null = null
let pointerId: number | null = null
let lastPoint: ScratchPoint | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

function openPanel() {
  if (open.value) return
  open.value = true
  emit('update:open', true)
  void nextTick(() => {
    attachCanvas()
    resizeCanvas()
    redraw()
  })
}

function closePanel() {
  if (!open.value) return
  open.value = false
  emit('update:open', false)
  detachCanvas()
}

function toggle() {
  if (open.value) closePanel()
  else openPanel()
}

defineExpose({ open: openPanel, close: closePanel, toggle })

watch(
  () => props.storageKey,
  (key) => {
    strokes.value = drawingFor(key)
    active = null
    void nextTick(() => {
      if (open.value) redraw()
    })
  },
)

function attachCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !canvas.parentElement) return
  ctx = canvas.getContext('2d')
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => resizeCanvas())
  resizeObserver.observe(canvas.parentElement)
}

function detachCanvas() {
  resizeObserver?.disconnect()
  resizeObserver = null
  ctx = null
  active = null
  pointerId = null
}

function resizeCanvas() {
  const canvas = canvasRef.value
  const parent = canvas?.parentElement
  if (!canvas || !parent) return
  const rect = parent.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  redraw()
}

function resolveColor(token: string): string {
  // Reading the tick keeps palette swatches in sync with theme/accent changes.
  void themeTick.value
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (!raw) return '#1c1b1f'
  return `rgb(${raw.split(/\s+/).join(', ')})`
}

function redraw() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  for (const stroke of strokes.value) drawStroke(stroke)
  if (active) drawStroke(active)
}

function applyStyle(stroke: ScratchStroke) {
  if (!ctx) return
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = stroke.erase ? 'rgba(0,0,0,1)' : resolveColor(stroke.color)
  ctx.fillStyle = ctx.strokeStyle
  ctx.lineWidth = stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function drawStroke(stroke: ScratchStroke) {
  if (!ctx || stroke.points.length === 0) return
  applyStyle(stroke)
  const points = stroke.points
  if (points.length === 1) {
    const point = points[0]!
    ctx.beginPath()
    ctx.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i]!
    const next = points[i + 1]!
    ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2)
  }
  const last = points[points.length - 1]!
  ctx.lineTo(last.x, last.y)
  ctx.stroke()
}

function drawSegment(from: ScratchPoint, to: ScratchPoint, stroke: ScratchStroke) {
  if (!ctx) return
  applyStyle(stroke)
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function pointFrom(event: PointerEvent): ScratchPoint {
  const rect = canvasRef.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function onPointerDown(event: PointerEvent) {
  if (!ctx) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  try {
    canvasRef.value?.setPointerCapture(event.pointerId)
  } catch {
    /* synthetic or already-released pointers */
  }
  pointerId = event.pointerId
  const point = pointFrom(event)
  const stroke: ScratchStroke = {
    color: color.value,
    width: tool.value === 'eraser' ? ERASER_WIDTH : penWidth.value,
    erase: tool.value === 'eraser',
    points: [point],
  }
  active = stroke
  strokes.value.push(stroke)
  lastPoint = point
  drawStroke(stroke)
}

function onPointerMove(event: PointerEvent) {
  if (!active || pointerId !== event.pointerId) return
  event.preventDefault()
  const point = pointFrom(event)
  const previous = lastPoint
  if (!previous) {
    lastPoint = point
    return
  }
  const dx = point.x - previous.x
  const dy = point.y - previous.y
  if (dx * dx + dy * dy < 0.36) return
  active.points.push(point)
  drawSegment(previous, point, active)
  lastPoint = point
}

function finishStroke(event: PointerEvent) {
  if (!active || pointerId !== event.pointerId) return
  try {
    canvasRef.value?.releasePointerCapture?.(event.pointerId)
  } catch {
    /* pointer capture may already be gone */
  }
  pointerId = null
  active = null
  lastPoint = null
  redraw()
}

function undo() {
  if (strokes.value.length === 0) return
  strokes.value.pop()
  redraw()
}

function clear() {
  if (strokes.value.length === 0) return
  strokes.value.length = 0
  redraw()
}

function pickColor(token: string) {
  color.value = token
  tool.value = 'pen'
}

function pickWidth(width: number) {
  penWidth.value = width
  tool.value = 'pen'
}

/**
 * Header drag: on desktop it moves the sheet anywhere in the viewport, on
 * mobile it resizes the bottom sheet vertically (drag the grab handle).
 */
function startDrag(event: PointerEvent) {
  if ((event.target as HTMLElement).closest('button')) return
  const panel = panelRef.value
  if (!panel) return
  dragPointer = event.pointerId
  if (window.innerWidth < 640) {
    dragStartY = event.clientY
    dragStartHeight = panel.offsetHeight
    sheetHeight.value = dragStartHeight
  } else {
    const rect = panel.getBoundingClientRect()
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    dragPos.value = { left: rect.left, top: rect.top }
  }
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  } catch {
    /* ignore */
  }
  event.preventDefault()
}

function moveDrag(event: PointerEvent) {
  if (dragPointer !== event.pointerId) return
  const panel = panelRef.value
  if (!panel) return
  if (window.innerWidth < 640) {
    sheetHeight.value = clamp(
      dragStartHeight + (dragStartY - event.clientY),
      180,
      window.innerHeight * 0.86,
    )
    return
  }
  if (!dragPos.value) return
  const panelWidth = panel.offsetWidth
  const panelHeight = panel.offsetHeight
  dragPos.value = {
    left: clamp(event.clientX - dragOffset.x, 8, window.innerWidth - panelWidth - 8),
    top: clamp(event.clientY - dragOffset.y, 8, window.innerHeight - panelHeight - 8),
  }
}

function endDrag(event: PointerEvent) {
  if (dragPointer !== event.pointerId) return
  dragPointer = null
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  } catch {
    /* ignore */
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function onWindowResize() {
  viewportTick.value += 1
  // Crossing the mobile breakpoint drops the free-floating position so the
  // sheet re-anchors to the bottom edge.
  if (window.innerWidth < 640) dragPos.value = null
  const panel = panelRef.value
  if (panel && sheetHeight.value !== null) {
    sheetHeight.value = clamp(sheetHeight.value, 180, window.innerHeight * 0.86)
    return
  }
  const position = dragPos.value
  if (!position || !panel) return
  dragPos.value = {
    left: clamp(position.left, 8, window.innerWidth - panel.offsetWidth - 8),
    top: clamp(position.top, 8, window.innerHeight - panel.offsetHeight - 8),
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  const target = event.target as HTMLElement | null
  const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
  if (typing) return
  if (event.key === 'Escape') {
    closePanel()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onWindowResize)
  themeObserver = new MutationObserver(() => {
    themeTick.value += 1
    if (open.value) redraw()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-accent'],
  })
})

onBeforeUnmount(() => {
  if (open.value) emit('update:open', false)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onWindowResize)
  themeObserver?.disconnect()
  themeObserver = null
  detachCanvas()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="scale">
      <div
        v-if="open"
        ref="panelRef"
        class="fixed z-[70] inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] h-[46dvh] max-h-[calc(100dvh-190px)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[min(540px,calc(100dvh-8rem))] sm:max-h-none sm:w-[420px]"
        :style="panelStyle"
      >
        <div
          class="flex h-full flex-col overflow-hidden rounded-[24px] shadow-2xl"
          :style="{
            backgroundColor: 'rgb(var(--md-surface-container-low))',
            border: '1px solid rgb(var(--md-outline-variant) / 0.5)',
          }"
        >
          <!-- Header -->
          <div
            class="relative flex h-12 shrink-0 touch-none items-center gap-1.5 px-3 pt-2 sm:h-11 sm:pt-0"
            :class="dragPos ? 'cursor-grabbing' : 'sm:cursor-move'"
            :style="{ borderBottom: '1px solid rgb(var(--md-outline-variant) / 0.4)' }"
            @pointerdown="startDrag"
            @pointermove="moveDrag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
            @dblclick="dragPos = null"
          >
            <span
              class="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full sm:hidden"
              :style="{ backgroundColor: 'rgb(var(--md-outline-variant))' }"
            />
            <PencilSquareIcon class="h-4 w-4" :style="{ color: 'rgb(var(--md-primary))' }" />
            <span class="text-label-lg font-semibold" :style="{ color: 'rgb(var(--md-on-surface))' }">
              {{ i18n.t('scratchpadTitle') }}
            </span>
            <div class="flex-1" />
            <button
              class="btn-icon !h-8 !w-8"
              :disabled="!canClear"
              :title="i18n.t('scratchpadUndo')"
              :aria-label="i18n.t('scratchpadUndo')"
              @click="undo"
            >
              <ArrowUturnLeftIcon class="h-4 w-4 rtl:rotate-180" />
            </button>
            <button
              class="btn-icon !h-8 !w-8"
              :disabled="!canClear"
              :title="i18n.t('scratchpadClear')"
              :aria-label="i18n.t('scratchpadClear')"
              @click="clear"
            >
              <TrashIcon class="h-4 w-4" />
            </button>
            <button
              class="btn-icon !h-8 !w-8"
              :title="i18n.t('scratchpadClose')"
              :aria-label="i18n.t('scratchpadClose')"
              @click="closePanel"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>

          <!-- Tools -->
          <div
            class="flex shrink-0 items-center gap-2 overflow-x-auto px-3 py-2"
            :style="{ borderBottom: '1px solid rgb(var(--md-outline-variant) / 0.4)' }"
          >
            <button
              v-for="item in COLORS"
              :key="item.token"
              type="button"
              class="h-6 w-6 shrink-0 rounded-full transition-transform"
              :class="color === item.token && tool === 'pen' ? 'scale-110 ring-2' : 'ring-1'"
              :style="{
                backgroundColor: resolveColor(item.token),
                '--tw-ring-color':
                  color === item.token && tool === 'pen'
                    ? 'rgb(var(--md-on-surface))'
                    : 'rgb(var(--md-outline-variant) / 0.6)',
              }"
              :aria-label="item.label"
              @click="pickColor(item.token)"
            />
            <span
              class="mx-0.5 h-5 w-px shrink-0"
              :style="{ backgroundColor: 'rgb(var(--md-outline-variant) / 0.5)' }"
            />
            <button
              v-for="width in WIDTHS"
              :key="width"
              type="button"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              :style="{
                backgroundColor:
                  penWidth === width && tool === 'pen'
                    ? 'rgb(var(--md-secondary-container))'
                    : 'transparent',
              }"
              @click="pickWidth(width)"
            >
              <span
                class="rounded-full"
                :style="{
                  width: `${width + 4}px`,
                  height: `${width + 4}px`,
                  backgroundColor: 'rgb(var(--md-on-surface))',
                }"
              />
            </button>
            <span
              class="mx-0.5 h-5 w-px shrink-0"
              :style="{ backgroundColor: 'rgb(var(--md-outline-variant) / 0.5)' }"
            />
            <button
              type="button"
              class="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs"
              :style="{
                backgroundColor:
                  tool === 'pen' ? 'rgb(var(--md-secondary-container))' : 'transparent',
                color: 'rgb(var(--md-on-surface-variant))',
              }"
              :title="i18n.t('scratchpadPen')"
              @click="tool = 'pen'"
            >
              <PencilIcon class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">{{ i18n.t('scratchpadPen') }}</span>
            </button>
            <button
              type="button"
              class="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs"
              :style="{
                backgroundColor:
                  tool === 'eraser' ? 'rgb(var(--md-secondary-container))' : 'transparent',
                color: 'rgb(var(--md-on-surface-variant))',
              }"
              :title="i18n.t('scratchpadEraser')"
              @click="tool = 'eraser'"
            >
              <BackspaceIcon class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">{{ i18n.t('scratchpadEraser') }}</span>
            </button>
          </div>

          <!-- Drawing surface -->
          <div
            class="relative min-h-0 flex-1"
            :style="{
              backgroundColor: 'rgb(var(--md-surface))',
              backgroundImage:
                'radial-gradient(rgb(var(--md-outline-variant) / 0.55) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }"
          >
            <canvas
              ref="canvasRef"
              class="absolute inset-0 touch-none"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="finishStroke"
              @pointercancel="finishStroke"
            />
            <div
              v-if="isEmpty"
              class="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm"
              :style="{ color: 'rgb(var(--md-on-surface-muted))' }"
            >
              {{ i18n.t('scratchpadHint') }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
