// Run focused TS tests with the existing compiler, without an extra test dependency.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const ts = require(path.join(root, 'frontend/node_modules/typescript'))
const resolve = Module._resolveFilename
Module._resolveFilename = function (id, parent, ...args) {
  return resolve.call(this, id === '@exameow/shared' ? path.join(root, 'packages/shared/src/index.ts') : id, parent, ...args)
}
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename)
}
for (const name of ['chapters', 'practiceFilter', 'questionMetadata', 'importParser']) {
  require(path.join(root, `frontend/src/utils/${name}.test.ts`))
}
const direct = require(path.join(root, 'frontend/src/utils/aiClient.ts'))
const worker = require(path.join(root, 'workers/src/exam.ts'))
const params = { question_types: ['single_choice'], count: 1, difficulty: 'easy', language: 'en', topic_filter: 'Science' }
for (const auto_chapter of [undefined, false, true]) {
  const input = { ...params, auto_chapter, chapter_names: ['Chapter 1', 'Chapter 2'] }
  assert.equal(direct.buildSystemPrompt(auto_chapter), worker.buildSystemPrompt(auto_chapter))
  assert.equal(direct.buildUserPrompt('Content', input), worker.buildUserPrompt('Content', input))
  assert.equal(direct.buildSystemPrompt(auto_chapter).includes('also include "chapter"'), !!auto_chapter)
  assert.equal(direct.buildUserPrompt('Content', input).includes('["Chapter 1","Chapter 2"]'), !!auto_chapter)
}
const exporter = require(path.join(root, 'workers/src/export.ts'))
const parser = require(path.join(root, 'frontend/src/utils/importParser.ts'))
const { groupChapters } = require(path.join(root, 'frontend/src/utils/chapters.ts'))
const questions = ['第一章', '第二章', undefined, '第一章'].map((chapter, i) => ({ id: String(i), type: 'single_choice', stem: `Q${i}`, options: ['A', 'B'], answer: 'A', analysis: '', chapter }))
for (const analysis of [parser.analyzeCSV(exporter.generateCsvContent(questions)), parser.analyzeExcel(exporter.generateXlsxBuffer(questions))]) {
  assert.ok(analysis)
  assert.deepEqual(groupChapters(parser.parseWithMapping(analysis, analysis.mapping, 'test')), groupChapters(questions))
}
async function testTransport() {
  const originalFetch = global.fetch
  let requests = 0
  global.fetch = async (_url, request) => {
    requests++
    const body = JSON.parse(request.body)
    assert.match(body.messages[0].content, /also include "chapter"/)
    assert.match(body.messages[1].content, /Chapter 1/)
    return Response.json({ choices: [{ message: { content: JSON.stringify([
      { id: 'q1', type: 'single_choice', stem: 'Q', options: ['A', 'B'], answer: 'A', analysis: '', chapter: 'Chapter 1' },
    ]) } }] })
  }
  try {
    const generated = await direct.callCustomAI('Content', { ...params, auto_chapter: true, chapter_names: ['Chapter 1'] }, { endpoint: 'https://example.invalid/v1', api_key: 'test', model: 'test' })
    assert.equal(generated[0].chapter, 'Chapter 1')
    assert.equal(requests, 1)
  } finally { global.fetch = originalFetch }
  const ai = { run: async (_model, body) => {
    assert.match(body.messages[0].content, /also include "chapter"/)
    assert.match(body.messages[1].content, /Chapter 1/)
    return Response.json({ response: JSON.stringify([{ id: 'q1', type: 'short_answer', stem: 'Q', answer: 'A', analysis: '', chapter: 'Chapter 1' }]) })
  } }
  const generated = await worker.generateExam(ai, 'Content', { ...params, auto_chapter: true, chapter_names: ['Chapter 1'] }, 'test')
  assert.equal(generated[0].chapter, 'Chapter 1')
  console.log('Chapter grouping, filters, imports, metadata, prompt parity and AI transport tests passed')
}
testTransport().catch(error => { console.error(error); process.exitCode = 1 })
