import type { QuestionImage } from '@exameow/shared'

const DB_NAME = 'exameow-media'
const DB_VERSION = 1
const STORE = 'assets'

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 1600
const RECOMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024

interface MediaRecord {
  id: string
  mime: 'image/jpeg' | 'image/png'
  width: number
  height: number
  size: number
  blob: Blob
  createdAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
  return dbPromise
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/**
 * Content id. SHA-256 is used when available, but self-hosted Docker instances
 * accessed over plain HTTP are not secure contexts and do not expose
 * `crypto.subtle`, so fall back to a deterministic FNV-based hash.
 */
async function contentId(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return bytesToHex(new Uint8Array(digest))
  }
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    h1 = Math.imul(h1 ^ b, 0x01000193)
    h2 = Math.imul(h2 + b, 0x85ebca6b)
  }
  return `fnv-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}-${bytes.length.toString(16)}`
}

async function decodeBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('cannot decode image'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas encode failed'))),
      mime,
      quality,
    )
  })
}

export interface NormalizedImage {
  blob: Blob
  mime: 'image/jpeg' | 'image/png'
  width: number
  height: number
}

/**
 * Decodes and normalizes an image for storage: caps the long edge at 1600px and
 * re-encodes oversized bitmaps. PNG stays PNG (transparency), everything else
 * becomes JPEG so Excel can always render it.
 */
export async function normalizeImage(input: Blob): Promise<NormalizedImage> {
  if (input.size > MAX_IMAGE_BYTES) throw new Error('image_too_large')

  const bitmap = await decodeBitmap(input)
  const srcWidth = bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width
  const srcHeight = bitmap instanceof HTMLImageElement ? bitmap.naturalHeight : bitmap.height
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(srcWidth, srcHeight))
  const width = Math.max(1, Math.round(srcWidth * scale))
  const height = Math.max(1, Math.round(srcHeight * scale))

  const keepPng = input.type === 'image/png'
  const needsResize = scale < 1
  const needsRecompress = input.size > RECOMPRESS_ABOVE_BYTES
  if (!needsResize && !needsRecompress && (input.type === 'image/png' || input.type === 'image/jpeg')) {
    if ('close' in bitmap) bitmap.close()
    return { blob: input, mime: input.type, width, height }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    if ('close' in bitmap) bitmap.close()
    throw new Error('canvas_unavailable')
  }
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
  if ('close' in bitmap) bitmap.close()

  const mime: 'image/jpeg' | 'image/png' = keepPng ? 'image/png' : 'image/jpeg'
  const blob = await canvasToBlob(canvas, mime, keepPng ? 1 : 0.85)
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('image_too_large')
  return { blob, mime, width, height }
}

async function putRecord(record: MediaRecord): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(record)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
  })
}

/** Stores an image and returns its content-addressed reference. Idempotent. */
export async function putImage(input: Blob): Promise<QuestionImage> {
  const normalized = await normalizeImage(input)
  const id = await contentId(normalized.blob)
  const existing = await getRecord(id)
  if (existing) return { id, mime: existing.mime, width: existing.width, height: existing.height }
  const record: MediaRecord = {
    id,
    mime: normalized.mime,
    width: normalized.width,
    height: normalized.height,
    size: normalized.blob.size,
    blob: normalized.blob,
    createdAt: Date.now(),
  }
  await putRecord(record)
  return { id, mime: normalized.mime, width: normalized.width, height: normalized.height }
}

async function getRecord(id: string): Promise<MediaRecord | null> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const result = await requestToPromise(tx.objectStore(STORE).get(id) as IDBRequest<MediaRecord | undefined>)
  return result ?? null
}

export async function getImage(id: string): Promise<MediaRecord | null> {
  try {
    return await getRecord(id)
  } catch {
    return null
  }
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const record = await getImage(id)
  return record?.blob ?? null
}

export async function getImageBlobs(ids: string[]): Promise<Map<string, Blob>> {
  const unique = [...new Set(ids)]
  const entries = await Promise.all(unique.map(async (id) => [id, await getImageBlob(id)] as const))
  const map = new Map<string, Blob>()
  for (const [id, blob] of entries) {
    if (blob) map.set(id, blob)
  }
  return map
}

export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  for (const id of ids) store.delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
  })
}

/** Removes stored images that are no longer referenced by any bank. */
export async function pruneUnreferenced(referenced: Iterable<string>): Promise<number> {
  const keep = new Set(referenced)
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const keys = await requestToPromise(tx.objectStore(STORE).getAllKeys() as IDBRequest<IDBValidKey[]>)
  const stale = keys.filter((k): k is string => typeof k === 'string' && !keep.has(k))
  await deleteImages(stale)
  return stale.length
}

export function isMediaAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}
