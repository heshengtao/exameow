const assert = require('node:assert/strict')
const path = require('node:path')
const dir = process.argv[2]
const { resolveAIOptions, aiRequestParameters, withAdditionalPrompt } = require(path.join(dir, 'packages/shared/src/aiOptions.js'))
const { runAIRequest, AIHttpError } = require(path.join(dir, 'packages/shared/src/aiRequest.js'))
const { aiChat } = require(path.join(dir, 'workers/src/ai.js'))

async function test() {
  assert.deepEqual(aiRequestParameters(), { max_tokens: 16384, temperature: 0.7 })
  assert.deepEqual(aiRequestParameters({ thinking: 'off', temperature: null }), { max_tokens: 16384, reasoning_effort: 'none' })
  assert.deepEqual(aiRequestParameters({ thinking: 'on', reasoning_effort: 'high', token_parameter: 'max_completion_tokens', max_tokens: 2048, temperature: 0 }), { max_completion_tokens: 2048, temperature: 0, reasoning_effort: 'high' })
  for (const invalid of [{ retries: 6 }, { timeout_seconds: 0 }, { max_tokens: 1.5 }, { temperature: NaN }, { temperature: '' }, { prompt: 'x'.repeat(20001) }]) {
    assert.throws(() => resolveAIOptions(invalid))
  }
  assert.match(withAdditionalPrompt('Required JSON', { prompt: 'Be clear' }), /^Required JSON[\s\S]*Be clear[\s\S]*required output format/)
  let calls = 0
  assert.equal(await runAIRequest(async () => { if (++calls === 1) throw new AIHttpError(503, 'busy'); return 'ok' }, { retries: 1 }), 'ok')
  assert.equal(calls, 2)
  calls = 0
  await assert.rejects(runAIRequest(async () => { calls++; throw new AIHttpError(400, 'bad') }, { retries: 3 }), /400/)
  assert.equal(calls, 1)
  calls = 0
  await assert.rejects(runAIRequest(async () => { calls++; throw new AIHttpError(429, 'busy') }, { retries: 1 }), /429/)
  assert.equal(calls, 2)
  calls = 0
  await assert.rejects(runAIRequest(signal => { calls++; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }, { timeout_seconds: 1, retries: 1 }), { name: 'TimeoutError' })
  assert.equal(calls, 2)
  const cancel = new AbortController()
  calls = 0
  const pending = runAIRequest(async () => { calls++; throw new AIHttpError(503, 'busy') }, { retries: 5 }, cancel.signal)
  setTimeout(() => cancel.abort(), 50)
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(calls, 1)
  const stopped = new AbortController(); stopped.abort()
  await assert.rejects(runAIRequest(async () => { throw Error('must not run') }, {}, stopped.signal), { name: 'AbortError' })
  const options = resolveAIOptions({ thinking: 'on', reasoning_effort: 'high', prompt: 'Detailed explanations', temperature: null, retries: 1 })
  calls = 0
  const ai = { run: async (model, body, transport) => {
    calls++
    assert.equal(model, 'test-model')
    assert.equal(body.reasoning_effort, 'high')
    assert.equal(body.temperature, undefined)
    assert.match(body.messages[0].content, /Detailed explanations/)
    assert.ok(transport.signal)
    return calls === 1 ? new Response('busy', { status: 503 }) : Response.json({ response: 'answer' })
  } }
  assert.equal(await aiChat(ai, { model: 'test-model', systemPrompt: 'System', userPrompt: 'User', options }), 'answer')
  assert.equal(calls, 2)
  console.log('AI options, retry limits, timeout, cancellation and Worker transport tests passed')
}
test().catch(error => { console.error(error); process.exitCode = 1 })
