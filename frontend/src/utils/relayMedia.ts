import type { Question } from '@exameow/shared'
import { getImage } from '@/utils/mediaStore'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Collects the base64 payloads for images referenced by an exam.
 * Only the self-hosted relay consumes this; the Cloudflare relay strips it.
 */
export async function collectRelayImages(
  questions: Question[],
): Promise<Record<string, { mime: string; data: string }>> {
  const ids = new Set<string>()
  for (const q of questions) {
    for (const item of q.media ?? []) ids.add(item.id)
  }

  const images: Record<string, { mime: string; data: string }> = {}
  await Promise.all(
    [...ids].map(async (id) => {
      const record = await getImage(id)
      if (!record) return
      const bytes = new Uint8Array(await record.blob.arrayBuffer())
      images[id] = { mime: record.mime, data: bytesToBase64(bytes) }
    }),
  )
  return images
}
