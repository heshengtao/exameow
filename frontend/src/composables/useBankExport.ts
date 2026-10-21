import { api } from '@/api'
import { generateCsvContent } from '@/api/http'
import { exportBankToWord } from '@/utils/wordExport'
import type { QuestionBank, Question } from '@exameow/shared'
import { buildXlsx, type XlsxMedia } from '@/utils/xlsxWriter'
import { getImage } from '@/utils/mediaStore'
import { countQuestionImages, supportsLocalMedia } from '@/utils/capabilities'
import { useI18nStore } from '@/stores/i18n'
import { TEMPLATE_COPY } from '@/utils/templateSchema'

export type BankExportFormat = 'csv' | 'xlsx' | 'word'

export interface BankExportResult {
  ok: boolean
  path?: string
  error?: string
  cancelled?: boolean
  imagesOmitted?: number
  imagesIncluded?: number
  imagesMissing?: number
}

function isTauriPlatform(): boolean {
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || 'exameow_bank'
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function loadBankMedia(questions: Question[]): Promise<Map<string, XlsxMedia>> {
  const media = new Map<string, XlsxMedia>()
  const uniqueIds = new Set<string>()
  for (const q of questions) {
    for (const item of q.media ?? []) uniqueIds.add(item.id)
  }
  await Promise.all(
    [...uniqueIds].map(async (id) => {
      const record = await getImage(id)
      if (!record) return
      const bytes = new Uint8Array(await record.blob.arrayBuffer())
      media.set(id, {
        id,
        mime: record.mime,
        width: record.width,
        height: record.height,
        bytes,
      })
    }),
  )
  return media
}

async function saveTauri(
  filename: string,
  questions: QuestionBank['questions'],
  format: 'csv' | 'xlsx',
): Promise<string | null> {
  try {
    const mod: any = await import('@tauri-apps/plugin-dialog')
    const path = await mod.save({
      defaultPath: filename,
      filters: [{ name: 'File', extensions: [format] }],
    })
    if (!path) return null
    if (format === 'csv') {
      await api.exportCsv(questions, path)
    } else {
      await api.exportXlsx(questions, path)
    }
    return path
  } catch {
    // fall through to downloads fallback
  }
  const b64 = format === 'csv'
    ? btoa(unescape(encodeURIComponent(generateCsvContent(questions))))
    : await api.exportXlsxData(questions)
  const { tauriApi } = await import('@/api/bridge')
  return tauriApi.saveToDownloads(filename, b64)
}

async function saveXlsxWithMedia(filename: string, buffer: Uint8Array): Promise<string | null> {
  const { tauriApi } = await import('@/api/bridge')
  if (!isTauriPlatform()) {
    downloadBlob(
      new Blob([buffer as unknown as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      filename,
    )
    return filename
  }

  try {
    const mod: any = await import('@tauri-apps/plugin-dialog')
    const path = await mod.save({
      defaultPath: filename,
      filters: [{ name: 'File', extensions: ['xlsx'] }],
    })
    if (!path) return null
    await tauriApi.writeFile(path, toBase64(buffer))
    return path
  } catch {
    return tauriApi.saveToDownloads(filename, toBase64(buffer))
  }
}

export async function exportBank(bank: QuestionBank, format: BankExportFormat): Promise<BankExportResult> {
  if (format === 'word') {
    try {
      const files = await exportBankToWord(bank)
      return { ok: true, path: files.join('、') }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }

  const filename = `${sanitizeFilename(bank.name)}.${format}`
  const imageCount = countQuestionImages(bank.questions)

  try {
    if (format === 'xlsx' && supportsLocalMedia()) {
      const media = imageCount > 0 ? await loadBankMedia(bank.questions) : new Map<string, XlsxMedia>()
      const i18n = useI18nStore()
      const built = buildXlsx(bank.questions, {
        media,
        // Always emit the image columns so exported banks match the template
        // and can be filled in with pictures later.
        includeMediaColumns: true,
        headers: TEMPLATE_COPY[i18n.locale].headers,
      })
      const path = await saveXlsxWithMedia(filename, built.buffer)
      if (path === null) return { ok: false, cancelled: true }
      return {
        ok: true,
        path,
        imagesIncluded: built.imagesIncluded,
        imagesMissing: built.imagesMissing,
      }
    }

    if (isTauriPlatform()) {
      const path = await saveTauri(filename, bank.questions, format)
      if (path === null) return { ok: false, cancelled: true }
      const omitted = format === 'csv' || (format === 'xlsx' && imageCount > 0) ? imageCount : undefined
      return { ok: true, path, imagesOmitted: omitted }
    }
    if (format === 'csv') {
      await api.exportCsv(bank.questions, undefined, filename)
    } else {
      await api.exportXlsx(bank.questions, undefined, filename)
    }
    const omitted = format === 'csv' || (format === 'xlsx' && imageCount > 0) ? imageCount : undefined
    return { ok: true, path: filename, imagesOmitted: omitted }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}
