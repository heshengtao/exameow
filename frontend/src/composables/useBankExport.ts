import { api } from '@/api'
import { generateCsvContent } from '@/api/http'
import { exportBankToWord } from '@/utils/wordExport'
import type { QuestionBank } from '@exameow/shared'

export type BankExportFormat = 'csv' | 'xlsx' | 'word'

export interface BankExportResult {
  ok: boolean
  path?: string
  error?: string
  cancelled?: boolean
}

function isTauriPlatform(): boolean {
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || 'exameow_bank'
}

async function saveTauri(filename: string, questions: QuestionBank['questions'], format: BankExportFormat): Promise<string | null> {
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
  try {
    if (isTauriPlatform()) {
      const path = await saveTauri(filename, bank.questions, format)
      if (path === null) return { ok: false, cancelled: true }
      return { ok: true, path }
    }
    if (format === 'csv') {
      await api.exportCsv(bank.questions, undefined, filename)
    } else {
      await api.exportXlsx(bank.questions, undefined, filename)
    }
    return { ok: true, path: filename }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}
