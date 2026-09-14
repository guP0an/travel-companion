import { useState } from 'react'
import { authenticate, logout, useSession } from '../lib/useSession'

type Mode = 'login' | 'register' | 'recover'

export default function AuthBar() {
  const session = useSession()
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [issuedCode, setIssuedCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const title = mode === 'register' ? '创建丸丸账号' : mode === 'recover' ? '找回密码' : '登录丸丸'
  const switchMode = (next: Mode) => { setMode(next); setMessage(''); setPassword(''); setConfirmPassword(''); setRecoveryCode('') }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setMessage('')
    if (!/^[a-zA-Z0-9]{4,20}$/.test(username)) { setMessage('账号须为 4–20 位英文字母或数字'); return }
    if ([...password].length < 8 || [...password].length > 64) { setMessage('密码须为 8–64 位'); return }
    if (mode !== 'login' && password !== confirmPassword) { setMessage('两次密码不一致'); return }
    setBusy(true)
    try {
      const result = await authenticate(mode, { username, password, ...(mode === 'recover' ? { recoveryCode } : {}) })
      setPassword(''); setConfirmPassword(''); setRecoveryCode('')
      if (result.recoveryCode) setIssuedCode(result.recoveryCode)
      else setExpanded(false)
      if (mode === 'recover') setMessage('密码已重置，旧会话已退出。请保存新的恢复码，再重新登录。')
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  async function signOut() {
    setBusy(true); setMessage('')
    try { await logout() } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  if (session && !issuedCode) return <div className="account-signed">
    <span className="account-label">已登录 · {session.user.username}</span>
    <button onClick={signOut} disabled={busy}>退出</button>
    {message && <span role="alert">{message}</span>}
  </div>

  return <div className="account-control">
    <button className="account-trigger" onClick={() => setExpanded(value => !value)} aria-expanded={expanded || !!issuedCode}>登录 / 注册</button>
    {(expanded || issuedCode) && <div className="auth-popover">
      <div className="auth-panel-head">
        <div><div className="section-eyebrow">WANWAN ACCOUNT</div><div className="auth-panel-title font-serif">{issuedCode ? '请保存恢复码' : title}</div></div>
        {!issuedCode && <button className="icon-close" onClick={() => setExpanded(false)} aria-label="关闭账户面板">×</button>}
      </div>
      {issuedCode ? <div>
        <p className="auth-helper">恢复码只展示这一次。忘记密码时可用它重置；密码和恢复码都丢失，将无法自助找回。请妥善保存，不要告诉他人。</p>
        <textarea aria-label="新恢复码" readOnly value={issuedCode} className="auth-input auth-recovery-code" onFocus={event => event.target.select()} />
        {message && <p role="status">{message}</p>}
        <button className="auth-primary-button" onClick={() => { setIssuedCode(''); setExpanded(false); switchMode('login') }}>我已保存恢复码</button>
      </div> : <form onSubmit={submit}>
        <p className="auth-helper">{mode === 'register' ? '给旅途留一个专属账号。' : mode === 'recover' ? '用保存的恢复码，设置一个新密码。' : '欢迎回来，继续你的旅程。'}</p>
        <div className="auth-fields">
          <label className="auth-field"><span>账号</span><input aria-label="账号" placeholder="字母或数字，4–20 位" aria-describedby="account-name-hint" value={username} onChange={e => setUsername(e.target.value)} pattern="[A-Za-z0-9]{4,20}" minLength={4} maxLength={20} autoCapitalize="none" autoComplete="username" spellCheck={false} required className="auth-input" /><small id="account-name-hint">不区分大小写</small></label>
          <label className="auth-field"><span>{mode === 'recover' ? '新密码' : '密码'}</span><input aria-label={mode === 'recover' ? '新密码' : '密码'} placeholder="8–64 位，可包含符号" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required className="auth-input" /></label>
          {mode !== 'login' && <label className="auth-field"><span>确认密码</span><input aria-label="确认密码" placeholder="再次输入密码" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required className="auth-input" /></label>}
          {mode === 'recover' && <label className="auth-field"><span>恢复码</span><input aria-label="恢复码" placeholder="注册时保存的恢复码" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value.trim())} pattern="[a-fA-F0-9]{64}" maxLength={64} autoComplete="off" required className="auth-input" /></label>}
        </div>
        <div className="auth-actions">
          <button disabled={busy} className="auth-primary-button">{busy ? '处理中…' : mode === 'register' ? '创建账号' : mode === 'recover' ? '重置密码' : '登录'}</button>
          <button type="button" disabled={busy} className="auth-text-button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '注册' : '返回登录'}</button>
          {mode === 'login' && <button type="button" disabled={busy} className="auth-link-button" onClick={() => switchMode('recover')}>忘记密码</button>}
        </div>
        {message && <p className="auth-message" role="alert">{message}</p>}
      </form>}
    </div>}
  </div>
}
