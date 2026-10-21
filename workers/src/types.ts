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

export interface Question {
  id: string
  type: QuestionType
  stem: string
  options: string[]
  answer: string
  analysis: string
  score?: number
  subject?: string
  chapter?: string
  difficulty?: Difficulty
  images?: string[]
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

export interface AIRequestOptions {
  max_tokens?: number
  token_parameter?: string
  temperature?: number
  omit_temperature?: boolean
  reasoning_effort?: string
  extra_prompt?: string
  retries?: number
  timeout_seconds?: number
}

export interface AIConfigData {
  endpoint?: string
  api_key?: string
  model: string
  search?: SearchConfig
}

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
  keys: Partial<Record<VendorId, string>>
  tools_enabled: boolean
  max_tool_rounds: number
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

// Free-plan guards: every value here bounds attacker-controlled cost on the public demo Worker.
export const MAX_OUTPUT_TOKENS = 8192
export const MAX_JSON_BODY_BYTES = 256 * 1024
export const MAX_JSON_EXPORT_BYTES = 4 * 1024 * 1024
export const MAX_REQUEST_BYTES = 24 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_DOC_TEXT_CHARS = 32000
export const MAX_QUESTIONS_PER_REQUEST = 50
export const MAX_PROMPT_CHARS = 4000
export const MAX_USER_PROMPT_CHARS = 64000
export const MAX_STEM_CHARS = 20000
export const MAX_ANSWER_CHARS = 8000
export const MAX_EXAM_PAYLOAD_BYTES = 1_800_000
export const MAX_EXAM_RESULTS = 500
export const MAX_STUDENT_NAME_CHARS = 50
export const MAX_ANSWERS_BYTES = 64 * 1024

export const AVAILABLE_CF_MODELS = [
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B (Fast)' },
  { id: '@cf/meta/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision' },
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Llama 3.2 3B (Fast)' },
  { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B' },
  { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill 32B' },
  { id: '@cf/deepseek-ai/deepseek-v3-0324', name: 'DeepSeek V3' },
  { id: '@cf/google/gemma-3-27b-it', name: 'Gemma 3 27B' },
  { id: '@cf/google/gemma-3-12b-it', name: 'Gemma 3 12B' },
  { id: '@cf/mistral/mistral-large-2411', name: 'Mistral Large' },
  { id: '@cf/mistral/mistral-small-2505', name: 'Mistral Small' },
  { id: '@cf/qwen/qwen3-235b-a22b-fp8-fast', name: 'Qwen3 235B (Fast)' },
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', name: 'Qwen3 30B' },
  { id: '@cf/qwen/qwen2.5-coder-32b-instruct', name: 'Qwen2.5 Coder 32B' },
  { id: '@cf/microsoft/phi-4-mini-instruct', name: 'Phi-4 Mini' },
]

export interface AnswerResult {
  answer: string
  analysis: string
}

export interface JudgeResult {
  correct: boolean
  feedback: string
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

export const MAX_CHAT_MESSAGES = 40
export const MAX_TOOL_ROUNDS = 5
export const MAX_TOOL_CALLS_PER_ROUND = 3
export const MAX_TOOL_CALLS_TOTAL = 8
export const MAX_TOOL_RESULT_CHARS = 8000
export const MAX_TOOL_CONTEXT_CHARS = 20000

export const DEFAULT_MODEL = '@cf/openai/gpt-oss-120b'

export interface PublicQuestion {
  id: string
  type: QuestionType
  stem: string
  options: string[]
}

export interface PublishExamRequest {
  title: string
  questions: Question[]
  startAt: number
  endAt: number
  durationMinutes: number
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

export interface StoredExam {
  title: string
  questions: Question[]
  startAt: number
  endAt: number
  durationMinutes: number
  createdAt: number
  adminTokenHash: string
  suspended?: number
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
