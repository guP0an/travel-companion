const { readSession } = require('./services/auth')

App({
  globalData: {
    session: null,
  },
  onLaunch() {
    this.globalData.session = readSession()
  },
})
