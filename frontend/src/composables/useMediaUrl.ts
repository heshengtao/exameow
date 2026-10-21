import { getImageBlob } from '@/utils/mediaStore'

const localCache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

/** Resolves an IndexedDB image id to an object URL. Cached for the session. */
export function resolveLocalMediaUrl(id: string): Promise<string | null> {
  const cached = localCache.get(id)
  if (cached) return Promise.resolve(cached)
  const inflight = pending.get(id)
  if (inflight) return inflight

  const task = getImageBlob(id)
    .then((blob) => {
      if (!blob) return null
      const url = URL.createObjectURL(blob)
      localCache.set(id, url)
      return url
    })
    .catch(() => null)
    .finally(() => pending.delete(id))

  pending.set(id, task)
  return task
}

export function getCachedLocalMediaUrl(id: string): string | undefined {
  return localCache.get(id)
}

export function mediaKey(id: string, remoteUrl?: string): string {
  return remoteUrl ?? `local:${id}`
}
