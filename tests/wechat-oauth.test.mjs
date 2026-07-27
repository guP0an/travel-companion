import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WechatOauthError,
  buildWechatAuthorizeUrl,
  createOauthState,
  exchangeWechatOauthCode,
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
