import type { ExamParams, Question, QuestionType, Difficulty } from '@exameow/shared'
import { normalizeEndpoint } from '@/utils/endpoint'

interface AIConfig {
  endpoint: string
  api_key: string
  model: string
}

function buildSystemPrompt(): string {
  const questionTypes = [
    'single_choice', 'multi_choice', 'true_false', 'fill_blank', 'short_answer',
  ].join(', ')

  return `You are an expert exam question generator. Generate questions based on the provided document content.

## Critical Rules (MUST follow)
- EVERY question MUST be unique — do NOT generate two questions that test the same concept, fact, or sentence.
- Cover DIFFERENT parts of the document for each question. Avoid clustering questions on the same paragraph.
- Vary question wording, angles, and tested knowledge points.
- When the question stem or analysis refers to the document, ALWAYS use the specific document name provided — NEVER use vague phrases like "the document", "the text", "the passage", "the article", or "the material".

## Output Rules
1. Respond ONLY with a valid JSON array — no explanation, no markdown fences.
2. Each question object MUST have exactly these fields:
   - "id": a short unique identifier string
   - "type": one of [${questionTypes}]
   - "stem": the question text
   - "options": array of option strings (required for single_choice/multi_choice/true_false; empty array for others)
   - "answer": the correct answer
   - "analysis": brief explanation of the answer (can be empty string for fill_blank/short_answer)
3. For single_choice: exactly 4 options, one correct.
4. For multi_choice: exactly 4 options, at least one correct (list correct letters separated by comma in answer).
5. For true_false: options ["True", "False"], answer is "True" or "False".
6. For fill_blank: answer is the exact word/phrase to fill in.
7. For short_answer: answer is a concise reference answer.
8. All questions must be based on the document content.
9. Use the specified language for questions.`
}

function buildUserPrompt(text: string, params: ExamParams): string {
  const difficultyMap: Record<string, string> = {
    easy: 'easy questions suitable for beginners',
    medium: 'moderate difficulty questions requiring understanding',
    hard: 'challenging questions requiring deep analysis',
  }

  const difficultyStr = difficultyMap[params.difficulty] || difficultyMap.medium

  const topicNote = params.topic_filter
    ? `\nFocus on this topic: ${params.topic_filter}`
    : ''

  const batchNote =
    params.batch_index !== undefined &&
    params.batch_total &&
    params.batch_total > 1
      ? `\nThis is batch ${params.batch_index}/${params.batch_total} of the document. Focus on different content than other batches would.`
      : ''

  const docName = params.source_name
    ? params.source_name.includes('、')
      ? `\nThe documents are collectively titled: ${params.source_name}\nWhen questions need to reference a specific document, use its individual title above — do NOT say "the document" or "the text".`
      : `\nThe document title is: ${params.source_name}\nWhen questions need to reference this document, use "${params.source_name}" — do NOT say "the document" or "the text".`
    : ''

  const maxChars = 32000
  const textSection =
    text.length > maxChars
      ? text.slice(0, (maxChars * 6) / 10) +
        '\n\n...(middle omitted)...\n\n' +
        text.slice(text.length - (maxChars * 4) / 10)
      : text

  const countInstruction = params.type_counts
    ? (() => {
        const parts: string[] = []
        let total = 0
        for (const [key, cnt] of Object.entries(params.type_counts)) {
          if (cnt > 0) {
            parts.push(`${cnt} ${key} questions`)
            total += cnt
          }
        }
        return `Generate exactly the following breakdown of ${total} questions:\n${parts.join('\n')}`
      })()
    : `Generate ${params.count} questions.\nQuestion types: ${params.question_types.join(', ')}`

  return `${countInstruction}
Difficulty: ${difficultyStr}
Language: ${params.language}${topicNote}${batchNote}${docName}

DOCUMENT CONTENT:
${textSection}`
}

export function normalizeQuestionDifficulty(questions: Question[], difficulty: Difficulty): Question[] {
  return questions.map((question) => ({ ...question, difficulty }))
}

function parseQuestions(jsonStr: string): Question[] {
  let cleaned = jsonStr.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  cleaned = cleaned.replace(/\n?```\s*$/i, '')

  const jsonStart = cleaned.search(/[\[\{]/)
  if (jsonStart > 0) {
    cleaned = cleaned.substring(jsonStart)
  }

  cleaned = cleaned.trim()
  const parsed = JSON.parse(cleaned)

  let questions: Question[]
  if (Array.isArray(parsed)) {
    questions = parsed
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
    questions = parsed.questions
  } else {
    throw new Error('AI response is neither an array nor { questions: [...] }')
  }

  if (!questions.length) {
    throw new Error('AI returned empty questions array')
  }

  return questions
}

export async function callCustomAI(
  text: string,
  params: ExamParams,
  config: AIConfig,
  signal?: AbortSignal,
): Promise<Question[]> {
  const endpoint = normalizeEndpoint(config.endpoint)
  const url = `${endpoint}/chat/completions`

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(text, params) },
    ],
    temperature: 0.7,
    max_tokens: 16384,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`AI API error ${res.status}: ${errBody}`)
  }

  const json = await res.json()
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('AI returned empty response')

  return normalizeQuestionDifficulty(parseQuestions(content), params.difficulty)
}
