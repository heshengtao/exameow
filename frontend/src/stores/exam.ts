import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import type { ExamParams, Question, QuestionType, Difficulty } from '@exameow/shared'
import { api } from '@/api'
import { useConfigStore } from './config'
import { usePracticeStore } from './practice'
import { useI18nStore } from './i18n'
import type { ParseProgressReport } from '@/utils/fileParser'
import { isTauri, isCloudflare } from '@/utils/platform'

const ALL_TYPES: QuestionType[] = [
  'single_choice' as QuestionType,
  'multi_choice' as QuestionType,
  'true_false' as QuestionType,
  'fill_blank' as QuestionType,
  'short_answer' as QuestionType,
]

function extractBatchFileLabel(text: string): string {
  const firstLine = text.trimStart().split('\n')[0] ?? ''
  if (firstLine.startsWith('## ')) return firstLine.slice(3).trim()
  return ''
}

function tagQuestions(qs: Question[], batchText: string, sourceFileName: string, subject: string, requestedDifficulty: Difficulty): Question[] {
  const chapter = extractBatchFileLabel(batchText) || sourceFileName.trim() || undefined
  const subj = subject.trim() || undefined
  return qs.map(q => ({ ...q, subject: subj, chapter, difficulty: requestedDifficulty }))
}

export const useExamStore = defineStore('exam', () => {
  const questionTypes = ref<QuestionType[]>([])
  const typeCounts = reactive<Record<string, number>>(
    Object.fromEntries(ALL_TYPES.map((t) => [t, 0])),
  )
  const difficulty = ref<Difficulty>('medium' as Difficulty)
  const language = ref('zh-CN')
  const topicFilter = ref('')
  const subject = ref('')
  const questions = ref<Question[]>(loadCachedQuestions())
  const sourceFileName = ref(loadCachedSourceFile())
  const generating = ref(false)
  const error = ref<string | null>(null)
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
    }
  }

  type ProgressPhase = 'parsing' | 'generating' | 'complete' | 'cancelled'

  const MAX_CHARS_PER_CHUNK = 32000
  const MAX_Q_PER_CHUNK = 15
  const TABLE_SEP_RE = /^\|(\s*:?-{3,}:?\s*\|)+$/

  function chunkTextBySize(text: string, chunkCount: number): string[] {
    let paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 10)
    let lineMode = false
    if (paragraphs.some(p => p.length > MAX_CHARS_PER_CHUNK) || paragraphs.length < chunkCount) {
      paragraphs = text.split(/\n+/).filter((p) => {
        const t = p.trim()
        return t.length > 10 || (t.startsWith('|') && t.length > 2)
      })
      lineMode = true
    }
    if (paragraphs.length === 0 || chunkCount <= 1) return [text]

    // For each paragraph, the table header context (### heading + header row + separator)
    // to prepend if a new chunk starts on that paragraph. Null when not inside a table.
    let heading = ''
    let tableHeader: string | null = null
    const contexts: (string | null)[] = paragraphs.map((p, i) => {
      const t = p.trim()
      if (t.startsWith('#')) {
        heading = t
        tableHeader = null
        return null
      }
      if (t.startsWith('|')) {
        if (TABLE_SEP_RE.test(t)) return null
        if (tableHeader === null) {
          const next = paragraphs[i + 1]?.trim() ?? ''
          if (TABLE_SEP_RE.test(next)) {
            tableHeader = (heading ? heading + '\n\n' : '') + t + '\n' + next
          }
          return null
        }
        return tableHeader
      }
      tableHeader = null
      return null
    })

    const targetSize = Math.ceil(text.length / chunkCount)
    const chunks: string[] = []
    let current = ''
    const sep = lineMode ? '\n' : '\n\n'

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i]!
      if (current.length + para.length > targetSize && current.length > 0 && chunks.length < chunkCount - 1) {
        chunks.push(current.trim())
        current = contexts[i] ? contexts[i] + '\n' + para : para
      } else {
        current += (current ? sep : '') + para
      }
    }
    if (current.trim()) chunks.push(current.trim())
    if (chunks.length === 0) return [text]
    return chunks
  }

  function buildBatches(baseParams: ExamParams): ExamParams[] {
    const typeEntries = Object.entries(baseParams.type_counts || {}).filter(([, count]) => count > 0)
    if (typeEntries.length === 0) return [{ ...baseParams }]

    const totalQ = typeEntries.reduce((s, [, c]) => s + c, 0)
    const fullText = baseParams.text || ''

    const chunkCount = Math.max(1, Math.ceil(totalQ / MAX_Q_PER_CHUNK))

    if (chunkCount <= 1) return [{ ...baseParams }]

    const fileSections = splitByFileSections(fullText)
    console.log('[Exameow] File sections:', fileSections.length, '| sizes:', fileSections.map(s => s.label + ':' + s.text.length).join(', '))
    const textChunks = chunkByFileProportion(fileSections, chunkCount, fullText)
    console.log('[Exameow] Chunks (should = chunkCount =', chunkCount, '):', textChunks.length, '| labels:', textChunks.map(c => c.substring(0, 50).replace(/\n/g, '\\n')).join(' | '))
    const remaining: Record<string, number> = {}
    for (const [k, v] of typeEntries) remaining[k] = v

    const chunks = textChunks
    const batches: ExamParams[] = []
    for (let i = 0; i < chunks.length && Object.values(remaining).some(c => c > 0); i++) {
      const chunk = chunks[i]!
      const counts: Record<string, number> = {}
      let batchTotal = 0

      let typeRound = 0
      while (batchTotal < MAX_Q_PER_CHUNK) {
        const active = typeEntries.filter(([q]) => (remaining[q] ?? 0) > 0)
        if (active.length === 0) break
        const [qtype] = active[typeRound % active.length]!
        counts[qtype] = (counts[qtype] || 0) + 1
        batchTotal++
        remaining[qtype]!--
        typeRound++
      }

      if (batchTotal > 0) {
        batches.push({
          ...baseParams,
          count: batchTotal,
          type_counts: counts,
          text: chunk,
          batch_index: batches.length + 1,
          batch_total: 0,
        } as ExamParams)
      }
    }

    const totalBatches = batches.length
    for (const b of batches) {
      b.batch_total = totalBatches
    }

    return batches
  }

  // File sections are separated by "\n\n---\n\n## "
  // Returns array of { text, label } for each file section.
  // If no file markers found, treat entire text as a single section.
  function splitByFileSections(text: string): { text: string; label: string }[] {
    const parts = text.split(/\n\n---\n\n(?=## )/)
    if (parts.length <= 1) return [{ text, label: '' }]
    return parts.map((p, i) => {
      // Extract the label from "## filename\n..."
      const nl = p.indexOf('\n')
      const label = nl > 0 ? p.substring(3, nl).trim() : `File ${i + 1}`
      const content = nl > 0 ? p.substring(nl + 1) : p
      return { text: content, label }
    })
  }

  // Allocate `chunkCount` chunks proportionally across file sections by their text length.
  function chunkByFileProportion(sections: { text: string; label: string }[], chunkCount: number, fallbackText: string): string[] {
    const sectionLengths = sections.map(s => s.text.length)
    const totalLen = sectionLengths.reduce((s, l) => s + l, 0)

    // Allocate chunks proportionally, ensuring at least 1 chunk per section if possible
    const allocated: number[] = sectionLengths.map((len) => Math.max(1, Math.round(chunkCount * len / totalLen)))

    // Adjust to match chunkCount exactly
    let sum = allocated.reduce((s, n) => s + n, 0)
    while (sum > chunkCount) {
      const maxIdx = allocated.indexOf(Math.max(...allocated))
      allocated[maxIdx]!--
      sum--
    }
    while (sum < chunkCount) {
      const minIdx = allocated.indexOf(Math.min(...allocated))
      allocated[minIdx]!++
      sum++
    }

    // Chunk each section using chunkTextBySize, prefix with label
    const result: string[] = []
    for (let i = 0; i < sections.length; i++) {
      const sectionChunks = chunkTextBySize(sections[i]!.text, Math.max(1, allocated[i]!))
      for (const chunk of sectionChunks) {
        const prefix = sections[i]!.label ? `## ${sections[i]!.label}\n` : ''
        result.push(prefix + chunk)
      }
    }

    // If we have fewer chunks than requested, split the largest chunk
    while (result.length < chunkCount) {
      let maxIdx = 0
      for (let i = 1; i < result.length; i++) {
        if (result[i]!.length > result[maxIdx]!.length) maxIdx = i
      }
      const [a, b] = splitTextChunk(result[maxIdx]!)
      result.splice(maxIdx, 1, a, b)
    }
    // If we have too many, merge the two shortest adjacent chunks
    while (result.length > chunkCount) {
      let minIdx = 0
      let minLen = result[0]!.length + (result[1]?.length ?? Infinity)
      for (let i = 1; i < result.length - 1; i++) {
        const combined = result[i]!.length + result[i + 1]!.length
        if (combined < minLen) { minLen = combined; minIdx = i }
      }
      result.splice(minIdx, 2, result[minIdx]! + '\n\n' + result[minIdx + 1]!)
    }
    if (result.length === 0) return [fallbackText]
    return result
  }

  function splitTextChunk(chunk: string): [string, string] {
    // Preserve "## label\n" header on both halves
    let header = ''
    let body = chunk
    if (chunk.startsWith('## ')) {
      const nl = chunk.indexOf('\n')
      if (nl > 0) {
        header = chunk.substring(0, nl + 1)
        body = chunk.substring(nl + 1)
      }
    }
    // Preserve a leading markdown table header (row + separator) on both halves
    let tableHeader = ''
    const lines = body.split('\n')
    if (lines.length > 2 && lines[0]!.trim().startsWith('|') && TABLE_SEP_RE.test(lines[1]!.trim() ?? '')) {
      tableHeader = lines[0]! + '\n' + lines[1]! + '\n'
      body = lines.slice(2).join('\n')
    }
    const mid = Math.floor(body.length / 2)
    const nl = body.indexOf('\n', mid)
    const split = nl > 0 && nl < body.length - 1 ? nl + 1 : mid
    return [
      header + tableHeader + body.substring(0, split).trim(),
      header + tableHeader + body.substring(split).trim(),
    ]
  }

  function loadCachedQuestions(): Question[] {
    try {
      const cached = localStorage.getItem('exameow-questions')
      if (cached) return JSON.parse(cached)
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
    sourceFileName.value = extractFileName(inputs)
    abortController = new AbortController()
    const signal = abortController.signal

    try {
      error.value = null
      const config = configStore.getConfig()
      const baseParams = getParams()
      const requestedDifficulty = baseParams.difficulty

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
      console.log('[Exameow] fileRef debug:', { isTauri: isTauri(), firstInputType: typeof firstInput, firstInputVal: firstInput })
      const fileRef = isTauri()
        ? (typeof firstInput === 'string' ? firstInput : (firstInput as File).name || 'file')
        : (firstInput as File)

      progress.value = { current: 0, total: batches.length, phase: 'generating', message: i18n.t('genProgressGeneratingBatch', { current: 1, total: batches.length }) }

      const useDirectAI = isCloudflare() && configStore.aiProvider === 'custom'

      const uniqueTexts = new Set(batches.map(b => b.text)).size
      const chunkSizes = [...new Set(batches.map(b => b.text || ''))].map(t => t.length)
      console.log(
        `[Exameow] ${batches.length} batches, ${uniqueTexts} unique text chunks, sizes: ${JSON.stringify(chunkSizes)}`,
      )

      for (let i = 0; i < batches.length; i++) {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
        progress.value = { current: i, total: batches.length, phase: 'generating', message: i18n.t('genProgressGeneratingBatch', { current: i + 1, total: batches.length }) }
        const batch = batches[i]
        if (!batch) continue

        const textLen = (batch.text || '').length
        const textPreview = (batch.text || '').slice(0, 80).replace(/\n/g, '\\n')
        console.log(
          `[Exameow] Batch ${batch.batch_index}/${batch.batch_total}: ` +
          `${JSON.stringify(batch.type_counts)} | ${textLen} chars | "${textPreview}..."`,
        )

        if (useDirectAI && batch.text) {
          const { callCustomAI } = await import('@/utils/aiClient')
          const questions_ = await callCustomAI(batch.text, batch, config, signal)
          questions.value.push(...tagQuestions(questions_, batch.text, sourceFileName.value, subject.value, requestedDifficulty))
        } else {
          const result = await api.generateExam(fileRef, batch, config, signal)
          questions.value.push(...tagQuestions(result.questions, batch.text ?? '', sourceFileName.value, subject.value, requestedDifficulty))
        }
        console.log(`[Exameow] Batch ${batch.batch_index} done: ${questions.value.length} questions total`)
      }

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
    try { localStorage.removeItem('exameow-questions'); localStorage.removeItem('exameow-sourcefile') } catch {}
  }

  return {
    questionTypes, typeCounts, totalCount,
    difficulty, language, topicFilter, subject, questions, generating, generated,
    sourceFileName, error, progress, getParams, generate, cancelGeneration, reset,
  }
})
