/**
 * True/false (判断题) answer handling.
 *
 * A 判断题 has exactly two states, so grading must never depend on option text
 * or on how a model happened to phrase the answer. The rule is:
 *
 *   1. Human spellings (`对/错`, `正确/错误`, `√/×`, `True/False`, `A/B`, `1/0` …)
 *      are only ever produced by *producers*: the AI, CSV/XLSX imports, MCP
 *      callers and banks saved by older versions. They are folded into the
 *      canonical form once, at the ingestion boundary (`normalizeQuestion`).
 *   2. Everywhere else — grading, highlighting, exports — reads the canonical
 *      form and compares values. No alias tables, no substring tests.
 *
 * The canonical form is `'True'` / `'False'`, i.e. exactly what the generation
 * prompt already asks for, so export mappings keep working unchanged.
 */

const TRUE_ALIASES = ['A', '√', '对', '正确', 'TRUE', 'T', '是', 'YES', 'Y', '1'] as const

/** Characters that flip the meaning of a longer alias: "不正确", "不对", "没有正确". */
const NEGATIONS = /[不非错没]/

/**
 * `true` when the answer means "correct/true".
 *
 * Single-character aliases match the whole answer only. Substring matching them
 * was a real bug: `"FALSE"` contains `"A"`, so every true/false question whose
 * answer was `False` was graded as if it were `True` — 判断题 were impossible to
 * answer (issue #17).
 *
 * This is a *producer-side* helper: call it at the ingestion boundary, not while
 * grading. It must stay semantically identical to the online-exam relay
 * (`workers/src/relay.ts` -> `isTrueAnswer`, `packages/server/src/relay.rs` ->
 * `is_true_answer`), which still has to accept exams published before the
 * canonical form existed.
 */
export function isTrueAnswer(answer: string | null | undefined): boolean {
  const raw = (answer ?? '').trim()
  if (!raw) return false
  const upper = raw.toUpperCase()
  return TRUE_ALIASES.some((alias) => {
    const v = alias.toUpperCase()
    if (upper === v) return true
    if (v.length < 2) return false
    if (!upper.includes(v)) return false
    return !NEGATIONS.test(upper.split(v).join(''))
  })
}

/** The single canonical state stored in `Question.answer` for 判断题. */
export function canonicalTrueFalseAnswer(answer: string | null | undefined): 'True' | 'False' {
  return isTrueAnswer(answer) ? 'True' : 'False'
}

/** The option letter (`A` = 对/True, `B` = 错/False) rendered by `QuestionCard`. */
export function trueFalseLetter(answer: string | null | undefined): 'A' | 'B' {
  return isTrueAnswer(answer) ? 'A' : 'B'
}

/**
 * Grades a 判断题 from the option letter the UI submits against the canonical
 * stored answer. Option text is deliberately not consulted — a 判断题 is
 * option-independent, and its `options` array is presentation only.
 *
 * Returns `null` when nothing was answered, so a blank answer is never mistaken
 * for "False".
 */
export function gradeTrueFalse(
  userAnswer: string | null | undefined,
  correctAnswer: string | null | undefined,
): boolean | null {
  const user = (userAnswer ?? '').trim()
  if (!user) return null
  // The UI submits 'A'/'B'; legacy sessions may still hold a spelled-out answer.
  const userIsTrue = /^[AB]$/i.test(user) ? user.toUpperCase() === 'A' : isTrueAnswer(user)
  const correct = (correctAnswer ?? '').trim()
  // Canonical rows compare as plain values — no alias table on the hot path.
  if (correct === 'True') return userIsTrue
  if (correct === 'False') return !userIsTrue
  // Only rows that skipped normalisation (a session saved by an older build)
  // fall back to interpreting text.
  return userIsTrue === isTrueAnswer(correct)
}
