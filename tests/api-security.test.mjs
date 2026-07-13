import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ApiError,
  assertItinerary,
  createRateLimiter,
  validateApiBody,
  verifyAccessToken,
} from '../node_modules/.tmp-tsnode/api/ai.js'

const itinerary = {
  meta: { destination: '京都', days: 1 },
  greeting: '出发吧',
  days: [{
    dayIndex: 1,
    theme: '初见京都',
    segments: ['morning', 'afternoon', 'evening'].map((period) => ({
      period,
      items: [{ type: 'sight', name: '清水寺' }],
    })),
  }],
  closing: '还想怎么调整？',
  disclaimer: '请在出行前核实。',
}

test('rate limiter resets by time window', () => {
  const allow = createRateLimiter(2, 1000)
  assert.equal(allow('user-1', 0), true)
  assert.equal(allow('user-1', 1), true)
  assert.equal(allow('user-1', 2), false)
  assert.equal(allow('user-1', 1000), true)
})

test('access token is required and verified with Supabase', async () => {
  await assert.rejects(
    verifyAccessToken(undefined, {}),
    (error) => error instanceof ApiError && error.status === 401,
  )

  let request
  const user = await verifyAccessToken(
    'Bearer access-token',
    { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key' },
    async (url, init) => {
      request = { url, init }
      return new Response(JSON.stringify({ id: 'user-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  )

  assert.equal(user.id, 'user-1')
  assert.equal(request.url, 'https://example.supabase.co/auth/v1/user')
  assert.equal(request.init.headers.authorization, 'Bearer access-token')
})

test('API body validation rejects oversized and invalid requests', () => {
  assert.throws(() => validateApiBody({ op: 'plan', destination: '京都', days: 0 }), ApiError)
  assert.throws(() => validateApiBody({ op: 'extract', text: 'x'.repeat(20_001) }), ApiError)
  assert.throws(() => validateApiBody({ op: 'revise', plan: itinerary, instruction: '' }), ApiError)
  assert.doesNotThrow(() => validateApiBody({ op: 'plan', destination: '京都', days: 3 }))
})

test('itinerary validation requires all three daily periods', () => {
  assert.equal(assertItinerary(structuredClone(itinerary)).meta.destination, '京都')
  const broken = structuredClone(itinerary)
  broken.days[0].segments.pop()
  assert.throws(() => assertItinerary(broken), /缺少时段/)
})
