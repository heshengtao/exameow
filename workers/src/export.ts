const TYPE_MAP: Record<string, string> = {
  single_choice: '单选题',
  multi_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
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

export function generateXlsxBuffer(questions: import('./types').Question[]): Uint8Array {
  const strings: Map<string, number> = new Map()
  const sst: string[] = []

  function addSharedString(s: string): number {
    if (strings.has(s)) return strings.get(s)!
    const idx = sst.length
    sst.push(s)
    strings.set(s, idx)
    return idx
  }

  let sheetRows = ''
  let rowNum = 0

  function addRow(cells: { col: number; value: string }[]) {
    rowNum++
    const cellsXml = cells
      .map((c) => {
        const si = addSharedString(c.value)
        return `<c r="${colLetter(c.col)}${rowNum}" t="s"><v>${si}</v></c>`
      })
      .join('')
    sheetRows += `<row r="${rowNum}" spans="1:15">${cellsXml}</row>`
  }

  const headers = [
    { col: 0, value: '题干（必填）' },
    { col: 1, value: '题型 （必填）' },
    ...Array.from({ length: 8 }, (_, i) => ({
      col: 2 + i,
      value: `选项 ${String.fromCharCode(65 + i)}`,
    })),
    { col: 10, value: '正确答案\n（必填）' },
    { col: 11, value: '解析\n（勿删）' },
    { col: 12, value: '学科' },
    { col: 13, value: '章节\n（勿删）' },
    { col: 14, value: '难度' },
  ]
  addRow(headers)

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
      cells.push({ col: 2 + i, value: options[i] })
    }

    if (q.type === 'fill_blank' && answer.includes('|')) {
      const parts = answer.split('|').map((s) => s.trim())
      for (let i = 0; i < parts.length && i < 8; i++) {
        if (parts[i]) {
          const existingIdx = cells.findIndex((c) => c.col === 2 + i)
          if (existingIdx >= 0) {
            cells[existingIdx] = { col: 2 + i, value: parts[i] }
          } else {
            cells.push({ col: 2 + i, value: parts[i] })
          }
        }
      }
    }

    cells.push({ col: 10, value: finalAnswer })
    cells.push({ col: 11, value: analysis || '' })
    cells.push({ col: 12, value: q.subject || '' })
    cells.push({ col: 13, value: q.chapter || '' })
    cells.push({ col: 14, value: q.difficulty || '' })

    addRow(cells)
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${sheetRows}</sheetData></worksheet>`

  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">${sst.map((s) => `<si><t>${escapeXml(s)}</t></si>`).join('')}</sst>`

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
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
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

  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: new TextEncoder().encode(contentTypes) },
    { name: '_rels/.rels', data: new TextEncoder().encode(rootRels) },
    { name: 'xl/workbook.xml', data: new TextEncoder().encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: new TextEncoder().encode(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: new TextEncoder().encode(sheetXml) },
    { name: 'xl/sharedStrings.xml', data: new TextEncoder().encode(sstXml) },
    { name: 'xl/styles.xml', data: new TextEncoder().encode(stylesXml) },
  ]

  return createZip(files)
}

export function generateCsvContent(questions: import('./types').Question[]): string {
  const headers = ['题干', '题型', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '选项G', '选项H', '正确答案', '解析', '学科', '章节', '难度']

  const rows = questions.map((q) => [
    q.stem,
    chineseType(q.type),
    q.options[0] || '',
    q.options[1] || '',
    q.options[2] || '',
    q.options[3] || '',
    q.options[4] || '',
    q.options[5] || '',
    q.options[6] || '',
    q.options[7] || '',
    q.answer,
    q.analysis,
    q.subject || '',
    q.chapter || '',
    q.difficulty || '',
  ])

  const csvRows = [headers, ...rows].map((r) =>
    r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
  )
  return '\uFEFF' + csvRows.join('\n')
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
    lv.setUint32(0, 0x04034b50, true) // signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // flags (UTF-8)
    lv.setUint16(8, 0, true) // compression (store)
    lv.setUint16(10, 0, true) // mod time
    lv.setUint16(12, 0, true) // mod date
    lv.setUint32(14, crc, true)
    lv.setUint32(18, file.data.length, true) // compressed size
    lv.setUint32(22, file.data.length, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra field length
    localHeader.set(nameBytes, 30)

    localHeaders.push(localHeader)
    localHeaders.push(file.data)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true) // signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0x0800, true) // flags (UTF-8)
    cv.setUint16(10, 0, true) // compression (store)
    cv.setUint16(12, 0, true) // mod time
    cv.setUint16(14, 0, true) // mod date
    cv.setUint32(16, crc, true)
    cv.setUint32(20, file.data.length, true)
    cv.setUint32(24, file.data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true) // extra field length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // local header offset
    centralHeader.set(nameBytes, 46)

    centralHeaders.push(centralHeader)
    centralSize += centralHeader.length
    offset += localHeader.length + file.data.length
  }

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // disk start
  ev.setUint16(8, files.length, true) // entries on disk
  ev.setUint16(10, files.length, true) // total entries
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true) // comment length

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
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320
      } else {
        crc = crc >>> 1
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
