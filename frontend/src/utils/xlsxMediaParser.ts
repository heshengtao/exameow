import { MAX_IMAGE_BYTES } from '@/utils/mediaStore'

/** Dedicated image column: P (index 15). */
export const IMAGE_COLUMN_INDEX = 15

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
}

export interface XlsxImageEntry {
  /** Zero-based sheet row index (header is row 0). */
  row: number
  col: number
  order: number
  name: string
  blob: Blob
}

interface ZipEntryLike {
  content?: Uint8Array | ArrayBuffer
  name?: string
}

type ZipFiles = Record<string, ZipEntryLike>

export type SheetJsWorkbookFiles = ZipFiles

function normalizeZipPath(path: string): string {
  return path.replace(/^Root Entry\/?/, '').replace(/^\/+/, '')
}

function buildFileIndex(files: ZipFiles): Map<string, Uint8Array> {
  const index = new Map<string, Uint8Array>()
  for (const [key, entry] of Object.entries(files ?? {})) {
    const path = normalizeZipPath(key)
    if (!path || !entry?.content) continue
    const content = entry.content
    index.set(
      path,
      content instanceof Uint8Array ? content : new Uint8Array(content),
    )
  }
  return index
}

function localNameOf(el: Element): string {
  const name = el.localName || el.nodeName || ''
  const idx = name.indexOf(':')
  return idx >= 0 ? name.slice(idx + 1) : name
}

function decodeXml(bytes: Uint8Array | undefined): Document | null {
  if (!bytes) return null
  try {
    const text = new TextDecoder('utf-8').decode(bytes)
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    return doc.documentElement && localNameOf(doc.documentElement) === 'parsererror' ? null : doc
  } catch {
    return null
  }
}

function descendants(el: Element, localName: string): Element[] {
  return Array.from(el.querySelectorAll('*')).filter((node) => localNameOf(node) === localName)
}

function firstDescendant(el: Element, localName: string): Element | undefined {
  return descendants(el, localName)[0]
}

function intChild(el: Element | undefined, localName: string): number {
  if (!el) return 0
  const node = firstDescendant(el, localName)
  const value = Number.parseInt(node?.textContent ?? '', 10)
  return Number.isFinite(value) ? value : 0
}

function relEmbed(blip: Element | undefined): string | undefined {
  if (!blip) return undefined
  return blip.getAttributeNS(REL_NS, 'embed') ?? blip.getAttribute('r:embed') ?? undefined
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(0, idx) : ''
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(idx + 1) : path
}

function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.replace(/^\/+/, '')
  const parts = [...baseDir.split('/').filter(Boolean), ...target.split('/')]
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

function relsPathFor(path: string): string {
  return `${dirname(path)}/_rels/${basename(path)}.rels`
}

interface Relationship {
  type: string
  target: string
}

function readRelationships(
  index: Map<string, Uint8Array>,
  relsPath: string,
): Map<string, Relationship> {
  const result = new Map<string, Relationship>()
  const doc = decodeXml(index.get(relsPath))
  if (!doc) return result
  for (const rel of descendants(doc.documentElement, 'Relationship')) {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target')
    const type = rel.getAttribute('Type') ?? ''
    if (id && target) result.set(id, { type, target })
  }
  return result
}

function firstSheetPath(index: Map<string, Uint8Array>): string {
  const fallback = 'xl/worksheets/sheet1.xml'
  const workbook = decodeXml(index.get('xl/workbook.xml'))
  if (!workbook) return fallback

  const sheet = descendants(workbook.documentElement, 'sheet')[0]
  const rid = sheet?.getAttributeNS(REL_NS, 'id') ?? sheet?.getAttribute('r:id')
  if (!rid) return fallback

  const rels = readRelationships(index, 'xl/_rels/workbook.xml.rels')
  const rel = rels.get(rid)
  if (!rel) return fallback
  return resolvePath('xl', rel.target)
}

function findDrawingPath(index: Map<string, Uint8Array>, sheetPath: string): string | null {
  const rels = readRelationships(index, relsPathFor(sheetPath))
  for (const rel of rels.values()) {
    if (rel.type.endsWith('/drawing')) return resolvePath(dirname(sheetPath), rel.target)
  }
  return null
}

interface RawAnchor {
  row: number
  col: number
  rowOff: number
  embed: string
}

function parseAnchors(drawingXml: Uint8Array | undefined): RawAnchor[] {
  const doc = decodeXml(drawingXml)
  if (!doc) return []
  const root = doc.documentElement
  if (!root) return []

  const anchors: RawAnchor[] = []
  for (const el of descendants(root, 'oneCellAnchor').concat(descendants(root, 'twoCellAnchor'))) {
    const from = firstDescendant(el, 'from')
    if (!from) continue
    const blip = firstDescendant(el, 'blip')
    const embed = relEmbed(blip)
    if (!embed) continue
    anchors.push({
      row: intChild(from, 'row'),
      col: intChild(from, 'col'),
      rowOff: intChild(from, 'rowOff'),
      embed,
    })
  }
  return anchors
}

function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'image/png'
}

/**
 * Extracts images embedded in an XLSX and maps them to their anchor row.
 * Only the first sheet is considered, matching the import behaviour.
 *
 * `wb.files` comes from `XLSX.read(buffer, { bookFiles: true })` (SheetJS 0.18).
 */
export function extractXlsxImages(files: SheetJsWorkbookFiles | undefined): XlsxImageEntry[] {
  if (!files) return []
  const index = buildFileIndex(files)
  if (index.size === 0) return []

  let entries: XlsxImageEntry[] = []
  const sheetPath = firstSheetPath(index)
  const drawingPath = findDrawingPath(index, sheetPath)
  if (!drawingPath) return []

  const drawingRels = readRelationships(index, relsPathFor(drawingPath))
  const drawingXml = index.get(drawingPath)
  const anchors = parseAnchors(drawingXml)

  const dedicated = anchors.filter((a) => a.col >= IMAGE_COLUMN_INDEX)
  const selected = dedicated.length > 0 ? dedicated : anchors.filter((a) => a.row > 0)

  for (const anchor of selected) {
    const rel = drawingRels.get(anchor.embed)
    if (!rel) continue
    const mediaPath = resolvePath(dirname(drawingPath), rel.target)
    const bytes = index.get(mediaPath)
    if (!bytes || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) continue

    const mime = mimeForPath(mediaPath)
    entries.push({
      row: anchor.row,
      col: anchor.col,
      order: anchor.rowOff,
      name: basename(mediaPath),
      blob: new Blob([bytes as unknown as BlobPart], { type: mime }),
    })
  }

  entries = entries.sort((a, b) => a.row - b.row || a.order - b.order || a.col - b.col)
  return entries
}

export function groupImagesByRow(entries: XlsxImageEntry[]): Map<number, XlsxImageEntry[]> {
  const map = new Map<number, XlsxImageEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.row) ?? []
    list.push(entry)
    map.set(entry.row, list)
  }
  return map
}
