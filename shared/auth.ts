export type AuthMethod = 'phone-otp' | 'phone-password' | 'email'

export function normalizeMainlandPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (/^1[3-9]\d{9}$/.test(digits)) return `+86${digits}`
  if (/^861[3-9]\d{9}$/.test(digits)) return `+${digits}`
  return null
}

export function maskAccount(phone?: string | null, email?: string | null): string {
  if (phone) return phone.replace(/(\+86)(\d{3})\d{4}(\d{4})/, '$1 $2****$3')
  if (email?.endsWith('@wechat.wanwan.invalid')) return '微信用户'
  return email || '丸丸用户'
}

export function getWechatLoginMode(
  userAgent: string,
  availability: { h5: boolean; web: boolean },
): 'h5' | 'web' | null {
  if (/MicroMessenger/i.test(userAgent)) {
    return availability.h5 ? 'h5' : null
  }
  return availability.web ? 'web' : null
}

export function friendlyAuthError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return '账号或密码不正确'
  if (text.includes('user already registered')) return '这个账号已经注册，请直接登录'
  if (text.includes('password should be at least')) return '密码至少需要 6 位'
  if (text.includes('over_sms_send_rate_limit') || text.includes('rate limit')) return '请求太频繁，请稍后再试'
  if (text.includes('phone provider') || text.includes('sms provider') || text.includes('unsupported phone')) {
    return '手机短信服务尚未开通，请暂时使用邮箱登录'
  }
  if (text.includes('token has expired') || text.includes('otp_expired')) return '验证码已过期，请重新获取'
  if (text.includes('invalid token') || text.includes('token is invalid')) return '验证码不正确，请检查后重试'
  return message
}
