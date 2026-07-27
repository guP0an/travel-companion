import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WechatOauthError,
  buildWechatAuthorizeUrl,
  createWechatMagicLink,
  createOauthState,
  exchangeWechatOauthCode,
  handleWechatOauthRequest,
  sanitizeReturnTo,
  verifyOauthState,
} from '../node_modules/.tmp-tsnode/api/wechat-oauth.js'

const stateSecret = 'a-long-oauth-state-secret'
const now = Date.parse('2026-07-27T00:00:00Z')
const callbackUrl = 'https://wanwantrip.online/api/wechat-oauth?mode=h5'
const env = {
  WECHAT_H5_APP_ID: 'wx-h5-app',
  WECHAT_H5_APP_SECRET: 'h5-secret',
  WECHAT_WEB_APP_ID: 'wx-web-app',
  WECHAT_WEB_APP_SECRET: 'web-secret',
}

test('OAuth return paths stay on wanwantrip.online', () => {
  assert.equal(sanitizeReturnTo('/?trip=1'), '/?trip=1')
  assert.equal(sanitizeReturnTo('/ledger'), '/ledger')
  assert.equal(sanitizeReturnTo('https://evil.example'), '/')
  assert.equal(sanitizeReturnTo('//evil.example'), '/')
  assert.equal(sanitizeReturnTo(null), '/')
})

test('signed OAuth state rejects tampering and expiry', () => {
  const state = createOauthState('h5', '/ledger', stateSecret, now)
  assert.deepEqual(verifyOauthState(state, stateSecret, now), {
    mode: 'h5',
    returnTo: '/ledger',
  })
  assert.throws(() => verifyOauthState(`${state}x`, stateSecret, now), WechatOauthError)
  assert.throws(() => verifyOauthState(state, stateSecret, now + 601_000), WechatOauthError)
})

test('OAuth state rejects weak server secrets', () => {
  assert.throws(() => createOauthState('web', '/', 'short', now), WechatOauthError)
})

test('H5 and PC authorization URLs use their own app credentials', () => {
  const h5 = new URL(buildWechatAuthorizeUrl('h5', 'signed-state', callbackUrl, env))
  assert.equal(h5.origin, 'https://open.weixin.qq.com')
  assert.equal(h5.pathname, '/connect/oauth2/authorize')
  assert.equal(h5.searchParams.get('appid'), 'wx-h5-app')
  assert.equal(h5.searchParams.get('scope'), 'snsapi_base')
  assert.equal(h5.searchParams.get('state'), 'signed-state')

  const web = new URL(buildWechatAuthorizeUrl(
    'web',
    'signed-state',
    callbackUrl.replace('mode=h5', 'mode=web'),
    env,
  ))
  assert.equal(web.pathname, '/connect/qrconnect')
  assert.equal(web.searchParams.get('appid'), 'wx-web-app')
  assert.equal(web.searchParams.get('scope'), 'snsapi_login')
})

test('web OAuth code is exchanged only on the server', async () => {
  let requested = ''
  const identity = await exchangeWechatOauthCode('web', 'oauth-code-123', env, async (url) => {
    requested = String(url)
    return new Response(JSON.stringify({ openid: 'openid-1', unionid: 'unionid-1' }), { status: 200 })
  })

  const parsed = new URL(requested)
  assert.equal(parsed.origin, 'https://api.weixin.qq.com')
  assert.equal(parsed.pathname, '/sns/oauth2/access_token')
  assert.equal(parsed.searchParams.get('appid'), 'wx-web-app')
  assert.equal(parsed.searchParams.get('secret'), 'web-secret')
  assert.equal(parsed.searchParams.get('code'), 'oauth-code-123')
  assert.deepEqual(identity, { openid: 'openid-1', unionid: 'unionid-1' })
})

test('provider errors are rejected without exposing credentials', async () => {
  await assert.rejects(
    exchangeWechatOauthCode('h5', 'oauth-code-123', env, async () =>
      new Response(JSON.stringify({ errcode: 40029, errmsg: 'invalid code' }), { status: 200 })),
    (error) => error instanceof WechatOauthError && error.status === 401,
  )
})

function mockResponse() {
  const headers = {}
  return {
    statusCode: 200,
    headers,
    body: '',
    setHeader(name, value) {
      headers[name.toLowerCase()] = value
    },
    end(value = '') {
      this.body = value
    },
  }
}

function mockRequest(path, cookie = '') {
  const url = new URL(path, 'https://wanwantrip.online')
  return {
    method: 'GET',
    headers: { cookie },
    query: Object.fromEntries(url.searchParams),
  }
}

const configuredEnv = {
  ...env,
  WECHAT_OAUTH_STATE_SECRET: stateSecret,
  WECHAT_OAUTH_ORIGIN: 'https://wanwantrip.online',
  WECHAT_IDENTITY_PEPPER: 'a-long-test-identity-pepper',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: 'supabase-secret',
}

test('status exposes provider availability without exposing secrets', async () => {
  const req = mockRequest('/api/wechat-oauth?mode=status')
  const res = mockResponse()
  await handleWechatOauthRequest(req, res, configuredEnv)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.body), { h5: true, web: true })
  assert.doesNotMatch(res.body, /secret/)
})

test('OAuth start sets HttpOnly state and redirects to WeChat', async () => {
  const req = mockRequest('/api/wechat-oauth?mode=h5&returnTo=%2Fledger')
  const res = mockResponse()
  await handleWechatOauthRequest(req, res, configuredEnv)

  assert.equal(res.statusCode, 302)
  assert.match(res.headers['set-cookie'], /wanwan_wechat_oauth_state=/)
  assert.match(res.headers['set-cookie'], /HttpOnly/)
  assert.match(res.headers['set-cookie'], /SameSite=Lax/)
  assert.match(res.headers.location, /^https:\/\/open\.weixin\.qq\.com\/connect\/oauth2\/authorize/)
})

test('callback rejects a state that does not match its cookie', async () => {
  const req = mockRequest('/api/wechat-oauth?mode=h5&code=oauth-code-123&state=signed')
  const res = mockResponse()
  await handleWechatOauthRequest(req, res, configuredEnv)

  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, 'https://wanwantrip.online/?wechat=failed')
})

test('callback resolves the WeChat user and redirects through Supabase verify', async () => {
  const state = createOauthState('web', '/ledger?tab=mine', stateSecret, now)
  const req = mockRequest(
    `/api/wechat-oauth?mode=web&code=oauth-code-123&state=${encodeURIComponent(state)}`,
    `wanwan_wechat_oauth_state=${encodeURIComponent(state)}`,
  )
  const res = mockResponse()
  let resolvedOpenid = ''
  let linkedUserId = ''
  const store = {
    async findUserId(openidHash) {
      resolvedOpenid = openidHash
      return '00000000-0000-4000-8000-000000000001'
    },
    async createUser() { throw new Error('must reuse existing user') },
    async bindIdentity() { return false },
    async touchIdentity() {},
    async deleteUser() {},
  }

  await handleWechatOauthRequest(
    req,
    res,
    configuredEnv,
    async () => new Response(JSON.stringify({ openid: 'openid-1', unionid: 'unionid-1' }), { status: 200 }),
    store,
    async (userId, returnTo) => {
      linkedUserId = userId
      assert.equal(returnTo, '/ledger?tab=mine')
      return 'https://project.supabase.co/auth/v1/verify?token=one-time'
    },
    now,
  )

  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, 'https://project.supabase.co/auth/v1/verify?token=one-time')
  assert.equal(linkedUserId, '00000000-0000-4000-8000-000000000001')
  assert.equal(resolvedOpenid.length, 64)
  assert.match(res.headers['set-cookie'], /Max-Age=0/)
})

test('Magic Link handoff confirms an existing WeChat user without exposing its email', async () => {
  const calls = []
  const admin = {
    auth: {
      admin: {
        async getUserById(userId) {
          calls.push(['get', userId])
          return { data: { user: { id: userId, email: null } }, error: null }
        },
        async updateUserById(userId, attributes) {
          calls.push(['update', userId, attributes])
          return { data: { user: { id: userId, email: attributes.email } }, error: null }
        },
        async generateLink(options) {
          calls.push(['link', options])
          return {
            data: {
              properties: {
                action_link: 'https://project.supabase.co/auth/v1/verify?token=one-time',
              },
            },
            error: null,
          }
        },
      },
    },
  }

  const actionLink = await createWechatMagicLink(
    '00000000-0000-4000-8000-000000000001',
    '/ledger',
    configuredEnv,
    admin,
  )

  assert.equal(actionLink, 'https://project.supabase.co/auth/v1/verify?token=one-time')
  assert.deepEqual(calls[1], [
    'update',
    '00000000-0000-4000-8000-000000000001',
    {
      email: '00000000-0000-4000-8000-000000000001@wechat.wanwan.invalid',
      email_confirm: true,
    },
  ])
  assert.equal(calls[2][1].type, 'magiclink')
  assert.equal(
    calls[2][1].options.redirectTo,
    'https://wanwantrip.online/ledger?wechat=success',
  )
})
