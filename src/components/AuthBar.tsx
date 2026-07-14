import { useEffect, useState } from 'react'
import { friendlyAuthError, maskAccount, normalizeMainlandPhone, type AuthMethod } from '../../shared/auth'
import { isPhoneAuthEnabled, supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

const underline: React.CSSProperties = {
  border: 'none',
  borderBottom: '1px solid var(--color-line)',
  background: 'transparent',
  padding: '8px 2px',
  outline: 'none',
  fontSize: '14px',
  color: 'var(--color-ink)',
  minWidth: 0,
}

const primaryButton: React.CSSProperties = {
  background: 'var(--color-qing)',
  color: 'var(--color-paper-2)',
  border: 'none',
  borderRadius: '2px',
  padding: '8px 20px',
  fontSize: '13.5px',
  letterSpacing: '0.08em',
  cursor: 'pointer',
}

type ViewMode = 'login' | 'email-reset' | 'update-password'
type OtpPurpose = 'login' | 'register-password' | 'reset-password'

export default function AuthBar() {
  const session = useSession()
  const [method, setMethod] = useState<AuthMethod>('email')
  const [phoneEnabled, setPhoneEnabled] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [otp, setOtp] = useState('')
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>('login')
  const [countdown, setCountdown] = useState(0)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(() => new URLSearchParams(window.location.search).get('reset') === '1')
  const [mode, setMode] = useState<ViewMode>(() =>
    new URLSearchParams(window.location.search).get('reset') === '1' ? 'update-password' : 'login',
  )

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update-password')
        setExpanded(true)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    isPhoneAuthEnabled().then((enabled) => {
      setPhoneEnabled(enabled)
      if (enabled) setMethod('phone-otp')
    })
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const resetFeedback = () => {
    setMsg('')
    setOtp('')
    setOtpPurpose('login')
  }

  const switchMethod = (next: AuthMethod) => {
    setMethod(next)
    resetFeedback()
  }

  const runBusy = async (action: () => Promise<void>) => {
    setBusy(true)
    setMsg('')
    try {
      await action()
    } catch (error) {
      setMsg(error instanceof Error ? friendlyAuthError(error.message) : '操作失败，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  const requirePhone = () => {
    const normalized = normalizeMainlandPhone(phone)
    if (!normalized) setMsg('请输入正确的中国大陆手机号')
    return normalized
  }

  const sendOtp = async (purpose: OtpPurpose = 'login') => {
    const normalized = requirePhone()
    if (!normalized || countdown > 0) return
    await runBusy(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
        options: { shouldCreateUser: purpose !== 'reset-password' },
      })
      if (error) throw error
      setOtpPurpose(purpose)
      setOtp('')
      setCountdown(60)
      setMsg(purpose === 'reset-password' ? '验证码已发送，验证后可设置新密码' : '验证码已发送，请查看短信')
    })
  }

  const verifyOtp = async () => {
    const normalized = requirePhone()
    if (!normalized) return
    if (!/^\d{6}$/.test(otp)) {
      setMsg('请输入 6 位短信验证码')
      return
    }
    await runBusy(async () => {
      const { error } = await supabase.auth.verifyOtp({ phone: normalized, token: otp, type: 'sms' })
      if (error) throw error
      setOtp('')
      if (otpPurpose === 'reset-password') {
        setPw('')
        setConfirmPw('')
        setMode('update-password')
        setMsg('身份验证成功，请设置新密码')
      } else {
        setMsg(otpPurpose === 'register-password' ? '手机号验证成功，注册完成' : '登录成功')
      }
    })
  }

  const runPasswordAuth = async (kind: 'in' | 'up') => {
    if (pw.length < 6) {
      setMsg('密码至少需要 6 位')
      return
    }
    await runBusy(async () => {
      if (method === 'email') {
        if (!email.trim()) throw new Error('请填写邮箱')
        const result = kind === 'in'
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
          : await supabase.auth.signUp({ email: email.trim(), password: pw })
        if (result.error) throw result.error
        setMsg(kind === 'up' ? '注册成功，请按邮件提示完成验证' : '登录成功')
        return
      }

      const normalized = requirePhone()
      if (!normalized) return
      const result = kind === 'in'
        ? await supabase.auth.signInWithPassword({ phone: normalized, password: pw })
        : await supabase.auth.signUp({ phone: normalized, password: pw })
      if (result.error) throw result.error
      if (kind === 'up' && !result.data.session) {
        setOtpPurpose('register-password')
        setCountdown(60)
        setMsg('注册验证码已发送，请完成手机号验证')
      } else {
        setMsg(kind === 'up' ? '注册并登录成功' : '登录成功')
      }
    })
  }

  const requestEmailReset = async () => {
    if (!email.trim()) {
      setMsg('请先填写注册邮箱')
      return
    }
    await runBusy(async () => {
      const redirectTo = `${window.location.origin}/?reset=1`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) throw error
      setMsg('重置邮件已发送，请检查收件箱和垃圾邮件')
    })
  }

  const updatePassword = async () => {
    if (pw.length < 6) {
      setMsg('新密码至少需要 6 位')
      return
    }
    if (pw !== confirmPw) {
      setMsg('两次输入的密码不一致')
      return
    }
    await runBusy(async () => {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      window.history.replaceState({}, '', window.location.pathname)
      setPw('')
      setConfirmPw('')
      setMsg('密码已更新，可以继续使用丸丸了')
      setMode('login')
    })
  }

  if (session && mode !== 'update-password') {
    return (
      <div className="account-signed">
        <span className="account-label">已登录 · {maskAccount(session.user.phone, session.user.email)}</span>
        <button onClick={() => supabase.auth.signOut()} title="退出当前账号">
          退出
        </button>
      </div>
    )
  }

  const panel = (content: React.ReactNode, title = '登录丸丸') => (
    <div className="account-control">
      <button className="account-trigger" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        {mode === 'update-password' ? '设置密码' : '登录 / 注册'}
      </button>
      {expanded && (
        <div className="auth-popover">
          <div className="auth-panel-head">
            <div>
              <div className="section-eyebrow">WANWAN ACCOUNT</div>
              <div className="auth-panel-title font-serif">{title}</div>
            </div>
            <button className="icon-close" onClick={() => setExpanded(false)} title="关闭账户面板" aria-label="关闭账户面板">×</button>
          </div>
          {content}
        </div>
      )}
    </div>
  )

  if (mode === 'update-password') {
    return panel(
      <div>
        <div className="auth-helper">设置一个新的登录密码</div>
        <div className="auth-fields">
          <input value={pw} onChange={(event) => setPw(event.target.value)} type="password" autoComplete="new-password" placeholder="新密码（至少 6 位）" style={underline} />
          <input value={confirmPw} onChange={(event) => setConfirmPw(event.target.value)} type="password" autoComplete="new-password" placeholder="再输入一次" style={underline} />
        </div>
        <div className="auth-actions">
          <button onClick={updatePassword} disabled={busy} className="font-serif disabled:opacity-60" style={primaryButton}>更新密码</button>
          {msg && <span className="auth-message">{msg}</span>}
        </div>
      </div>,
      '设置新密码',
    )
  }

  if (mode === 'email-reset') {
    return panel(
      <div>
        <div className="auth-helper">输入注册邮箱，丸丸会发一封重置邮件</div>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="注册邮箱" style={{ ...underline, width: '100%' }} />
        <div className="auth-actions">
          <button onClick={requestEmailReset} disabled={busy} className="font-serif disabled:opacity-60" style={primaryButton}>发送重置邮件</button>
          <button onClick={() => { setMode('login'); setMsg('') }} className="auth-text-button">返回登录</button>
          {msg && <span className="auth-message">{msg}</span>}
        </div>
      </div>,
      '找回密码',
    )
  }

  const showOtpInput = method === 'phone-otp' || otpPurpose === 'register-password' || otpPurpose === 'reset-password'

  return panel(
    <div>
      <div className="auth-helper">登录后行程存到云端 · 跨设备可见</div>
      <div className="auth-tabs" role="tablist" aria-label="登录方式">
        {([
          ['phone-otp', '手机验证码'],
          ['phone-password', '手机密码'],
          ['email', '邮箱'],
        ] as Array<[AuthMethod, string]>).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={method === value}
            aria-disabled={value !== 'email' && !phoneEnabled}
            disabled={value !== 'email' && !phoneEnabled}
            className={method === value ? 'active' : ''}
            onClick={() => switchMethod(value)}
            title={value !== 'email' && !phoneEnabled ? '短信服务配置完成后开放' : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {!phoneEnabled && <div className="auth-availability">手机登录待短信服务审核通过后开放</div>}

      <div className="auth-fields">
        {method === 'email' ? (
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="邮箱" style={underline} />
        ) : (
          <div className="auth-phone-field">
            <span>+86</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="手机号" style={underline} />
          </div>
        )}
        {method !== 'phone-otp' && otpPurpose === 'login' && (
          <input value={pw} onChange={(event) => setPw(event.target.value)} type="password" autoComplete={method === 'email' ? 'current-password' : 'current-password'} placeholder="密码（至少 6 位）" style={underline} />
        )}
        {showOtpInput && (
          <div className="auth-code-field">
            <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 位验证码" style={underline} />
            <button onClick={() => sendOtp(otpPurpose)} disabled={busy || countdown > 0} className="auth-code-button">
              {countdown > 0 ? `${countdown}s` : '获取验证码'}
            </button>
          </div>
        )}
      </div>

      <div className="auth-actions">
        {showOtpInput ? (
          <button onClick={verifyOtp} disabled={busy} className="font-serif disabled:opacity-60" style={primaryButton}>验证并登录</button>
        ) : (
          <>
            <button onClick={() => runPasswordAuth('in')} disabled={busy} className="font-serif disabled:opacity-60" style={primaryButton}>登录</button>
            <button onClick={() => runPasswordAuth('up')} disabled={busy} className="font-serif disabled:opacity-60 auth-text-button">注册</button>
          </>
        )}
        {method === 'email' && (
          <button onClick={() => { setMode('email-reset'); setMsg(''); setPw('') }} className="auth-link-button">忘记密码</button>
        )}
        {method === 'phone-password' && otpPurpose === 'login' && (
          <button onClick={() => sendOtp('reset-password')} disabled={busy || countdown > 0} className="auth-link-button">忘记密码</button>
        )}
        {msg && <span className="auth-message">{msg}</span>}
      </div>
    </div>,
  )
}
