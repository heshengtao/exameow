import type { Question, QuestionBank } from '@exameow/shared'

/**
 * Word 导出:按正式试卷模板生成两份文档
 *  - 《题库名》试题卷.doc   (无答案,含姓名/部门/得分栏)
 *  - 《题库名》答案卷.doc   (含参考答案与解析,供批改/自学)
 * 以 Word 可识别的 HTML 格式生成(.doc),零依赖。
 */

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题',
  multi_choice: '多选题',
  fill_blank: '填空题',
  true_false: '判断题',
  short_answer: '简答题',
}

const SECTION_ORDER = ['single_choice', 'multi_choice', 'fill_blank', 'true_false', 'short_answer']
const CN_NUM = ['一', '二', '三', '四', '五', '六']
const OPT_LETTERS = 'ABCDEFGH'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || 'exameow_bank'
}

function fmtDate(): string {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function typeCounts(qs: Question[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const q of qs) counts[q.type] = (counts[q.type] ?? 0) + 1
  return counts
}

function buildPaperBody(questions: Question[], withAnswers: boolean, withAnalysis: boolean): string {
  const groups = new Map<string, Question[]>()
  for (const t of SECTION_ORDER) groups.set(t, [])
  for (const q of questions) {
    if (!groups.has(q.type)) groups.set(q.type, [])
    groups.get(q.type)!.push(q)
  }

  let body = ''
  let num = 0
  for (const t of SECTION_ORDER) {
    const qs = groups.get(t) ?? []
    if (qs.length === 0) continue
    const scores = new Set(qs.map((q) => q.score).filter((s): s is number => typeof s === 'number' && s > 0))
    const scoreNote = scores.size === 1 ? `(每题 ${[...scores][0]} 分)` : ''
    body += `<h2 class="section">${cnSectionIndex(t)}、${TYPE_LABELS[t] ?? t}${scoreNote}(共 ${qs.length} 题)</h2>`
    for (const q of qs) {
      num += 1
      body += `<p class="q"><b>${num}.</b> ${esc(q.stem)}</p>`
      if (q.options && q.options.length > 0) {
        for (let i = 0; i < q.options.length; i++) {
          body += `<p class="opt">${OPT_LETTERS[i]}. ${esc(q.options[i] ?? '')}</p>`
        }
      }
      if (withAnswers) {
        body += `<p class="answer"><b>参考答案：</b>${esc(q.answer)}</p>`
        if (withAnalysis && q.analysis) {
          body += `<p class="analysis"><b>解析：</b>${esc(q.analysis)}</p>`
        }
      }
    }
  }
  return body
}

// 用常量表把题型映射到中文序号,避免依赖 body 长度做不可靠推断
function cnSectionIndex(t: string): string {
  return CN_NUM[SECTION_ORDER.indexOf(t)] ?? ''
}

function typeSummary(qs: Question[]): string {
  const counts = typeCounts(qs)
  const parts = SECTION_ORDER
    .filter((t) => counts[t])
    .map((t) => `${TYPE_LABELS[t]} ${counts[t]} 题`)
  return parts.join('·')
}

function wrapDoc(inner: string, title: string): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 2.4cm 2.8cm; }
body { font-family: '宋体', SimSun, serif; font-size: 12pt; line-height: 1.7; color: #000; }
h1.title { font-family: '黑体', SimHei, sans-serif; font-size: 18pt; text-align: center; margin: 0 0 6pt; }
p.subtitle { text-align: center; font-size: 10.5pt; color: #333; margin: 0 0 14pt; }
table.info { width: 100%; border-collapse: collapse; margin: 0 0 12pt; font-size: 11pt; }
table.info td { border: 1px solid #000; padding: 2pt 6pt; }
h2.section { font-family: '黑体', SimHei, sans-serif; font-size: 13pt; margin: 14pt 0 6pt; }
p.q { margin: 8pt 0 2pt; }
p.opt { margin: 1pt 0 1pt 1.6em; }
p.answer { margin: 2pt 0 0 1.2em; }
p.analysis { margin: 1pt 0 8pt 1.2em; font-size: 10.5pt; color: #333; }
</style>
</head>
<body>
${inner}
</body>
</html>`
}

function downloadDoc(html: string, filename: string): void {
  const blob = new Blob(['﻿' + html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * 导出任意题目列表为两份 Word 文档,返回文件名列表
 */
export async function exportQuestionsToWord(title: string, questions: Question[]): Promise<string[]> {
  const base = sanitizeFilename(title) || 'exameow_paper'
  const infoRow = (label: string, value: string) =>
    `<td style="width:20%">${esc(label)}</td><td style="width:30%">${esc(value)}</td>`

  const paperInner = `
<h1 class="title">${esc(title)}</h1>
<p class="subtitle">(试题卷)&nbsp;&nbsp;共 ${questions.length} 题&nbsp;&nbsp;${typeSummary(questions)}&nbsp;&nbsp;${fmtDate()}</p>
<table class="info"><tr>
  ${infoRow('姓名', '____________')}${infoRow('部门', '____________')}
  ${infoRow('日期', '____________')}${infoRow('得分', '____________')}
</tr></table>
${buildPaperBody(questions, false, false)}`

  const keyInner = `
<h1 class="title">${esc(title)}</h1>
<p class="subtitle">(答案卷)&nbsp;&nbsp;共 ${questions.length} 题&nbsp;&nbsp;${typeSummary(questions)}&nbsp;&nbsp;${fmtDate()}</p>
${buildPaperBody(questions, true, true)}`

  const paperFile = `${base}_试题卷.doc`
  const keyFile = `${base}_答案卷.doc`
  downloadDoc(wrapDoc(paperInner, `${title}试题卷`), paperFile)
  downloadDoc(wrapDoc(keyInner, `${title}答案卷`), keyFile)
  return [paperFile, keyFile]
}

/**
 * 导出题库为两份 Word 文档,返回文件名列表
 */
export async function exportBankToWord(bank: QuestionBank): Promise<string[]> {
  return exportQuestionsToWord(bank.name, bank.questions)
}
