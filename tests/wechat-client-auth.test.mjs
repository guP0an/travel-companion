import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../miniprogram/services/auth.js', import.meta.url), 'utf8')
const loginTemplate = readFileSync(new URL('../miniprogram/pages/login/login.wxml', import.meta.url), 'utf8')
const SESSION_KEY = 'wanwan_wechat_session'

function loadAuth({
  stored = null,
  code = 'wx-code-123',
  accessToken = 'access-token',
  userId = 'user-1',
  expiresIn = 3600,
  statusCode = 200,
  friendlyMessage = '微信登录暂时没有成功，请稍后重试',
} = {}) {
  const storage = new Map()
  const storedValues = []
  const requests = []
  let loginCalls = 0
  if (stored) storage.set(SESSION_KEY, stored)

  const wx = {
    login({ success }) {
      loginCalls += 1
      success({ code })
    },
    request(options) {
      requests.push(options)
      options.success({
        statusCode,
        data: statusCode >= 200 && statusCode < 300
          ? { accessToken, userId, expiresIn, session_key: 'must-not-be-stored' }
          : { friendlyMessage },
      })
    },
    getStorageSync(key) {
      return storage.get(key)
    },
    setStorageSync(key, value) {
      storage.set(key, value)
      storedValues.push(value)
    },
    removeStorageSync(key) {
      storage.delete(key)
    },
  }

  const module = { exports: {} }
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier === '../config') return { apiBaseUrl: 'https://wanwantrip.online' }
      throw new Error(`Unexpected require: ${specifier}`)
    },
    wx,
    Date,
    Error,
    Promise,
  }, { filename: 'miniprogram/services/auth.js' })

  return {
    auth: module.exports,
    storage,
    storedValues,
    requests,
    get loginCalls() { return loginCalls },
  }
}

test('expired WeChat sessions are removed and never reported as logged in', () => {
  const fixture = loadAuth({
    stored: { accessToken: 'old', userId: 'user-1', expiresAt: Date.now() - 1 },
  })

  assert.equal(fixture.auth.readSession(), null)
  assert.equal(fixture.storage.has(SESSION_KEY), false)
})

test('a successful wx.login exchange stores only the app session', async () => {
  const fixture = loadAuth()
  const session = await fixture.auth.loginWithWechat()

  assert.equal(session.accessToken, 'access-token')
  assert.equal(session.userId, 'user-1')
  assert.equal('session_key' in session, false)
  assert.equal(fixture.storedValues.length, 1)
  assert.equal('session_key' in fixture.storedValues[0], false)
  assert.equal(fixture.requests[0].url, 'https://wanwantrip.online/api/wechat-auth')
  assert.equal(fixture.requests[0].data.code, 'wx-code-123')
})

test('valid cached sessions avoid a second WeChat login', async () => {
  const fixture = loadAuth({
    stored: { accessToken: 'cached-token', userId: 'user-1', expiresAt: Date.now() + 3600_000 },
  })

  const session = await fixture.auth.ensureWechatSession()

  assert.equal(session.accessToken, 'cached-token')
  assert.equal(fixture.loginCalls, 0)
})

test('authenticated API headers use a valid bearer token', async () => {
  const fixture = loadAuth({
    stored: { accessToken: 'cached-token', userId: 'user-1', expiresAt: Date.now() + 3600_000 },
  })

  const headers = await fixture.auth.getAuthorizationHeader()

  assert.equal(headers.Authorization, 'Bearer cached-token')
})

test('provider failures keep the user logged out and show the friendly message', async () => {
  const fixture = loadAuth({ statusCode: 503, friendlyMessage: '微信服务正在恢复，请稍后重试' })

  await assert.rejects(
    fixture.auth.loginWithWechat(),
    /微信服务正在恢复，请稍后重试/,
  )
  assert.equal(fixture.auth.readSession(), null)
})

test('login page presents one clear WeChat authorization action', () => {
  assert.match(loginTemplate, />\s*微信一键登录\s*</)
  assert.match(loginTemplate, /微信已登录，行程和账本会同步保存/)
})
