import { isCloudflare, isTauri } from '@/utils/platform'

/**
 * Local question images (XLSX embedded import/export, IndexedDB storage) are
 * supported on the Tauri app and the self-hosted web build. The Cloudflare
 * build intentionally stays text-only so no image data reaches D1.
 */
export function supportsLocalMedia(): boolean {
  return !isCloudflare()
}

/**
 * Images in online exams require a relay that can store media. The Tauri app
 * publishes to the Cloudflare relay by default, while the self-hosted web
 * build talks to its own Axum relay.
 */
export function relaySupportsMedia(): boolean {
  if (import.meta.env.VITE_EXAM_RELAY_MEDIA === 'true') return true
  return !isCloudflare() && !isTauri()
}

export function countQuestionImages(questions: { images?: string[] }[]): number {
  return questions.reduce((sum, q) => sum + (q.images?.length ?? 0), 0)
}
