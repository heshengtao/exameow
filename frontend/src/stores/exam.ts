import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import type { ExamParams, Question, QuestionType, Difficulty } from '@exameow/shared'
import { api } from '@/api'
import { useConfigStore } from './config'
import { usePracticeStore } from './practice'
import { useI18nStore } from './i18n'
import type { ParseProgressReport } from '@/utils/fileParser'
import { isTauri, isCloudflare } from '@/utils/platform'
import { tagQuestions } from '@/utils/questionMetadata'
import { computeBatchSpecs, splitTextChunk } from '@/utils/chunking'
import { normalizeQuestion } from '@/utils/dataCompat'

const ALL_TYPES: QuestionType[] = [
  'single_choice' as QuestionType,
  'multi_choice' as QuestionType,
  'true_false' as QuestionType,
  'fill_blank' as QuestionType,
  'short_answer' as QuestionType,
]

export const useExamStore = defineStore('exam', () => {
  const questionTypes = ref<QuestionType[]>([])
  const typeCounts = reactive<Record<string, number>>(
    Object.fromEntries(ALL_TYPES.map((t) => [t, 0])),
  )
  const difficulty = ref<Difficulty>('medium' as Difficulty)
  const language = ref('zh-CN')
  const topicFilter = ref('')
  const autoChapter = ref(false)
  const subject = ref('')
  const questions = ref<Question[]>(loadCachedQuestions())
  const sourceFileName = ref(loadCachedSourceFile())
  const generating = ref(false)
  const error = ref<string | null>(null)
  const extraPrompt = ref('')
  const summary = ref<{ requested: number; generated: number; skipped: number } | null>(null)
  const progress = ref({ current: 0, total: 0, message: '', phase: 'parsing' as ProgressPhase })
  let abortController: AbortController | null = null
  const generated = computed(() => questions.value.length > 0)
  const totalCount = computed(() =>
    Object.values(typeCounts).reduce((s, c) => s + c, 0),
  )

  function getParams(): ExamParams {
    const tc: Record<string, number> = {}
    for (const t of questionTypes.value) {
      tc[t] = typeCounts[t] || 0
    }
    return {
      question_types: questionTypes.value,
      count: totalCount.value || 1,
      type_counts: Object.keys(tc).length > 0 ? tc : undefined,
      difficulty: difficulty.value,
      language: language.value,
      topic_filter: topicFilter.value || undefined,
      auto_chapter: autoChapter.value,
    }
  }

  type ProgressPhase = 'parsing' | 'generating' | 'complete' | 'cancelled'

  function buildBatches(baseParams: ExamParams): ExamParams[] {
    const typeEntries = Object.entries(baseParams.type_counts || {}).filter(([, c]) => c > 0)
    const specs = computeBatchSpecs(
      baseParams.text || '',
      typeEntries.map(([type, count]) => ({ type, count })),
    )
    if (specs.length === 0) return [{ ...baseParams }]
    const batches = specs.map((s, i) => ({
      ...baseParams,
      count: Object.values(s.typeCounts).reduce((a, b) => a + b, 0),
      type_counts: s.typeCounts,
      text: s.text,
      batch_index: i + 1,
      batch_total: 0,
    }))
    const totalBatches = batches.length
    for (const b of batches) b.batch_total = totalBatches
    return batches
  }

  function loadCachedQuestions(): Question[] {
    try {
      const cached = localStorage.getItem('exameow-questions')
      if (cached) {
        const parsed = JSON.parse(cached)
        return Array.isArray(parsed)
          ? parsed.map((question, index) => normalizeQuestion(question, `cached-${index + 1}`))
          : []
      }
    } catch {}
    return []
  }

  function loadCachedSourceFile(): string {
    return localStorage.getItem('exameow-sourcefile') || ''
  }

  function saveCachedQuestions() {
    try {
      localStorage.setItem('exameow-questions', JSON.stringify(questions.value))
      localStorage.setItem('exameow-sourcefile', sourceFileName.value)
    } catch {}
  }

  const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'])

  function extractFileName(inputs: (string | File)[]): string {
    if (inputs.length === 0) return ''
    const names = inputs.map(i => {
      const raw = i instanceof File ? i.name : i.replace(/\\/g, '/').split('/').pop() || i
      const dot = raw.lastIndexOf('.')
      if (dot > 0) {
        const ext = raw.substring(dot + 1).toLowerCase()
        if (IMAGE_EXTENSIONS.has(ext)) return null
      }
      return dot > 0 ? raw.substring(0, dot) : raw
    }).filter((n): n is string => n !== null)
    return names.join('、')
  }

  function fileNameFromInput(input: string | File): string {
    const raw = input instanceof File ? input.name : input.replace(/\\/g, '/').split('/').pop() || input
    const dot = raw.lastIndexOf('.')
    return dot > 0 ? raw.substring(0, dot) : raw
  }

  function uint8ToBase64(bytes: Uint8Array): string {
    const CHUNK = 4096
    const parts: string[] = []
    for (let i = 0; i < bytes.length; i += CHUNK) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]))
    }
    return btoa(parts.join(''))
  }

  async function parseInputs(
    inputs: (string | File)[],
    isTauriEnv: boolean,
    i18n: ReturnType<typeof useI18nStore>,
    onProgress: (p: ParseProgressReport) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    // 1. 预扫描：统计每个文件需要解析的单元数
    type FileEntry = { input: string | File; total: number; isImage: boolean; isPdf: boolean }
    const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
    const entries: FileEntry[] = []

    function getImageMimeType(ext: string): string {
      switch (ext) {
        case 'png': return 'image/png'
        case 'jpg':
        case 'jpeg': return 'image/jpeg'
        case 'webp': return 'image/webp'
        case 'gif': return 'image/gif'
        case 'bmp': return 'image/bmp'
        default: return 'image/' + ext
      }
    }

    for (const input of inputs) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')

      if (typeof input === 'string') {
        const rawName = input.replace(/\\/g, '/').split('/').pop() || input
        const ext = rawName.includes('.') ? rawName.split('.').pop()!.toLowerCase() : 'txt'
        if (IMAGE_EXTENSIONS.includes(ext)) {
          try {
            const { readFile } = await import('@tauri-apps/plugin-fs')
            const buf = await readFile(input)
            const file = new File([new Uint8Array(buf)], rawName, { type: getImageMimeType(ext) })
            entries.push({ input: file, total: 1, isImage: true, isPdf: false })
          } catch (e) {
            console.warn('[exam] Pre-scan failed for image', input, ':', e)
            throw new Error(i18n.t('genErrorReadFile', { file: rawName }))
          }
        } else if (ext === 'pdf') {
          try {
            const { readFile } = await import('@tauri-apps/plugin-fs')
            const buf = await readFile(input)
            const file = new File([new Uint8Array(buf)], rawName, { type: 'application/pdf' })
            try {
              const { getPdfPageCount } = await import('@/utils/pdfParser')
              const pageCount = await getPdfPageCount(file, signal)
              entries.push({ input: file, total: pageCount, isImage: false, isPdf: true })
            } catch (e) {
              console.warn('[exam] Pre-scan failed for PDF page count', input, ':', e)
              throw new Error(i18n.t('genErrorReadFile', { file: rawName }))
            }
          } catch (e) {
            console.warn('[exam] Pre-scan failed for PDF', input, ':', e)
            throw new Error(i18n.t('genErrorReadFile', { file: rawName }))
          }
        } else {
          entries.push({ input, total: 1, isImage: false, isPdf: false })
        }
      } else {
        const file = input
        if (file.type.startsWith('image/')) {
          entries.push({ input: file, total: 1, isImage: true, isPdf: false })
        } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          try {
            const { getPdfPageCount } = await import('@/utils/pdfParser')
            const pageCount = await getPdfPageCount(file, signal)
            entries.push({ input: file, total: pageCount, isImage: false, isPdf: true })
          } catch (e) {
            console.warn('[exam] Pre-scan failed for PDF page count', file.name, ':', e)
            throw new Error(i18n.t('genErrorReadFile', { file: file.name }))
          }
        } else {
          entries.push({ input: file, total: 1, isImage: false, isPdf: false })
        }
      }
    }
    const total = entries.reduce((sum, it) => sum + it.total, 0)

    // 2. 串行解析
    let current = 0
    let images = 0
    let pdfPages = 0
    let files = 0
    let fullText = ''

    const { parseBrowserFileWithProgress } = await import('@/utils/fileParser')

    for (const entry of entries) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')

      const start = current
      try {
        let text = ''

        if (typeof entry.input === 'string') {
          // Tauri 文件路径：走后端解析
          const { tauriApi } = await import('@/api/bridge')
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const rawName = entry.input.replace(/\\/g, '/').split('/').pop() || entry.input
          const ext = rawName.includes('.') ? rawName.split('.').pop()!.toLowerCase() : 'txt'
          const buf = await readFile(entry.input)
          if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
          const base64 = uint8ToBase64(new Uint8Array(buf))
          text = await tauriApi.parseFileBytes(base64, ext)
          if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
          current += 1
          files += 1
        } else if (entry.input instanceof File) {
          const file = entry.input
          const isTauriBackend = isTauriEnv && !entry.isImage && !entry.isPdf
          if (isTauriBackend) {
            const { tauriApi } = await import('@/api/bridge')
            const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'txt'
            const buf = await file.arrayBuffer()
            const base64 = uint8ToBase64(new Uint8Array(buf))
            text = await tauriApi.parseFileBytes(base64, ext)
            current += 1
            files += 1
          } else {
            const startPdfPages = pdfPages
            text = await parseBrowserFileWithProgress(
              file,
              (p) => {
                current = Math.min(start + entry.total, start + p.current)
                images += p.images
                pdfPages = Math.min(startPdfPages + entry.total, startPdfPages + p.pdfPages)
                onProgress({ current, total, images, pdfPages, files, message: '' })
              },
              signal,
            )
            files += 1
          }
        }

        if (text) {
          const label = fileNameFromInput(entry.input)
          fullText += (fullText ? `\n\n---\n\n## ${label}\n` : `## ${label}\n`) + text
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          throw e
        }
        console.warn(`[exam] Parse failed for ${fileNameFromInput(entry.input)}:`, e)
        const msg = `[exam] ${fileNameFromInput(entry.input)} 解析失败: ${e?.name ?? ''} ${e?.message ?? String(e)} ${e?.stack ?? ''}`
        import('@tauri-apps/api/core')
          .then(({ invoke }) => invoke('frontend_log', { msg }).catch(() => {}))
          .catch(() => {})
        current = start + entry.total
        files += 1
      }

      onProgress({ current, total, images, pdfPages, files, message: '' })
    }

    return fullText
  }

  async function generate(inputs: (string | File)[]) {
    const configStore = useConfigStore()
    const i18n = useI18nStore()
    generating.value = true
    progress.value = { current: 0, total: 0, message: i18n.t('genProgressParsing'), phase: 'parsing' }
    questions.value = []
    summary.value = null
    sourceFileName.value = extractFileName(inputs)
    abortController = new AbortController()
    const signal = abortController.signal

    try {
      error.value = null
      const config = configStore.getConfig()
      const baseParams = getParams()
      const requestedDifficulty = baseParams.difficulty

      baseParams.custom_prompt = extraPrompt.value?.trim() || undefined
      if (typeof config.max_tokens === 'number') baseParams.max_tokens = config.max_tokens

      // Parse all files and concatenate text
      let fullText = await parseInputs(
        inputs,
        isTauri(),
        i18n,
        (p) => {
          const message = p.total > 0
            ? i18n.t('genProgressParsingPdfPage', {
                current: p.current,
                total: p.total,
                images: p.images,
              })
            : i18n.t('genProgressParsing')
          progress.value = { current: p.current, total: p.total, phase: 'parsing', message }
        },
        signal,
      )

      baseParams.text = fullText
      baseParams.source_name = sourceFileName.value
      if (!fullText.trim()) {
        throw new Error(i18n.t('genErrorNoText'))
      }
      const batches = buildBatches(baseParams)
      const firstInput = inputs[0]!
      if (import.meta.env.DEV) {
        console.log('[Exameow] fileRef debug:', { isTauri: isTauri(), firstInputType: typeof firstInput, firstInputVal: firstInput })
      }
      const fileRef = isTauri()
        ? (typeof firstInput === 'string' ? firstInput : (firstInput as File).name || 'file')
        : (firstInput as File)

      progress.value = { current: 0, total: batches.length, phase: 'generating', message: i18n.t('genProgressGeneratingBatch', { current: 1, total: batches.length }) }

      const useDirectAI = isCloudflare() && configStore.aiProvider === 'custom'

      const requestedTotal = batches.reduce((s, b) => s + (b.count || 0), 0)
      const sumCounts = (tc: Record<string, number> | undefined): number =>
        Object.values(tc || {}).reduce((s, c) => s + c, 0)

      const callOnce = async (batch: ExamParams): Promise<Question[]> => {
        const exec = async () => {
          if (useDirectAI && batch.text) {
            const { callCustomAI } = await import('@/utils/aiClient')
            const q = await callCustomAI(batch.text, batch, config, signal)
            return tagQuestions(q, batch.text, sourceFileName.value, subject.value, topicFilter.value, requestedDifficulty, batch.auto_chapter)
          }
          const result = await api.generateExam(fileRef, batch, config, signal)
          return tagQuestions(result.questions, batch.text ?? '', sourceFileName.value, subject.value, topicFilter.value, requestedDifficulty, batch.auto_chapter)
        }
        try {
          return await exec()
        } catch (e: any) {
          if (e?.name === 'AbortError' || signal.aborted) throw e
          progress.value = {
            ...progress.value,
            message: i18n.t('genRetrying', { current: batch.batch_index ?? 0, total: batch.batch_total ?? 1 }),
          }
          return await exec()
        }
      }

      const tryGenerate = async (batch: ExamParams, depth = 0): Promise<number> => {
        const expected = sumCounts(batch.type_counts)
        if (expected <= 0) return 0
        try {
          const qs = await callOnce(batch)
          questions.value.push(...qs)
          return qs.length
        } catch (e: any) {
          if (e?.name === 'AbortError' || signal.aborted) throw e
          const textLen = batch.text?.length ?? 0
          if (expected === 1 && textLen >= 1500 && depth < 3) {
            const [textA, textB] = splitTextChunk(batch.text!)
            if (textA.trim()) {
              const produced = await tryGenerate({ ...batch, text: textA }, depth + 1)
              if (produced > 0) return produced
            }
            if (textB.trim()) {
              return await tryGenerate({ ...batch, text: textB }, depth + 1)
            }
            return 0
          }
          if (depth >= 3 || expected <= 1 || textLen < 1500) {
            console.warn(`[Exameow] give up batch ${batch.batch_index}: ${e}`)
            return 0
          }
          const [textA, textB] = splitTextChunk(batch.text!)
          const entries = Object.entries(batch.type_counts || {}).filter(([, c]) => c > 0)
          const countsA: Record<string, number> = {}
          const countsB: Record<string, number> = {}
          let accA = 0
          for (const [type, cnt] of entries) {
            const half = Math.floor(cnt / 2)
            const other = cnt - half
            const a = accA % 2 === 0 ? half : other
            const b = cnt - a
            if (a > 0) countsA[type] = a
            if (b > 0) countsB[type] = b
            accA += a
          }
          let produced = 0
          if (sumCounts(countsA) > 0 && textA.trim()) {
            produced += await tryGenerate({ ...batch, text: textA, type_counts: countsA, count: sumCounts(countsA) }, depth + 1)
          }
          if (sumCounts(countsB) > 0 && textB.trim()) {
            produced += await tryGenerate({ ...batch, text: textB, type_counts: countsB, count: sumCounts(countsB) }, depth + 1)
          }
          return produced
        }
      }

      const uniqueTexts = new Set(batches.map(b => b.text)).size
      const chunkSizes = [...new Set(batches.map(b => b.text || ''))].map(t => t.length)
      if (import.meta.env.DEV) {
        console.log(
          `[Exameow] ${batches.length} batches, ${uniqueTexts} unique text chunks, sizes: ${JSON.stringify(chunkSizes)}`,
        )
      }

      let generated = 0
      for (let i = 0; i < batches.length; i++) {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
        const batch = batches[i]!
        if (batch.auto_chapter) {
          batch.chapter_names = [...new Set(questions.value.flatMap(q => q.chapter ? [q.chapter] : []))]
        }
        progress.value = { current: i, total: batches.length, phase: 'generating', message: i18n.t('genProgressGeneratingBatch', { current: i + 1, total: batches.length }) }
        try {
          generated += await tryGenerate(batch)
        } catch (e: any) {
          if (e?.name === 'AbortError' || signal.aborted) throw e
          console.warn(`[Exameow] batch ${batch.batch_index} unexpected failure:`, e)
        }
      }
      const skipped = Math.max(0, requestedTotal - generated)
      summary.value = skipped > 0 ? { requested: requestedTotal, generated, skipped } : null

      progress.value = { current: batches.length, total: batches.length, phase: 'complete', message: i18n.t('genProgressComplete') }
      saveCachedQuestions()

      const practiceStore = usePracticeStore()
      practiceStore.saveGeneratedAsBank(questions.value, sourceFileName.value)
    } catch (e: any) {
      if (e?.name === 'AbortError' || signal.aborted) {
        progress.value = { ...progress.value, phase: 'cancelled', message: i18n.t('genProgressCancelled') }
      } else {
        error.value = e?.message || e?.toString() || 'Unknown error'
        throw e
      }
    } finally {
      generating.value = false
      abortController = null
    }
  }

  function cancelGeneration() {
    if (abortController) {
      abortController.abort()
    }
  }

  function reset() {
    questions.value = []
    sourceFileName.value = ''
    subject.value = ''
    extraPrompt.value = ''
    summary.value = null
    try { localStorage.removeItem('exameow-questions'); localStorage.removeItem('exameow-sourcefile') } catch {}
  }

  return {
    questionTypes, typeCounts, totalCount,
    difficulty, language, topicFilter, autoChapter, subject, questions, generating, generated,
    sourceFileName, error, progress, getParams, generate, cancelGeneration, reset,
    extraPrompt, summary,
  }
})
