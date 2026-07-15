const { loginWithWechat, readSession } = require('../../services/auth')

Page({
  data: {
    busy: false,
    loggedIn: false,
    message: '',
  },
  onLoad() {
    this.setData({ loggedIn: Boolean(readSession()?.accessToken) })
  },
  async handleLogin() {
    if (this.data.busy) return
    this.setData({ busy: true, message: '' })
    try {
      const session = await loginWithWechat()
      getApp().globalData.session = session
      this.setData({ loggedIn: true, message: '登录成功' })
    } catch (error) {
      this.setData({ message: error.message || '微信登录失败，请稍后再试' })
    } finally {
      this.setData({ busy: false })
    }
  },
})
