import type { Question } from '@exameow/shared'

const OPTION_LETTERS = 'ABCDEFGH'

/** Question + options rendered as plain text, used for the "AI poses the question" bubble. */
export function formatQuestionForDisplay(question: Question): string {
  if (question.type === 'true_false') {
    return `${question.stem}\n\nA. True\nB. False`
  }
  if (question.options.length) {
    const options = question.options
      .map((option, i) => `${OPTION_LETTERS[i]}. ${option}`)
      .join('\n')
    return `${question.stem}\n\n${options}`
  }
  return question.stem
}

/** The student's own answer, rendered for the chat bubble (choice answers get option text). */
export function formatUserAnswerForDisplay(question: Question, answer: string): string {
  const raw = answer.trim()
  if (!raw) return ''
  if (question.type === 'single_choice' || question.type === 'multi_choice') {
    const letters = raw.toUpperCase().replace(/[^A-H]/g, '').split('')
    return letters
      .map((letter) => {
        const option = question.options[letter.charCodeAt(0) - 65]
        return option ? `${letter}. ${option}` : letter
      })
      .join('\n')
  }
  return raw
}

/** System prompt for the "Learn with AI" tutor, scoped to a single question. */
export function buildTutorSystemPrompt(question: Question, language: string): string {
  const optionsText = question.options.length
    ? '\n' + question.options.map((option, i) => `${OPTION_LETTERS[i]}. ${option}`).join('\n')
    : ''
  const analysisBlock = question.analysis?.trim()
    ? `\n\nREFERENCE ANALYSIS:\n${question.analysis}`
    : ''

  return `You are an expert tutor running a "Learn with AI" chat session about ONE exam question. The student is studying the question below. The reference answer is authoritative — treat it as correct.

## Behaviour
- If the student's message is an answer or a guess, first say whether it is correct (and why), then explain the reasoning: the key knowledge points, the steps, and why the other options are wrong.
- If the student asks a question or asks you to explain, answer directly in the context of this question.
- Stay focused on this question; do not drift to unrelated topics.
- Be concise and pedagogical — a short, well-structured explanation the student can absorb quickly.
- If the reference answer appears wrong, still explain the most likely intended reasoning and briefly note the ambiguity at the end.

## Format
- Reply in ${language}.
- Use Markdown (bold, lists, tables, code) for clarity; never wrap the whole reply in one code fence.

QUESTION:
${question.stem}${optionsText}

REFERENCE ANSWER:
${question.answer}${analysisBlock}`
}
