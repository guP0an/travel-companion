import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ApiError,
  attachWeatherAlerts,
  assertItinerary,
  buildUser,
  collectWeatherAlerts,
  collectWeatherFacts,
  createRateLimiter,
  dateRange,
  extractBookingsFromImage,
  fetchWalkingRoute,
  redactSensitiveText,
  searchAmapPoi,
  validateApiBody,
  validateVisionDataUrl,
  verifyAccessToken,
} from '../node_modules/.tmp-tsnode/api/ai.js'
import {
  friendlyAuthError,
  maskAccount,
  normalizeMainlandPhone,
} from '../node_modules/.tmp-tsnode/shared/auth.js'
import {
  createTencentSmsRequest,
  handleSmsHook,
  verifyStandardWebhook,
} from '../node_modules/.tmp-tsnode/api/send-sms.js'
import { createHmac } from 'node:crypto'

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
  assert.throws(() => validateApiBody({ op: 'vision', image: 'https://example.com/ticket.png' }), ApiError)
  assert.throws(() => validateApiBody({ op: 'revise', plan: itinerary, instruction: '' }), ApiError)
  assert.doesNotThrow(() => validateApiBody({ op: 'plan', destination: '京都', days: 3 }))
})

test('Kimi vision request uses multimodal JSON mode and removes personal fields', async () => {
  const image = `data:image/jpeg;base64,${Buffer.alloc(64, 1).toString('base64')}`
  assert.equal(validateVisionDataUrl(image), image)
  assert.throws(() => validateVisionDataUrl('data:image/svg+xml;base64,AAAA'), ApiError)

  let request
  const bookings = await extractBookingsFromImage(image, {
    MOONSHOT_API_KEY: 'moonshot-test-key',
    KIMI_VISION_MODEL: 'kimi-k2.6',
  }, async (url, init) => {
    request = { url, init }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        bookings: [{
          type: 'train',
          title: 'G100 上海虹桥到北京南',
          fields: { 日期: '2026-07-20', 车次: 'G100', 姓名: '测试用户', 订单号: 'secret-order' },
        }],
      }) } }],
    }), { status: 200 })
  })

  assert.equal(request.url, 'https://api.moonshot.cn/v1/chat/completions')
  assert.equal(request.init.headers.authorization, 'Bearer moonshot-test-key')
  const body = JSON.parse(request.init.body)
  assert.equal(body.model, 'kimi-k2.6')
  assert.deepEqual(body.thinking, { type: 'disabled' })
  assert.deepEqual(body.response_format, { type: 'json_object' })
  assert.equal(body.messages[1].content[0].type, 'image_url')
  assert.equal(body.messages[1].content[0].image_url.url, image)
  assert.deepEqual(bookings, [{
    type: 'train',
    title: 'G100 上海虹桥到北京南',
    fields: { 日期: '2026-07-20', 车次: 'G100' },
  }])
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

test('mainland phone auth values are normalized and masked safely', () => {
  assert.equal(normalizeMainlandPhone('138 0013 8000'), '+8613800138000')
  assert.equal(normalizeMainlandPhone('+86 13800138000'), '+8613800138000')
  assert.equal(normalizeMainlandPhone('12345'), null)
  assert.equal(maskAccount('+8613800138000', null), '+86 138****8000')
  assert.equal(friendlyAuthError('Invalid login credentials'), '账号或密码不正确')
  assert.equal(friendlyAuthError('Unsupported phone provider'), '手机短信服务尚未开通，请暂时使用邮箱登录')
})

test('Supabase SMS hook signature is verified with replay protection', () => {
  const body = JSON.stringify({ user: { phone: '+8613800138000' }, sms: { otp: '123456' } })
  const secretBytes = Buffer.from('a sufficiently long webhook secret')
  const secret = `v1,whsec_${secretBytes.toString('base64')}`
  const timestamp = 1_720_000_000
  const id = 'msg_test'
  const signature = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64')
  const headers = {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  }
  assert.doesNotThrow(() => verifyStandardWebhook(body, headers, secret, timestamp))
  assert.throws(() => verifyStandardWebhook(body, headers, secret, timestamp + 301), /stale webhook/)
  assert.throws(() => verifyStandardWebhook(`${body}x`, headers, secret, timestamp), /invalid webhook signature/)
})

test('Tencent SMS request contains a deterministic TC3 signature and no plaintext secret', () => {
  const request = createTencentSmsRequest('+8613800138000', '123456', {
    TENCENTCLOUD_SECRET_ID: 'id-test',
    TENCENTCLOUD_SECRET_KEY: 'secret-test',
    TENCENT_SMS_SDK_APP_ID: '1400000000',
    TENCENT_SMS_SIGN_NAME: '丸丸旅行',
    TENCENT_SMS_TEMPLATE_ID: '1000000',
  }, new Date('2026-07-14T00:00:00Z'))
  assert.equal(request.url, 'https://sms.tencentcloudapi.com')
  assert.match(request.init.headers.authorization, /^TC3-HMAC-SHA256 Credential=id-test\/2026-07-14\/sms\/tc3_request/)
  assert.doesNotMatch(request.init.headers.authorization, /secret-test/)
  assert.deepEqual(JSON.parse(request.init.body), {
    PhoneNumberSet: ['+8613800138000'],
    SmsSdkAppId: '1400000000',
    SignName: '丸丸旅行',
    TemplateId: '1000000',
    TemplateParamSet: ['123456'],
  })
})

test('SMS hook reads the raw body, verifies it and calls the provider once', async () => {
  const body = JSON.stringify({ user: { phone: '+8613800138000' }, sms: { otp: '123456' } })
  const secretBytes = Buffer.from('another sufficiently long secret')
  const secret = `v1,whsec_${secretBytes.toString('base64')}`
  const timestamp = Math.floor(Date.now() / 1000)
  const id = 'msg_handler_test'
  const signature = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64')
  let calls = 0
  const response = await handleSmsHook(new Request('https://example.com/api/send-sms', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    },
    body,
  }), {
    SUPABASE_SMS_HOOK_SECRET: secret,
    TENCENTCLOUD_SECRET_ID: 'id-test',
    TENCENTCLOUD_SECRET_KEY: 'secret-test',
    TENCENT_SMS_SDK_APP_ID: '1400000000',
    TENCENT_SMS_SIGN_NAME: '丸丸旅行',
    TENCENT_SMS_TEMPLATE_ID: '1000000',
  }, async () => {
    calls += 1
    return new Response(JSON.stringify({ Response: { RequestId: 'request-1', SendStatusSet: [{ Code: 'Ok' }] } }), { status: 200 })
  })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '{}')
  assert.equal(calls, 1)
})

test('current official weather alerts are fetched, filtered and grounded', async () => {
  let request
  const input = { destination: '杭州', departureDate: '2026-07-14', days: 2 }
  const alerts = await collectWeatherAlerts(input, {
    QWEATHER_API_HOST: 'abc.qweatherapi.com',
    QWEATHER_API_KEY: 'qweather-test-key',
  }, async (url, init) => {
    request = { url, init }
    return new Response(JSON.stringify({
      alerts: [
        {
          id: 'active-1',
          messageType: { code: 'alert' },
          eventType: { name: '台风' },
          severity: 'severe',
          color: { code: 'red' },
          headline: '台风红色预警',
          instruction: '停止高风险户外活动。',
          senderName: '杭州市气象台',
          issuedTime: '2026-07-14T08:00+08:00',
          expireTime: '2026-07-15T08:00+08:00',
        },
        {
          id: 'cancelled-1',
          messageType: { code: 'cancel' },
          eventType: { name: '暴雨' },
          headline: '已解除',
        },
      ],
    }), { status: 200 })
  }, { latitude: 30.27, longitude: 120.15 }, new Date('2026-07-14T00:00:00Z'))

  assert.equal(request.url, 'https://abc.qweatherapi.com/weatheralert/v1/current/30.27/120.15?lang=zh&localTime=true')
  assert.equal(request.init.headers['X-QW-Api-Key'], 'qweather-test-key')
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].event, '台风')

  const plan = attachWeatherAlerts(itinerary, alerts)
  assert.equal(plan.weatherAlerts[0].id, 'active-1')
  const prompt = buildUser(input, { weather: [], alerts, pois: [], routes: [] })
  assert.match(prompt, /最高优先级/)
  assert.match(prompt, /不得安排高风险户外活动/)
})

test('current alerts are skipped for a trip more than seven days away', async () => {
  let calls = 0
  const alerts = await collectWeatherAlerts({ destination: '杭州', departureDate: '2026-08-01' }, {
    QWEATHER_API_HOST: 'abc.qweatherapi.com',
    QWEATHER_API_KEY: 'qweather-test-key',
  }, async () => {
    calls += 1
    return new Response('{}')
  }, { latitude: 30.27, longitude: 120.15 }, new Date('2026-07-14T00:00:00Z'))

  assert.deepEqual(alerts, [])
  assert.equal(calls, 0)
})
