const { apiBaseUrl } = require('../config')

const SESSION_KEY = 'wanwan_wechat_session'
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

const wxLogin = () => new Promise((resolve, reject) => {
  wx.login({ success: resolve, fail: reject })
})

const exchangeCode = (code) => new Promise((resolve, reject) => {
  wx.request({
    url: `${apiBaseUrl}/api/wechat-auth`,
    method: 'POST',
    data: { code },
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300 && response.data.accessToken) {
        resolve(response.data)
        return
      }
      reject(new Error(response.data?.friendlyMessage || '微信登录失败'))
    },
    fail: reject,
  })
})

const readSession = () => wx.getStorageSync(SESSION_KEY) || null

const loginWithWechat = async () => {
  const loginResult = await wxLogin()
  if (!loginResult.code) throw new Error('微信没有返回登录凭证')
  const session = await exchangeCode(loginResult.code)
  const saved = {
    accessToken: session.accessToken,
    userId: session.userId,
    expiresAt: Date.now() + session.expiresIn * 1000,
  }
  wx.setStorageSync(SESSION_KEY, saved)
  return saved
}

const ensureWechatSession = async () => {
  const session = readSession()
  if (session?.accessToken && session.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return session
  return loginWithWechat()
}

const clearWechatSession = () => wx.removeStorageSync(SESSION_KEY)

module.exports = {
  clearWechatSession,
  ensureWechatSession,
  loginWithWechat,
  readSession,
}
