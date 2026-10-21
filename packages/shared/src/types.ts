export enum QuestionType {
  SingleChoice = 'single_choice',
  MultiChoice = 'multi_choice',
  TrueFalse = 'true_false',
  FillBlank = 'fill_blank',
  ShortAnswer = 'short_answer',
}

export enum Difficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
}

export interface QuestionImage {
  /** Content hash (sha256 hex). Image bytes live in IndexedDB under this id. */
  id: string
  mime: 'image/jpeg' | 'image/png'
  width: number
  height: number
}

export interface Question {
  id: string
  type: QuestionType
  stem: string
  options: string[]
  answer: string
  analysis: string
  aiAnalysis?: string
  score?: number
  subject?: string
  chapter?: string
  difficulty?: Difficulty
  /** QuestionImage.id[] — bytes are stored locally, never in localStorage. */
  images?: string[]
}

export interface PracticeFilter {
  subjects?: string[]
  chapters?: string[]
  includeUnchaptered?: boolean
  difficulties?: Difficulty[]
  types?: QuestionType[]
}

export interface QuestionBank {
  id: string
  name: string
  questions: Question[]
  createdAt: number
  source: 'ai-generated' | 'csv-import' | 'xlsx-import'
}

export type PracticeMode = 'sequential' | 'random' | 'mock' | 'wrong'

export type WrongSort = 'count-desc' | 'count-asc' | 'time-desc' | 'time-asc'

export interface WrongQuestionEntry {
  questionId: string
  wrongCount: number
  consecutiveCorrect: number
  lastWrongAt: number
  addedAt: number
}

export interface MockExamConfig {
  typeCounts: Record<string, number>
}

export interface PracticeSession {
  bankId: string
  mode: PracticeMode
  questions: { question: Question; userAnswer: string | null; isCorrect: boolean | null; submitted: boolean }[]
  currentIndex: number
  startedAt: number
  finishedAt: number | null
  mockConfig?: MockExamConfig
  filter?: PracticeFilter
}

export interface ExamParams {
  question_types: QuestionType[]
  count: number
  type_counts?: Record<string, number>
  difficulty: Difficulty
  language: string
  topic_filter?: string
  auto_chapter?: boolean
  chapter_names?: string[]
  text?: string
  batch_index?: number
  batch_total?: number
  source_name?: string
  custom_prompt?: string
  max_tokens?: number
}

export type TokenParameter = 'max_tokens' | 'max_completion_tokens'

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'none'

export type SearchProvider = 'tavily' | 'deepseek' | 'exa' | 'firecrawl' | 'bocha'
export type FetchProvider = 'deepseek' | 'tavily' | 'jina' | 'exa' | 'firecrawl'
export type VendorId = SearchProvider | FetchProvider

export interface SearchConfig {
  enabled: boolean
  provider: SearchProvider
  max_results: number
  fetch_provider: FetchProvider
  max_content_chars: number
  crawl_limit: number
  /** API keys are stored per vendor so switching providers never overwrites another key. */
  keys: Partial<Record<VendorId, string>>
  tools_enabled: boolean
  max_tool_rounds: number
  /** Legacy single key from older versions; read-only migration fallback. */
  api_key?: string
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResponse {
  provider: string
  query: string
  results: WebSearchResult[]
}

export interface FetchedPage {
  url: string
  title: string
  content: string
}

export interface FetchResponse {
  provider: string
  pages: FetchedPage[]
}

export type ChatToolName = 'web_search' | 'web_fetch' | 'web_crawl'

export interface SearchToolConfig {
  provider: SearchProvider
  api_key: string
  max_results: number
}

export interface FetchToolConfig {
  provider: FetchProvider
  api_key: string
  max_chars: number
  crawl_limit: number
}

export interface ChatToolConfig {
  max_rounds: number
  search?: SearchToolConfig
  fetch?: FetchToolConfig
}

export interface ChatToolOptions {
  names: ChatToolName[]
  config: ChatToolConfig
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface AIConfig {
  endpoint: string
  api_key: string
  model: string
  max_tokens?: number
  token_parameter?: TokenParameter
  temperature?: number
  omit_temperature?: boolean
  reasoning_effort?: ReasoningEffort
  extra_prompt?: string
  retries?: number
  timeout_seconds?: number
  search?: SearchConfig
}

export interface AIRequestOptions {
  max_tokens?: number
  token_parameter: TokenParameter
  temperature?: number
  omit_temperature: boolean
  reasoning_effort?: ReasoningEffort
  extra_prompt?: string
  retries: number
  timeout_seconds?: number
}

export interface ModelInfo {
  id: string
}

export interface AnswerResult {
  answer: string
  analysis: string
}

export interface JudgeParams {
  stem: string
  reference_answer: string
  analysis?: string
  user_answer: string
}

export interface JudgeResult {
  correct: boolean
  feedback: string
}

export interface ExplainParams {
  stem: string
  reference_answer: string
  analysis?: string
  search_results?: WebSearchResult[]
}

export interface ExplainResult {
  explanation: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ChatResult {
  reply: string
}

export interface PublicQuestion {
  id: string
  type: QuestionType
  stem: string
  options: string[]
  images?: string[]
}

export interface PublishExamRequest {
  title: string
  questions: Question[]
  startAt: number
  endAt: number
  durationMinutes: number
  /** Self-hosted relay only: image id → base64 payload. Cloudflare ignores this. */
  images?: Record<string, { mime: string; data: string }>
}

export interface PublishExamResponse {
  code: string
  adminToken: string
  manageUrl: string
}

export interface PublishedExamInfo {
  title: string
  questions: PublicQuestion[]
  startAt: number
  endAt: number
  durationMinutes: number
}

export interface SubmitExamRequest {
  name: string
  answers: Record<string, string>
  durationSec: number
}

export interface GradedQuestion {
  question: Question
  userAnswer: string | null
  isCorrect: boolean | null
}

export interface SubmitExamResponse {
  score: number
  totalScore: number
  correctCount: number
  totalCount: number
  pendingCount: number
  graded: GradedQuestion[]
}

export interface ExamResultEntry {
  name: string
  answers: Record<string, string>
  score: number
  totalScore: number
  correctCount: number
  totalCount: number
  pendingCount: number
  durationSec: number
  submittedAt: number
  detail: { questionId: string; isCorrect: boolean | null }[]
}

export interface ExamResultsResponse {
  title: string
  questions: Question[]
  results: ExamResultEntry[]
  endAt: number
}

/** Connection info for the built-in MCP server (desktop/mobile/self-hosted). */
export interface McpInfo {
  enabled: boolean
  running?: boolean
  port?: number
  allow_lan?: boolean
  token: string
  url: string
  ws_url: string
  lan_url?: string | null
  lan_ws_url?: string | null
  sessions: number
}

