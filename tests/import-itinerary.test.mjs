import assert from 'node:assert/strict'
import test from 'node:test'
import { importItinerary, validateApiBody } from '../node_modules/.tmp-tsnode/api/ai.js'
import { createApp } from '../server/index.mjs'

test('import validates input, preserves structured source and saves through the authenticated API', async () => {
  for (const text of ['', ' ', 42, 'a'.repeat(20_001)]) {
    assert.throws(() => validateApiBody({ op: 'import', text }))
  }
  const plan = {
    meta: { destination: '大理', days: 1 }, greeting: '按原文整理。', closing: '', disclaimer: '请核对',
    days: [{ dayIndex: 1, date: '', theme: '古城', segments: [
      { period: 'morning', items: [{ type: 'sight', name: '大理古城', timeHint: '', costHint: '', butlerTip: '慢慢逛' }] },
      { period: 'afternoon', items: [] }, { period: 'evening', items: [] },
    ] }],
  }
  let calls = 0
  const env = { PUBLIC_ORIGIN: 'http://localhost:5173', DEEPSEEK_API_KEY: 'test-only', AMAP_WEB_SERVICE_KEY: 'test-only' }
  const fetcher = async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions')
    calls++
    const body = JSON.parse(init.body)
    assert.equal(JSON.parse(body.messages[1].content).sourceText, '第一天：大理古城，慢慢逛')
    return Response.json({ choices: [{ message: { content: JSON.stringify(plan) } }] })
  }
  const app = await createApp({ env, dbPath: ':memory:', fetcher })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${app.server.address().port}`
  let cookie = ''
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { origin: env.PUBLIC_ORIGIN, 'content-type': 'application/json', cookie }, body: JSON.stringify(body) })
  try {
    assert.equal((await post('/api/ai', { op: 'import', text: '第一天：大理古城，慢慢逛' })).status, 401)
    assert.equal(calls, 0)
    const register = await post('/api/auth/register', { username: 'import1', password: 'test-pass123' })
    assert.equal(register.status, 201)
    cookie = register.headers.get('set-cookie').split(';')[0]
    const response = await post('/api/ai', { op: 'import', text: '第一天：大理古城，慢慢逛' })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), plan)
    assert.equal(calls, 1) // No weather/map enrichment or replanning call.
    assert.equal((await post('/api/itineraries', { plan })).status, 201)
    const history = await fetch(base + '/api/itineraries', { headers: { cookie } }).then(r => r.json())
    assert.deepEqual(history[0].plan, plan)
  } finally { await app.close() }
  await assert.rejects(importItinerary('不是行程', env, async () => Response.json({ choices: [{ message: { content: '{"error":"无行程"}' } }] })), { status: 422 })
  await assert.rejects(importItinerary('内容', env, async () => Response.json({ choices: [{ message: { content: '{}' } }] })))
})
