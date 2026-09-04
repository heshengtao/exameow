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
  aiAnalysis?: string
  score?: number
  subject?: string
  chapter?: string
  difficulty?: Difficulty
}

export interface PracticeFilter {
  subjects?: string[]
  chapters?: string[]
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

export interface AIConfig {
  endpoint: string
  api_key: string
  model: string
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
}

export interface ExplainResult {
  explanation: string
}

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
