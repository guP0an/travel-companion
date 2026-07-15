import assert from 'node:assert/strict'
import test from 'node:test'
import { exportJWK, generateKeyPair, jwtVerify } from 'jose'

import {
  WechatAuthError,
  exchangeWechatCode,
  hashWechatIdentifier,
  mintSupabaseAccessToken,
  resolveWechatUser,
  validateWechatCode,
} from '../node_modules/.tmp-tsnode/api/wechat-auth.js'

const baseEnv = {
  WECHAT_APP_ID: 'wx-test-app',
  WECHAT_APP_SECRET: 'wechat-test-secret',
  WECHAT_IDENTITY_PEPPER: 'a-long-test-identity-pepper',
  SUPABASE_URL: 'https://example.supabase.co',
}

test('wechat login code is validated and exchanged only on the server', async () => {
  assert.equal(validateWechatCode('code_123456'), 'code_123456')
  assert.throws(() => validateWechatCode('bad code'), WechatAuthError)

  let requestUrl = ''
  const identity = await exchangeWechatCode('code_123456', baseEnv, async (url) => {
    requestUrl = String(url)
    return new Response(JSON.stringify({ openid: 'openid-1', unionid: 'unionid-1' }), { status: 200 })
  })
  const parsed = new URL(requestUrl)
  assert.equal(parsed.hostname, 'api.weixin.qq.com')
  assert.equal(parsed.pathname, '/sns/jscode2session')
  assert.equal(parsed.searchParams.get('appid'), 'wx-test-app')
  assert.equal(parsed.searchParams.get('secret'), 'wechat-test-secret')
  assert.equal(parsed.searchParams.get('js_code'), 'code_123456')
  assert.deepEqual(identity, { openid: 'openid-1', unionid: 'unionid-1' })
})

test('wechat provider errors do not create a local identity', async () => {
  await assert.rejects(
    exchangeWechatCode('code_123456', baseEnv, async () =>
      new Response(JSON.stringify({ errcode: 40029, errmsg: 'invalid code' }), { status: 200 })),
    (error) => error instanceof WechatAuthError && error.status === 401,
  )
})

test('wechat identifiers are stored as stable keyed hashes', () => {
  const first = hashWechatIdentifier('openid-1', baseEnv.WECHAT_IDENTITY_PEPPER)
  const second = hashWechatIdentifier('openid-1', baseEnv.WECHAT_IDENTITY_PEPPER)
  assert.equal(first, second)
  assert.equal(first.length, 64)
  assert.notEqual(first, hashWechatIdentifier('openid-2', baseEnv.WECHAT_IDENTITY_PEPPER))
  assert.doesNotMatch(first, /openid/)
})

test('existing and first-time WeChat users resolve to one Supabase user', async () => {
  let created = 0
  let boundUserId = ''
  const newUserStore = {
    async findUserId() { return boundUserId || null },
    async createUser() { created += 1; return '00000000-0000-4000-8000-000000000001' },
    async bindIdentity(userId) { boundUserId = userId; return true },
    async touchIdentity() {},
    async deleteUser() {},
  }
  const first = await resolveWechatUser({ openid: 'openid-1' }, baseEnv.WECHAT_IDENTITY_PEPPER, newUserStore)
  const second = await resolveWechatUser({ openid: 'openid-1' }, baseEnv.WECHAT_IDENTITY_PEPPER, newUserStore)
  assert.equal(first, second)
  assert.equal(created, 1)
})

test('minted WeChat access token carries the Supabase RLS identity', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
  const privateJwk = await exportJWK(privateKey)
  const publicJwk = await exportJWK(publicKey)
  privateJwk.kid = 'wechat-test-key'
  publicJwk.kid = 'wechat-test-key'
  const env = { ...baseEnv, SUPABASE_JWT_PRIVATE_JWK: JSON.stringify(privateJwk) }
  const userId = '00000000-0000-4000-8000-000000000001'
  const token = await mintSupabaseAccessToken(userId, env, new Date('2026-07-15T00:00:00Z'))
  const { payload, protectedHeader } = await jwtVerify(token, publicJwk, {
    issuer: 'https://example.supabase.co/auth/v1',
    audience: 'authenticated',
    currentDate: new Date('2026-07-15T00:10:00Z'),
  })
  assert.equal(protectedHeader.kid, 'wechat-test-key')
  assert.equal(payload.sub, userId)
  assert.equal(payload.role, 'authenticated')
  assert.deepEqual(payload.app_metadata, { provider: 'wechat' })
})
