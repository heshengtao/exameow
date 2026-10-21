import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QuestionBank, PracticeSession, PracticeMode, MockExamConfig, Question, PracticeFilter } from '@exameow/shared'
import { analyzeCSV, analyzeExcel, parseWithMapping } from '@/utils/importParser'
import type { ColumnMapping, ImportAnalysis, StoredImportImage } from '@/utils/importParser'
import { usePracticeHistoryStore } from '@/stores/practiceHistory'
import { matchPracticeFilter, reconcileMockConfig } from '@/utils/practiceFilter'
import { isMediaAvailable, putImage, pruneUnreferenced } from '@/utils/mediaStore'
import { supportsLocalMedia } from '@/utils/capabilities'
import { normalizeBanks, normalizeSession } from '@/utils/dataCompat'

const STORAGE_KEY = 'exameow-banks'
const SESSION_KEY = 'exameow-practice-session'
const PROGRESS_KEY = 'exameow-practice-progress'

export interface QuestionProgress {
  userAnswer: string | null
  userAnswerText?: string
  isCorrect: boolean | null
  submitted: boolean
  updatedAt: number
}

type BankProgress = Record<string, QuestionProgress>
type ProgressMap = Record<string, BankProgress>

function loadProgressMap(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveProgressMap(map: ProgressMap) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map))
  } catch {}
}

/** Seed the per-question progress from a pre-existing session (upgrade path). */
function migrateSessionProgress(current: PracticeSession | null): ProgressMap {
  const map = loadProgressMap()
  if (!current) return map
  const bank = map[current.bankId] ?? (map[current.bankId] = {})
  for (const item of current.questions) {
    const id = originalQuestionId(item.question.id)
    if (bank[id]) continue
    if (!item.submitted && item.userAnswer === null) continue
    bank[id] = {
      userAnswer: item.userAnswer,
      userAnswerText: answerTextFor(item.question, item.userAnswer),
      isCorrect: item.isCorrect,
      submitted: item.submitted,
      updatedAt: Date.now(),
    }
  }
  saveProgressMap(map)
  return map
}

function originalQuestionId(id: string): string {
  return id.replace(/-s\d+$/, '')
}

function loadBanks(): QuestionBank[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeBanks(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function saveBanks(banks: QuestionBank[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(banks))
  } catch {}
}

function loadSession(): PracticeSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? normalizeSession(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function saveSession(session: PracticeSession | null) {
  try {
    if (session && session.mode === 'wrong') return
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch {}
}

function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i]!, a[j]!] = [a[j]!, a[i]!]
  }
  return a
}

function answerTextFor(question: Question, answer: string | null): string | undefined {
  if (!answer || (question.type !== 'single_choice' && question.type !== 'multi_choice')) return undefined
  const letters = answer.toUpperCase().replace(/[^A-H]/g, '').split('')
  const parts = letters
    .map(letter => question.options[letter.charCodeAt(0) - 65])
    .filter((option): option is string => !!option)
  return parts.length ? parts.join('\u0001') : undefined
}

function answerFromText(question: Question, text: string | undefined): string | null {
  if (!text) return null
  const letters = text
    .split('\u0001')
    .map(option => question.options.indexOf(option))
    .filter(index => index >= 0)
    .map(index => String.fromCharCode(65 + index))
  return letters.length ? letters.sort().join('') : null
}

function remapAnswerLetters(answer: string | null, mapping: Record<string, string>): string | null {
  if (!answer) return null
  const letters = answer.toUpperCase().split('').filter(ch => /[A-H]/.test(ch))
  if (!letters.length) return answer
  return letters.map(ch => mapping[ch] ?? ch).sort().join('')
}

function shuffleQuestionOptions(
  question: Question,
  userAnswer: string | null,
): { question: Question; userAnswer: string | null } {
  if (question.type !== 'single_choice' && question.type !== 'multi_choice') {
    return { question, userAnswer }
  }
  const indices = question.options.map((_, i) => i)
  const shuffled = shuffleArray(indices)
  const mapping: Record<string, string> = {}
  shuffled.forEach((oldIndex, newIndex) => {
    mapping[String.fromCharCode(65 + oldIndex)] = String.fromCharCode(65 + newIndex)
  })
  return {
    question: {
      ...question,
      options: shuffled.map(i => question.options[i] ?? ''),
      answer: remapAnswerLetters(question.answer, mapping) ?? question.answer,
    },
    userAnswer: remapAnswerLetters(userAnswer, mapping),
  }
}

function applyPracticeFilter(questions: Question[], filter?: PracticeFilter): Question[] {
  if (!filter) return questions
  const subjects = filter.subjects?.filter(Boolean)
  const chapters = filter.chapters?.filter(Boolean)
  const difficulties = filter.difficulties?.filter(Boolean)
  const types = filter.types?.filter(Boolean)
  if ((filter.difficulties !== undefined && difficulties?.length === 0)
    || (filter.types !== undefined && types?.length === 0)) return []
  if (!subjects?.length && !chapters?.length && !filter.includeUnchaptered && !difficulties?.length && !types?.length) return questions
  return questions.filter(q => matchPracticeFilter(q, filter))
}

function generateMockQuestions(bank: QuestionBank, config: MockExamConfig): Question[] {
  const selected: Question[] = []
  for (const [qtype, count] of Object.entries(config.typeCounts)) {
    if (count <= 0) continue
    const pool = bank.questions.filter(q => q.type === qtype)
    const shuffled = shuffleArray(pool)
    selected.push(...shuffled.slice(0, count))
  }
  return shuffleArray(selected)
}

export const usePracticeStore = defineStore('practice', () => {
  const banks = ref<QuestionBank[]>(loadBanks())
  const session = ref<PracticeSession | null>(loadSession())
  const progressMap = ref<ProgressMap>(migrateSessionProgress(session.value))
  const importing = ref(false)
  const importPreview = ref<Question[] | null>(null)
  const importFileName = ref('')
  const importAnalysis = ref<ImportAnalysis | null>(null)
  const importSource = ref('csv')
  const importImageIds = ref<Map<number, StoredImportImage[]> | null>(null)
  const importImagesStored = ref(0)
  const importImagesDropped = ref(0)

  const hasSession = computed(() => session.value !== null)
  const currentQuestion = computed(() => {
    if (!session.value) return null
    return session.value.questions[session.value.currentIndex] ?? null
  })
  const progress = computed(() => {
    if (!session.value) return { current: 0, total: 0 }
    return { current: session.value.currentIndex + 1, total: session.value.questions.length }
  })
  const isLastQuestion = computed(() => {
    if (!session.value) return false
    return session.value.currentIndex >= session.value.questions.length - 1
  })
  const isFirstQuestion = computed(() => {
    if (!session.value) return false
    return session.value.currentIndex === 0
  })
  const answeredCount = computed(() => {
    if (!session.value) return 0
    return session.value.questions.filter(q => q.userAnswer !== null).length
  })
  const hasUnanswered = computed(() => {
    if (!session.value) return false
    return session.value.questions.some(q => q.userAnswer === null)
  })
  const score = computed(() => {
    if (!session.value) return 0
    const autoGraded = session.value.questions.filter(q => q.isCorrect !== null && q.isCorrect)
    return autoGraded.length
  })
  const autoGradedCount = computed(() => {
    if (!session.value) return 0
    return session.value.questions.filter(q => q.isCorrect !== null).length
  })

  function addBank(bank: QuestionBank) {
    banks.value.push(bank)
    saveBanks(banks.value)
  }

  function removeBank(id: string) {
    banks.value = banks.value.filter(b => b.id !== id)
    saveBanks(banks.value)
    clearBankProgress(id)
    if (session.value?.bankId === id) {
      session.value = null
      saveSession(null)
    }
    const referenced = new Set<string>()
    for (const bank of banks.value) {
      for (const question of bank.questions) {
        for (const item of question.media ?? []) referenced.add(item.id)
      }
    }
    for (const item of session.value?.questions ?? []) {
      for (const media of item.question.media ?? []) referenced.add(media.id)
    }
    void pruneUnreferenced(referenced).catch(() => {})
  }

  function getBank(id: string): QuestionBank | undefined {
    return banks.value.find(b => b.id === id)
  }

  function updateBank(id: string, updates: Partial<QuestionBank>): boolean {
    const index = banks.value.findIndex(b => b.id === id)
    if (index < 0) return false
    banks.value[index] = { ...banks.value[index]!, ...updates }
    saveBanks(banks.value)
    return true
  }

  function saveGeneratedAsBank(questions: Question[], sourceName: string) {
    if (questions.length === 0) return
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const bank: QuestionBank = {
      id: generateId(),
      name: `AI 出题 - ${dateStr} (${sourceName || '题库'})`,
      questions,
      createdAt: today.getTime(),
      source: 'ai-generated',
    }
    addBank(bank)
  }

  function getQuestionProgress(bankId: string, questionId: string): QuestionProgress | undefined {
    return progressMap.value[bankId]?.[originalQuestionId(questionId)]
  }

  function recordQuestionProgress(
    bankId: string,
    question: Question,
    item: { userAnswer: string | null; isCorrect: boolean | null; submitted: boolean },
  ) {
    const id = originalQuestionId(question.id)
    const bank = progressMap.value[bankId] ?? (progressMap.value[bankId] = {})
    bank[id] = {
      ...item,
      userAnswerText: answerTextFor(question, item.userAnswer),
      updatedAt: Date.now(),
    }
    saveProgressMap(progressMap.value)
  }

  function clearBankProgress(bankId: string) {
    if (!progressMap.value[bankId]) return
    delete progressMap.value[bankId]
    saveProgressMap(progressMap.value)
  }

  function getBankCompletedCount(bankId: string, questions: Question[]): number {
    const bank = progressMap.value[bankId]
    if (!bank) return 0
    return questions.filter(q => bank[originalQuestionId(q.id)]?.submitted === true).length
  }

  function startSession(
    bankId: string,
    mode: PracticeMode,
    mockConfig?: MockExamConfig,
    customQuestions?: Question[],
    filter?: PracticeFilter,
    options?: { ignoreProgress?: boolean },
  ): boolean {
    const bank = getBank(bankId)
    if (!bank) return false

    const baseQuestions = customQuestions ?? applyPracticeFilter(bank.questions, filter)
    const normalizedMockConfig = mockConfig
      ? reconcileMockConfig(mockConfig, baseQuestions)
      : undefined
    const restoreProgress = !options?.ignoreProgress && (mode === 'sequential' || mode === 'random')
    const isDone = (q: Question) => restoreProgress
      && progressMap.value[bankId]?.[originalQuestionId(q.id)]?.submitted === true

    let questions: Question[]
    if (customQuestions) {
      questions = customQuestions
    } else if (mode === 'mock' && normalizedMockConfig) {
      questions = generateMockQuestions({ ...bank, questions: baseQuestions }, normalizedMockConfig)
    } else if (mode === 'sequential') {
      questions = [...baseQuestions]
    } else {
      const unanswered = baseQuestions.filter(q => !isDone(q))
      const answered = baseQuestions.filter(q => isDone(q))
      questions = [...shuffleArray(unanswered), ...shuffleArray(answered)]
    }

    if (questions.length === 0) return false

    const sessionQuestions = questions.map((q, i) => {
      const saved = restoreProgress ? progressMap.value[bankId]?.[originalQuestionId(q.id)] : undefined
      let question: Question = { ...q, id: `${originalQuestionId(q.id)}-s${i}` }
      let userAnswer = saved?.userAnswerText
        ? answerFromText(q, saved.userAnswerText)
        : (saved?.userAnswer ?? null)
      if (mode === 'random') {
        const shuffled = shuffleQuestionOptions(question, userAnswer)
        question = shuffled.question
        userAnswer = shuffled.userAnswer
      }
      return {
        question,
        userAnswer,
        isCorrect: saved?.isCorrect ?? null,
        submitted: saved?.submitted ?? false,
      }
    })

    const firstUnanswered = mode === 'sequential' && !options?.ignoreProgress
      ? sessionQuestions.findIndex(item => !item.submitted)
      : -1

    session.value = {
      bankId,
      mode,
      questions: sessionQuestions,
      currentIndex: firstUnanswered > 0 ? firstUnanswered : 0,
      startedAt: Date.now(),
      finishedAt: null,
      mockConfig: mode === 'mock' ? normalizedMockConfig : undefined,
      filter: mode === 'wrong' ? undefined : filter,
    }
    saveSession(session.value)
    return true
  }

  const currentSubmitted = computed(() => {
    if (!session.value) return false
    const item = session.value.questions[session.value.currentIndex]
    return item ? item.submitted === true : false
  })

  function setAnswer(answer: string | null) {
    if (!session.value) return
    const item = session.value.questions[session.value.currentIndex]
    if (!item) return
    item.userAnswer = answer
    saveSession(session.value)
  }

  function normalizeTF(ans: string): string {
    const t = ans.trim().toUpperCase()
    if (['A', '√', '对', '正确', 'TRUE', 'T', '是', 'YES', 'Y', '1'].some(v => t === v.toUpperCase() || t.includes(v))) return 'TRUE'
    if (['B', '×', '错', '错误', 'FALSE', 'F', '否', 'NO', 'N', '0'].some(v => t === v.toUpperCase() || t.includes(v))) return 'FALSE'
    if (t === 'TRUE' || t.includes('TRUE') || t.includes('对') || t.includes('正确')) return 'TRUE'
    if (t === 'FALSE' || t.includes('FALSE') || t.includes('错') || t.includes('错误')) return 'FALSE'
    return t
  }

  function submitAnswer(answer: string | null): boolean | null {
    if (!session.value) return null
    const item = session.value.questions[session.value.currentIndex]
    if (!item) return null
    item.userAnswer = answer
    item.submitted = true

    const q = item.question
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      const userAns = (answer ?? '').trim().toUpperCase().replace(/[^A-H]/g, '').split('').sort().join('')
      const correctAns = q.answer.trim().toUpperCase().replace(/[^A-H]/g, '').split('').sort().join('')
      item.isCorrect = userAns === correctAns
    } else if (q.type === 'true_false') {
      const userAns = normalizeTF(answer ?? '')
      const correctAns = normalizeTF(q.answer)
      item.isCorrect = userAns === correctAns
    } else if (q.type === 'fill_blank') {
      const userAns = (answer ?? '').trim().toLowerCase()
      const correctAns = q.answer.trim().toLowerCase()
      item.isCorrect = userAns !== '' && userAns === correctAns
    }

    recordQuestionProgress(session.value.bankId, item.question, item)
    usePracticeHistoryStore().record(q.type, item.isCorrect)
    saveSession(session.value)
    return item.isCorrect
  }

  function selfCheck(isCorrect: boolean) {
    if (!session.value) return
    const item = session.value.questions[session.value.currentIndex]
    if (!item) return
    item.isCorrect = isCorrect
    item.submitted = true
    recordQuestionProgress(session.value.bankId, item.question, item)
    usePracticeHistoryStore().record(item.question.type, isCorrect)
    saveSession(session.value)
  }

  function saveAiAnalysis(questionId: string, text: string) {
    const originalId = questionId.replace(/-s\d+$/, '')
    const bank = session.value ? getBank(session.value.bankId) : undefined
    const original = bank?.questions.find(q => q.id === originalId)
    if (original) {
      original.aiAnalysis = text
      saveBanks(banks.value)
    }
    if (session.value) {
      for (const item of session.value.questions) {
        if (item.question.id.replace(/-s\d+$/, '') === originalId) {
          item.question.aiAnalysis = text
        }
      }
      saveSession(session.value)
    }
  }

  function nextQuestion() {
    if (!session.value) return
    if (session.value.currentIndex < session.value.questions.length - 1) {
      session.value.currentIndex++
      saveSession(session.value)
    }
  }

  function prevQuestion() {
    if (!session.value) return
    if (session.value.currentIndex > 0) {
      session.value.currentIndex--
      saveSession(session.value)
    }
  }

  function goToQuestion(index: number) {
    if (!session.value) return
    if (index >= 0 && index < session.value.questions.length) {
      session.value.currentIndex = index
      saveSession(session.value)
    }
  }

  function finishSession() {
    if (!session.value) return
    session.value.finishedAt = Date.now()
    saveSession(session.value)
  }

  function removeCurrentQuestion() {
    if (!session.value) return
    const idx = session.value.currentIndex
    session.value.questions.splice(idx, 1)
    if (session.value.questions.length === 0) {
      session.value.finishedAt = Date.now()
      saveSession(session.value)
      return true
    }
    if (idx >= session.value.questions.length) {
      session.value.currentIndex = session.value.questions.length - 1
    }
    saveSession(session.value)
    return false
  }

  function clearSession() {
    session.value = null
    saveSession(null)
  }

  function getElapsedTime(): number {
    if (!session.value) return 0
    const end = session.value.finishedAt ?? Date.now()
    return Math.floor((end - session.value.startedAt) / 1000)
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m > 0) {
      return `${m}m ${s}s`
    }
    return `${s}s`
  }

  async function storeImportImages(analysis: ImportAnalysis): Promise<Map<number, StoredImportImage[]>> {
    const storedByRow = new Map<number, StoredImportImage[]>()
    const entries = analysis.imagesByRow
    importImagesStored.value = 0
    importImagesDropped.value = 0
    if (!entries || entries.size === 0) return storedByRow

    let stored = 0
    let dropped = 0
    if (!supportsLocalMedia() || !isMediaAvailable()) {
      for (const list of entries.values()) dropped += list.length
      importImagesDropped.value = dropped
      return storedByRow
    }

    const MAX_TOTAL_BYTES = 100 * 1024 * 1024
    let total = 0
    for (const [row, list] of entries) {
      const images: StoredImportImage[] = []
      for (const entry of list) {
        if (total + entry.blob.size > MAX_TOTAL_BYTES) {
          dropped++
          continue
        }
        try {
          const image = await putImage(entry.blob)
          total += entry.blob.size
          images.push({ id: image.id, col: entry.col })
          stored++
        } catch {
          dropped++
        }
      }
      if (images.length > 0) storedByRow.set(row, images)
    }
    importImagesStored.value = stored
    importImagesDropped.value = dropped
    return storedByRow
  }

  function handleAnalysis(
    analysis: ImportAnalysis | null,
    fileName: string,
    source: string,
    imagesByRow?: Map<number, StoredImportImage[]>,
  ): number {
    importFileName.value = fileName
    importSource.value = source
    importImageIds.value = imagesByRow ?? null
    if (!analysis) {
      importAnalysis.value = null
      importPreview.value = []
      return 0
    }
    if (analysis.missing.length > 0) {
      importAnalysis.value = analysis
      importPreview.value = null
      return 0
    }
    importAnalysis.value = null
    const questions = parseWithMapping(analysis, analysis.mapping, source, imagesByRow)
    importPreview.value = questions
    return questions.length
  }

  async function importCSV(text: string, fileName: string): Promise<number> {
    importing.value = true
    try {
      return handleAnalysis(analyzeCSV(text), fileName, 'csv')
    } finally {
      importing.value = false
    }
  }

  async function importExcelFile(buffer: ArrayBuffer, fileName: string): Promise<number> {
    importing.value = true
    try {
      const source = fileName.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'excel'
      const analysis = analyzeExcel(buffer)
      const imageIdsByRow = analysis ? await storeImportImages(analysis) : undefined
      return handleAnalysis(analysis, fileName, source, imageIdsByRow)
    } finally {
      importing.value = false
    }
  }

  function applyImportMapping(mapping: ColumnMapping): number {
    if (!importAnalysis.value) return 0
    const questions = parseWithMapping(
      importAnalysis.value,
      mapping,
      importSource.value,
      importImageIds.value ?? undefined,
    )
    importPreview.value = questions
    importAnalysis.value = null
    return questions.length
  }

  function confirmImport(): string {
    if (!importPreview.value || importPreview.value.length === 0) return ''
    const source = importSource.value === 'csv' ? 'csv-import' as const : 'xlsx-import' as const
    const nameBase = importFileName.value.replace(/\.[^/.]+$/, '')
    const bank: QuestionBank = {
      id: generateId(),
      name: nameBase || `Imported bank ${new Date().toLocaleDateString()}`,
      questions: [...importPreview.value],
      createdAt: Date.now(),
      source,
    }
    addBank(bank)
    importPreview.value = null
    importFileName.value = ''
    importAnalysis.value = null
    importImageIds.value = null
    return bank.id
  }

  function cancelImport() {
    importPreview.value = null
    importFileName.value = ''
    importAnalysis.value = null
    importImageIds.value = null
    importImagesStored.value = 0
    importImagesDropped.value = 0
  }

  return {
    banks,
    session,
    progressMap,
    importing,
    importPreview,
    importFileName,
    hasSession,
    currentQuestion,
    progress,
    isLastQuestion,
    isFirstQuestion,
    answeredCount,
    hasUnanswered,
    currentSubmitted,
    score,
    autoGradedCount,
    addBank,
    removeBank,
    getBank,
    updateBank,
    saveGeneratedAsBank,
    getQuestionProgress,
    recordQuestionProgress,
    clearBankProgress,
    getBankCompletedCount,
    startSession,
    setAnswer,
    submitAnswer,
    selfCheck,
    saveAiAnalysis,
    nextQuestion,
    prevQuestion,
    goToQuestion,
    finishSession,
    removeCurrentQuestion,
    clearSession,
    getElapsedTime,
    formatTime,
    importCSV,
    importExcelFile,
    applyImportMapping,
    importAnalysis,
    importImagesStored,
    importImagesDropped,
    confirmImport,
    cancelImport,
  }
})
