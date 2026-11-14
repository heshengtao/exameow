import { Ai } from '@cloudflare/workers-types'
import { aiChat, aiChatOverrides } from './ai'
import { ExamParams, Question, QuestionType, Difficulty, MAX_DOC_TEXT_CHARS, MAX_PROMPT_CHARS, MAX_QUESTIONS_PER_REQUEST, type AIRequestOptions } from './types'
import { clampNumber, clampText } from './guard'

export async function generateExam(
  ai: Ai,
  text: string,
  params: ExamParams,
  model?: string,
  options?: AIRequestOptions
): Promise<Question[]> {
  const systemPrompt = buildSystemPrompt(params.auto_chapter)
  const docText = params.text || text
  const userPrompt = buildUserPrompt(docText, params)
  const overrides = aiChatOverrides(options)
  const response = await aiChat(ai, {
    model,
    systemPrompt,
    userPrompt,
    ...overrides,
    maxTokens: overrides.maxTokens ?? params.max_tokens,
  })
  console.log('AI response preview:', response.substring(0, 200))
  return normalizeQuestionDifficulty(parseQuestions(response), params.difficulty)
}

export function normalizeQuestionDifficulty(questions: Question[], difficulty: Difficulty): Question[] {
  return questions.map((question) => ({ ...question, difficulty }))
}

export function buildSystemPrompt(autoChapter = false): string {
  const questionTypes = [
    QuestionType.SingleChoice,
    QuestionType.MultiChoice,
    QuestionType.TrueFalse,
    QuestionType.FillBlank,
    QuestionType.ShortAnswer,
  ].join(', ')

  return `You are an expert exam question generator. Generate questions based on the provided document content.

## Critical Rules (MUST follow)
- EVERY question MUST be unique — do NOT generate two questions that test the same concept, fact, or sentence.
- Cover DIFFERENT parts of the document for each question. Avoid clustering questions on the same paragraph.
- Vary question wording, angles, and tested knowledge points.
- When the question stem or analysis refers to the document, ALWAYS use the specific document name provided — NEVER use vague phrases like "the document", "the text", "the passage", "the article", or "the material".

## Output Rules
1. Respond ONLY with a valid JSON array — no explanation, no markdown fences.
2. Each question object MUST have these required fields:
   - "id": a short unique identifier string
   - "type": one of [${questionTypes}]
   - "stem": the question text
   - "options": array of option strings (required for single_choice/multi_choice/true_false; empty array for others)
   - "answer": the correct answer
   - "analysis": brief explanation of the answer (can be empty string for fill_blank/short_answer)
3. For single_choice: exactly 4 options, one correct; the answer MUST be the option letter only (e.g. "B"), never the option text.
4. For multi_choice: exactly 4 options, at least one correct; the answer MUST be the correct option letters (e.g. "A,C" or "AC"), never the option text.
5. For true_false: options ["True", "False"], answer is "True" or "False".
6. For fill_blank: answer is the exact word/phrase to fill in.
7. For short_answer: answer is a concise reference answer.
8. All questions must be based on the document content.
9. Use the specified language for questions.${autoChapter ? '\n10. When chapter tagging is enabled, also include "chapter" in every question: use the original chapter title from the material, or a concise knowledge topic in the requested language if there are no headings. Use an empty string if uncertain. Reuse the same name for the same chapter within and across batches.' : ''}`
}

export function buildUserPrompt(text: string, params: ExamParams): string {
  const difficultyMap: Record<Difficulty, string> = {
    [Difficulty.Easy]: 'easy questions suitable for beginners',
    [Difficulty.Medium]: 'moderate difficulty questions requiring understanding',
    [Difficulty.Hard]: 'challenging questions requiring deep analysis',
  }

  const difficultyStr = difficultyMap[params.difficulty] || difficultyMap[Difficulty.Medium]

  const chapterNames = (params.chapter_names ?? []).slice(0, 50).map(name => clampText(name, 80))
  const chapterNote = params.auto_chapter
    ? `\nChapter tagging is enabled. Previously used chapter names (reuse when applicable): ${JSON.stringify(chapterNames)}`
    : ''

  const topicNote = params.topic_filter
    ? `\nFocus on this topic: ${clampText(params.topic_filter, 200)}`
    : ''

  const batchNote =
    params.batch_index !== undefined &&
    params.batch_total &&
    params.batch_total > 1
      ? `\nThis is batch ${params.batch_index}/${params.batch_total} of the document. Focus on different content than other batches would.`
      : ''

  const sourceName = clampText(params.source_name, 200)
  const docName = sourceName
    ? sourceName.includes('、')
      ? `\nThe documents are collectively titled: ${sourceName}\nWhen questions need to reference a specific document, use its individual title above — do NOT say "the document" or "the text".`
      : `\nThe document title is: ${sourceName}\nWhen questions need to reference this document, use "${sourceName}" — do NOT say "the document" or "the text".`
    : ''

  const customPrompt = params.custom_prompt?.trim().slice(0, MAX_PROMPT_CHARS)
  const customNote = customPrompt
    ? `\n\n## Additional Instructions (user-provided, highest priority)\n${customPrompt}\n\n## Document rules still apply`
    : ''

  const maxChars = MAX_DOC_TEXT_CHARS
  const textSection =
    text.length > maxChars
      ? text.slice(0, (maxChars * 6) / 10) +
        '\n\n...(middle omitted)...\n\n' +
        text.slice(text.length - (maxChars * 4) / 10)
      : text

  const breakdown = params.type_counts
    ? Object.entries(params.type_counts)
        .slice(0, 20)
        .map(([key, value]) => [clampText(key, 40), clampNumber(value, 0, MAX_QUESTIONS_PER_REQUEST, 0)] as const)
        .filter(([, value]) => value > 0)
    : []
  const countInstruction = breakdown.length
    ? `Generate exactly the following breakdown of ${breakdown.reduce((sum, [, value]) => sum + value, 0)} questions:\n${breakdown.map(([key, value]) => `${value} ${key} questions`).join('\n')}`
    : `Generate ${clampNumber(params.count, 1, MAX_QUESTIONS_PER_REQUEST, 1)} questions.\nQuestion types: ${(params.question_types ?? []).slice(0, 10).map(type => clampText(type, 40)).join(', ')}`

  return `${countInstruction}
Difficulty: ${difficultyStr}
Language: ${clampText(params.language, 40)}${topicNote}${chapterNote}${batchNote}${docName}${customNote}

DOCUMENT CONTENT:
${textSection}`
}

function parseQuestions(jsonStr: unknown): Question[] {
  if (typeof jsonStr !== 'string') {
    throw new Error(`Expected string response from AI, got ${typeof jsonStr}`)
  }

  let cleaned = jsonStr.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  cleaned = cleaned.replace(/\n?```\s*$/i, '')

  // Strip AI preamble (e.g. "Here is the JSON:", "The answer is:", etc.)
  const jsonStart = cleaned.search(/[\[\{]/)
  if (jsonStart > 0) {
    cleaned = cleaned.substring(jsonStart)
  }

  cleaned = cleaned.trim()

  const parsed = JSON.parse(cleaned)

  // Handle { "questions": [...] } wrapper
  let questions: Question[]
  if (Array.isArray(parsed)) {
    questions = parsed
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
    questions = parsed.questions
  } else {
    console.error('Unexpected AI response structure:', JSON.stringify(parsed).substring(0, 200))
    throw new Error('AI response is neither an array nor { questions: [...] }')
  }

  if (!questions.length) {
    throw new Error('AI returned empty questions array')
  }

  return questions
}
