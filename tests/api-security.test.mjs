import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ApiError,
  assertItinerary,
  collectWeatherFacts,
  createRateLimiter,
  dateRange,
  fetchWalkingRoute,
  redactSensitiveText,
  searchAmapPoi,
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

test('date range is deterministic and ticket text is redacted', () => {
  assert.deepEqual(dateRange('2026-07-13', 3), ['2026-07-13', '2026-07-14', '2026-07-15'])
  assert.deepEqual(dateRange('not-a-date', 3), [])
  const redacted = redactSensitiveText('入住人：谷盼盼\n手机号 13800138000\n邮箱 a@example.com\n车次 G123')
  assert.doesNotMatch(redacted, /谷盼盼|13800138000|a@example\.com/)
  assert.match(redacted, /车次 G123/)
})

test('weather facts are collected before itinerary generation', async () => {
  const calls = []
  const facts = await collectWeatherFacts(
    { destination: '杭州', departureDate: '2026-07-13', days: 2 },
    async (url) => {
      calls.push(String(url))
      if (String(url).includes('geocoding-api')) {
        return new Response(JSON.stringify({ results: [{ latitude: 30.27, longitude: 120.15 }] }), { status: 200 })
      }
      return new Response(JSON.stringify({
        daily: {
          time: ['2026-07-13', '2026-07-14'],
          weather_code: [0, 61],
          temperature_2m_max: [33.2, 29.8],
          temperature_2m_min: [25.1, 23.7],
          precipitation_probability_max: [10, 80],
        },
      }), { status: 200 })
    },
  )
  assert.equal(calls.length, 2)
  assert.deepEqual(facts, [
    { date: '2026-07-13', text: '晴', tMin: 25, tMax: 33, precipitationProbability: 10 },
    { date: '2026-07-14', text: '有雨', tMin: 24, tMax: 30, precipitationProbability: 80 },
  ])
})

test('Amap POI and walking route responses become structured facts', async () => {
  const poi = await searchAmapPoi('西湖', '杭州', 'server-key', async (url) => {
    assert.match(String(url), /restapi\.amap\.com\/v5\/place\/text/)
    return new Response(JSON.stringify({
      status: '1',
      pois: [{
        id: 'B001', name: '西湖风景名胜区', location: '120.15,30.25', address: '西湖区', cityname: '杭州市',
        business: { opentime_week: '周一至周日 全天', rating: '4.9' },
      }],
    }), { status: 200 })
  })
  assert.equal(poi?.name, '西湖风景名胜区')
  assert.equal(poi?.openingHours, '周一至周日 全天')

  const route = await fetchWalkingRoute(poi, { ...poi, id: 'B002', name: '断桥', location: '120.16,30.26' }, 'server-key', async (url) => {
    assert.match(String(url), /restapi\.amap\.com\/v5\/direction\/walking/)
    return new Response(JSON.stringify({ status: '1', route: { paths: [{ distance: '1800', cost: { duration: '1500' } }] } }), { status: 200 })
  })
  assert.deepEqual(route, { from: '西湖风景名胜区', to: '断桥', distanceMeters: 1800, durationMinutes: 25 })
})
