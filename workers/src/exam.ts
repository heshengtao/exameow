import { Ai } from '@cloudflare/workers-types'
import { aiChat } from './ai'
import { ExamParams, Question, QuestionType, Difficulty } from './types'

export async function generateExam(
  ai: Ai,
  text: string,
  params: ExamParams,
  model?: string
): Promise<Question[]> {
  const systemPrompt = buildSystemPrompt()
  const docText = params.text || text
  const userPrompt = buildUserPrompt(docText, params)
  const response = await aiChat(ai, { model, systemPrompt, userPrompt })
  console.log('AI response preview:', response.substring(0, 200))
  return normalizeQuestionDifficulty(parseQuestions(response), params.difficulty)
}

export function normalizeQuestionDifficulty(questions: Question[], difficulty: Difficulty): Question[] {
  return questions.map((question) => ({ ...question, difficulty }))
}

function buildSystemPrompt(): string {
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
  const difficultyMap: Record<Difficulty, string> = {
    [Difficulty.Easy]: 'easy questions suitable for beginners',
    [Difficulty.Medium]: 'moderate difficulty questions requiring understanding',
    [Difficulty.Hard]: 'challenging questions requiring deep analysis',
  }

  const difficultyStr = difficultyMap[params.difficulty] || difficultyMap[Difficulty.Medium]

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
