import type { Question } from '@exameow/shared'
import {
  FIRST_MEDIA_COLUMN,
  LAST_MEDIA_COLUMN,
  mediaColumnIndex,
} from '@/utils/questionMedia'
import { TEMPLATE_COPY, type TemplateHeaders } from '@/utils/templateSchema'

const TYPE_MAP: Record<string, string> = {
  single_choice: '单选题',
  multi_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
}

const COLUMN_COUNT = LAST_MEDIA_COLUMN + 1
const EMU_PER_PX = 9525
const DISPLAY_MAX_PX = 160
const IMAGE_GAP_PX = 8

export interface XlsxMedia {
  id: string
  mime: string
  width: number
  height: number
  bytes: Uint8Array
}

export interface XlsxBuildOptions {
  media?: Map<string, XlsxMedia>
  includeMediaColumns?: boolean
  /** Localized headers; defaults to Simplified Chinese. */
  headers?: TemplateHeaders
}

export interface XlsxBuildResult {
  buffer: Uint8Array
  imagesIncluded: number
  imagesMissing: number
}

function chineseType(qtype: string): string {
  return TYPE_MAP[qtype] || '简答题'
}

function answerLetter(answer: string, options: string[]): string {
  if (/^[A-H]$/.test(answer)) return answer
  const letters = answer.replace(/[^A-H]/g, '')
  if (letters) return letters
  const result: string[] = []
  for (const part of answer.split(',')) {
    const trimmed = part.trim()
    const idx = options.findIndex((o) => o.trim() === trimmed)
    if (idx >= 0) result.push(String.fromCharCode(65 + idx))
  }
  return result.length ? result.join(',') : answer
}

function trueFalseAnswer(answer: string): string {
  const a = answer.trim()
  if (['对', '正确', '√', '是', 'true', 'True', 'TRUE'].includes(a)) return '√'
  if (['错', '错误', '×', '否', 'false', 'False', 'FALSE'].includes(a)) return '×'
  return a
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function colLetter(idx: number): string {
  let n = idx
  const result: string[] = []
  while (true) {
    result.push(String.fromCharCode(65 + (n % 26)))
    if (n < 26) break
    n = Math.floor(n / 26) - 1
  }
  return result.reverse().join('')
}

interface Anchor {
  id: number
  row: number
  col: number
  relId: string
  offsetY: number
  cx: number
  cy: number
}

function displaySize(width: number, height: number): { cx: number; cy: number; pxWidth: number; pxHeight: number } {
  const safeWidth = width > 0 ? width : 320
  const safeHeight = height > 0 ? height : 240
  const scale = Math.min(1, DISPLAY_MAX_PX / Math.max(safeWidth, safeHeight))
  const pxWidth = Math.max(1, Math.round(safeWidth * scale))
  const pxHeight = Math.max(1, Math.round(safeHeight * scale))
  return { cx: pxWidth * EMU_PER_PX, cy: pxHeight * EMU_PER_PX, pxWidth, pxHeight }
}

function drawingAnchorXml(anchor: Anchor): string {
  return `<xdr:oneCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${anchor.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.row}</xdr:row><xdr:rowOff>${anchor.offsetY}</xdr:rowOff></xdr:from>
<xdr:ext cx="${anchor.cx}" cy="${anchor.cy}"/>
<xdr:pic>
<xdr:nvPicPr><xdr:cNvPr id="${anchor.id}" name="Picture ${anchor.id}"/><xdr:cNvPicPr/></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="${anchor.relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${anchor.cx}" cy="${anchor.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic>
<xdr:clientData/>
</xdr:oneCellAnchor>`
}

export function buildXlsx(questions: Question[], options: XlsxBuildOptions = {}): XlsxBuildResult {
  const media = options.media
  const includeMedia = options.includeMediaColumns ?? (media ? media.size > 0 : false)
  const columnCount = includeMedia ? COLUMN_COUNT : 15

  const strings = new Map<string, number>()
  const sst: string[] = []
  function addSharedString(s: string): number {
    const existing = strings.get(s)
    if (existing !== undefined) return existing
    const idx = sst.length
    sst.push(s)
    strings.set(s, idx)
    return idx
  }

  const mediaParts: { name: string; bytes: Uint8Array }[] = []
  const mediaRelIds = new Map<string, string>()
  const anchors: Anchor[] = []
  let imagesIncluded = 0
  let imagesMissing = 0

  function ensureMedia(id: string): { relId: string; cx: number; cy: number; pxHeight: number } | null {
    const existing = mediaRelIds.get(id)
    if (existing) {
      const entry = media?.get(id)
      if (!entry) return null
      const size = displaySize(entry.width, entry.height)
      return { relId: existing, cx: size.cx, cy: size.cy, pxHeight: size.pxHeight }
    }
    const entry = media?.get(id)
    if (!entry) return null
    const ext = entry.mime === 'image/png' ? 'png' : 'jpeg'
    const name = `xl/media/image${mediaParts.length + 1}.${ext}`
    mediaParts.push({ name, bytes: entry.bytes })
    const relId = `rId${mediaParts.length}`
    mediaRelIds.set(id, relId)
    const size = displaySize(entry.width, entry.height)
    return { relId, cx: size.cx, cy: size.cy, pxHeight: size.pxHeight }
  }

  let sheetRows = ''
  let rowNum = 0

  function addRow(cells: { col: number; value: string }[], rowHeightPt: number) {
    rowNum++
    const cellsXml = cells
      .map((c) => `<c r="${colLetter(c.col)}${rowNum}" t="s"><v>${addSharedString(c.value)}</v></c>`)
      .join('')
    const heightAttr = rowHeightPt > 0 ? ` ht="${rowHeightPt}" customHeight="1"` : ''
    sheetRows += `<row r="${rowNum}" spans="1:${columnCount}"${heightAttr}>${cellsXml}</row>`
  }

  const headerCopy = options.headers ?? TEMPLATE_COPY.zh.headers
  const headers: { col: number; value: string }[] = [
    { col: 0, value: headerCopy.stem },
    { col: 1, value: headerCopy.type },
    ...headerCopy.options.map((value, i) => ({ col: 2 + i, value })),
    { col: 10, value: headerCopy.answer },
    { col: 11, value: headerCopy.analysis },
    { col: 12, value: headerCopy.subject },
    { col: 13, value: headerCopy.chapter },
    { col: 14, value: headerCopy.difficulty },
  ]
  if (includeMedia) {
    headers.push({ col: FIRST_MEDIA_COLUMN, value: headerCopy.stemImage })
    headerCopy.optionImages.forEach((value, i) => {
      headers.push({ col: FIRST_MEDIA_COLUMN + 1 + i, value })
    })
  }
  addRow(headers, 0)

  for (const q of questions) {
    const stem = q.stem.trim()
    const qtype = chineseType(q.type)
    const analysis = q.analysis.trim()
    const answer = q.answer.trim()
    const options = q.options.map((o) => o.trim())

    const finalAnswer =
      q.type === 'single_choice' || q.type === 'multi_choice'
        ? answerLetter(answer, options)
        : q.type === 'true_false'
          ? trueFalseAnswer(answer)
          : answer

    const cells: { col: number; value: string }[] = [
      { col: 0, value: stem },
      { col: 1, value: qtype },
    ]

    for (let i = 0; i < options.length && i < 8; i++) {
      cells.push({ col: 2 + i, value: options[i]! })
    }

    if (q.type === 'fill_blank' && answer.includes('|')) {
      const parts = answer.split('|').map((s) => s.trim())
      for (let i = 0; i < parts.length && i < 8; i++) {
        if (parts[i]) {
          const existingIdx = cells.findIndex((c) => c.col === 2 + i)
          if (existingIdx >= 0) cells[existingIdx] = { col: 2 + i, value: parts[i]! }
          else cells.push({ col: 2 + i, value: parts[i]! })
        }
      }
    }

    cells.push({ col: 10, value: finalAnswer })
    cells.push({ col: 11, value: analysis || '' })
    cells.push({ col: 12, value: q.subject || '' })
    cells.push({ col: 13, value: q.chapter || '' })
    cells.push({ col: 14, value: q.difficulty || '' })

    let rowHeightPt = 0
    if (includeMedia) {
      const offsets = new Map<number, number>()
      for (const item of q.media ?? []) {
        const resolved = ensureMedia(item.id)
        if (!resolved) {
          imagesMissing++
          continue
        }
        const col = mediaColumnIndex(item)
        const offsetY = offsets.get(col) ?? 0
        anchors.push({
          id: anchors.length + 2,
          row: rowNum,
          col,
          relId: resolved.relId,
          offsetY,
          cx: resolved.cx,
          cy: resolved.cy,
        })
        const nextOffset = offsetY + resolved.cy + IMAGE_GAP_PX * EMU_PER_PX
        offsets.set(col, nextOffset)
        rowHeightPt = Math.max(rowHeightPt, Math.min(409, Math.ceil((nextOffset / EMU_PER_PX) * 0.75)))
        imagesIncluded++
      }
    }

    addRow(cells, rowHeightPt)
  }

  const colsXml = includeMedia
    ? `<cols><col min="${FIRST_MEDIA_COLUMN + 1}" max="${LAST_MEDIA_COLUMN + 1}" width="28" customWidth="1"/></cols>`
    : ''

  const drawingXml = anchors.length > 0
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.map(drawingAnchorXml).join('')}</xdr:wsDr>`
    : ''

  const drawingRelsXml = mediaParts.length > 0
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${mediaParts
        .map((part, idx) => `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${part.name.split('/').pop()}"/>`)
        .join('')}</Relationships>`
    : ''

  const sheetRelsXml = anchors.length > 0
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`
    : ''

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${colsXml}<sheetData>${sheetRows}</sheetData>${anchors.length > 0 ? '<drawing r:id="rId1"/>' : ''}</worksheet>`

  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">${sst.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`).join('')}</sst>`

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Heiti SC Light"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${anchors.length > 0 ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const encoder = new TextEncoder()
  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml) },
    { name: 'xl/sharedStrings.xml', data: encoder.encode(sstXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
  ]

  if (anchors.length > 0) {
    files.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: encoder.encode(sheetRelsXml) })
    files.push({ name: 'xl/drawings/drawing1.xml', data: encoder.encode(drawingXml) })
    files.push({ name: 'xl/drawings/_rels/drawing1.xml.rels', data: encoder.encode(drawingRelsXml) })
    for (const part of mediaParts) files.push({ name: part.name, data: part.bytes })
  }

  return { buffer: createZip(files), imagesIncluded, imagesMissing }
}

function createZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder()
  const localHeaders: Uint8Array[] = []
  const centralHeaders: Uint8Array[] = []
  let centralSize = 0
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const crc = crc32(file.data)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, file.data.length, true)
    lv.setUint32(22, file.data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)

    localHeaders.push(localHeader, file.data)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, file.data.length, true)
    cv.setUint32(24, file.data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    centralHeader.set(nameBytes, 46)

    centralHeaders.push(centralHeader)
    centralSize += centralHeader.length
    offset += localHeader.length + file.data.length
  }

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const totalSize =
    localHeaders.reduce((acc, h) => acc + h.length, 0) +
    centralHeaders.reduce((acc, h) => acc + h.length, 0) +
    eocd.length

  const result = new Uint8Array(totalSize)
  let pos = 0
  for (const h of localHeaders) {
    result.set(h, pos)
    pos += h.length
  }
  for (const h of centralHeaders) {
    result.set(h, pos)
    pos += h.length
  }
  result.set(eocd, pos)
  return result
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
