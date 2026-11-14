/**
 * Fill-in-the-blank (填空题) answer matching.
 *
 * A blank is answered by typing, so the same correct answer arrives with all
 * sorts of harmless noise: a trailing 。, full-width ＡＢＣ, doubled spaces, or
 * the author listing alternatives as "北京/Beijing". Comparing raw strings meant
 * a student who typed the right word was marked wrong.
 *
 * The rule: fold presentation away (width, case, whitespace, trailing
 * punctuation) and compare values; split explicit alternatives only when they
 * are unambiguous.
 */

/** Full-width ASCII (U+FF01..U+FF5E) and the ideographic space → half-width. */
function toHalfWidth(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
}

const TRAILING_PUNCTUATION = /[。．.,，;；、:：!！?？]+$/
const CJK = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/

/** Presentation-normalised form of a fill-in answer. Empty string means "no answer". */
export function normalizeFillBlank(text: string | null | undefined): string {
  return toHalfWidth(String(text ?? ''))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(TRAILING_PUNCTUATION, '')
    .trim()
}

/**
 * Accepted spellings of one reference answer.
 *
 * "km/h", "2/3" and "TCP/IP" are single answers, so a slash only means
 * "either/or" when at least one side is CJK — which is how teachers write
 * alternatives ("北京/Beijing").
 */
function acceptedForms(answer: string): string[] {
  const parts = answer.split(/[/／]/).map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2 && parts.some(part => CJK.test(part))) {
    return parts.map(normalizeFillBlank)
  }
  return [normalizeFillBlank(answer)]
}

/** Grades a typed answer. Returns `false` for an empty answer, never `true`. */
export function matchesFillBlank(
  userAnswer: string | null | undefined,
  correctAnswer: string | null | undefined,
): boolean {
  const user = normalizeFillBlank(userAnswer)
  if (!user) return false
  return acceptedForms(String(correctAnswer ?? '')).some(form => form !== '' && form === user)
}
