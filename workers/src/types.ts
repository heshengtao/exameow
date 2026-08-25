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
}

export interface ExamParams {
  question_types: QuestionType[]
  count: number
  type_counts?: Record<string, number>
  difficulty: Difficulty
  language: string
  topic_filter?: string
  text?: string
  batch_index?: number
  batch_total?: number
  source_name?: string
}

export interface AIConfigData {
  endpoint?: string
  api_key?: string
  model: string
}

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
